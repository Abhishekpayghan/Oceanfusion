from typing import Optional
import numpy as np
from fastapi import APIRouter, HTTPException, Query

from app.config import settings
from app.schemas.api_models import CurrentsResponse, SliceResponse, VolumeLevel, VolumeResponse
from app.services.netcdf_reader import get_dataset

router = APIRouter(prefix="/api/model", tags=["model"])


def resolve_var_name(ds, var_key: str) -> str:
    key = var_key.lower()
    mapping = {
        "temp": ["TEMP", "temperature", "temp", "thetao"],
        "temperature": ["TEMP", "temperature", "temp", "thetao"],
        "sal": ["SALN", "salinity", "sal", "saln", "so"],
        "saln": ["SALN", "salinity", "sal", "saln", "so"],
        "salinity": ["SALN", "salinity", "sal", "saln", "so"],
        "uvel": ["UVEL", "u_current", "uvel", "u", "uo"],
        "vvel": ["VVEL", "v_current", "vvel", "v", "vo"],
        "u": ["UVEL", "u_current", "uvel", "u", "uo"],
        "v": ["VVEL", "v_current", "vvel", "v", "vo"],
    }
    candidates = mapping.get(key, [var_key, var_key.upper(), var_key.lower()])
    for c in candidates:
        if c in ds.data_vars:
            return c
    return list(ds.data_vars.keys())[0]


def _get_nearest_time_idx(ds, day: int = 1) -> int:
    if "time" in ds.coords:
        n_times = ds.sizes["time"]
        return min(max(day - 1, 0), n_times - 1)
    elif "day" in ds.coords:
        return int(ds["day"].sel(day=day, method="nearest").values)
    return 0


def _get_region_subdataset(ds, region: str, lat_min: Optional[float] = None, lat_max: Optional[float] = None, lon_min: Optional[float] = None, lon_max: Optional[float] = None):
    if lat_min is not None and lat_max is not None and lon_min is not None and lon_max is not None:
        if lat_min < settings.HYCOM_LAT_MIN or lat_max > settings.HYCOM_LAT_MAX or lon_min < settings.HYCOM_LON_MIN or lon_max > settings.HYCOM_LON_MAX:
            raise HTTPException(
                status_code=400,
                detail="Selected region is outside the available HYCOM data domain. Please select an area within: 30°S–30°N and 30°E–120°E.",
            )
        bbox = {"lat_min": lat_min, "lat_max": lat_max, "lon_min": lon_min, "lon_max": lon_max}
    else:
        bbox = settings.region_bbox(region)

    if "lat" in ds.coords and "lon" in ds.coords:
        b_lat_min, b_lat_max = bbox["lat_min"], bbox["lat_max"]
        b_lon_min, b_lon_max = bbox["lon_min"], bbox["lon_max"]
        ds_lat_min, ds_lat_max = float(ds["lat"].min()), float(ds["lat"].max())
        ds_lon_min, ds_lon_max = float(ds["lon"].min()), float(ds["lon"].max())

        sub_lat_min = max(b_lat_min, ds_lat_min)
        sub_lat_max = min(b_lat_max, ds_lat_max)
        sub_lon_min = max(b_lon_min, ds_lon_min)
        sub_lon_max = min(b_lon_max, ds_lon_max)

        if sub_lat_min < sub_lat_max and sub_lon_min < sub_lon_max:
            ds_sub = ds.sel(lat=slice(sub_lat_min, sub_lat_max), lon=slice(sub_lon_min, sub_lon_max))
            if ds_sub.sizes.get("lat", 0) > 1 and ds_sub.sizes.get("lon", 0) > 1:
                return ds_sub
    return ds


def _downsample_coords(region: str, lat_min: Optional[float] = None, lat_max: Optional[float] = None, lon_min: Optional[float] = None, lon_max: Optional[float] = None):
    ds = get_dataset(region)
    ds_sub = _get_region_subdataset(ds, region, lat_min, lat_max, lon_min, lon_max)

    n_lat = ds_sub.sizes["lat"]
    n_lon = ds_sub.sizes["lon"]

    lat_idx = np.linspace(0, n_lat - 1, min(settings.SLICE_GRID_RES, n_lat)).astype(int)
    lon_idx = np.linspace(0, n_lon - 1, min(settings.SLICE_GRID_RES, n_lon)).astype(int)
    return ds_sub, lat_idx, lon_idx


@router.get("/slice", response_model=SliceResponse)
def model_slice(
    variable: str = Query("temp", pattern="^(temp|sal|saln|uvel|vvel|u|v|temperature|salinity|currents|current|speed|velocity)$"),
    depth: float = Query(0, ge=0, le=settings.DEPTH_MAX),
    day: int = Query(1, ge=1, le=settings.N_DAYS),
    region: str = Query(settings.DEFAULT_REGION),
    latitude: Optional[float] = Query(None),
    longitude: Optional[float] = Query(None),
    lat_min: Optional[float] = Query(None),
    lat_max: Optional[float] = Query(None),
    lon_min: Optional[float] = Query(None),
    lon_max: Optional[float] = Query(None),
):
    """A depth/time slice of the model grid -- capped server-side for efficiency."""
    if lat_min is not None and lat_max is not None and lon_min is not None and lon_max is not None:
        region = f"custom_{lat_min}_{lat_max}_{lon_min}_{lon_max}"

    ds_sub, lat_idx, lon_idx = _downsample_coords(region, lat_min, lat_max, lon_min, lon_max)
    var_key = variable.lower()

    if var_key in ["currents", "current", "speed", "velocity"]:
        u_var = resolve_var_name(ds_sub, "uvel")
        v_var = resolve_var_name(ds_sub, "vvel")
        u_field = ds_sub[u_var]
        v_field = ds_sub[v_var]
        if "depth" in u_field.coords:
            u_field = u_field.sel(depth=depth, method="nearest")
            v_field = v_field.sel(depth=depth, method="nearest")
        if "time" in u_field.coords:
            t_idx = _get_nearest_time_idx(u_field, day=day)
            u_field = u_field.isel(time=t_idx)
            v_field = v_field.isel(time=t_idx)
        elif "day" in u_field.coords:
            t_idx = _get_nearest_time_idx(u_field, day=day)
            u_field = u_field.sel(day=t_idx)
            v_field = v_field.sel(day=t_idx)

        u_slice = u_field.isel(lat=lat_idx, lon=lon_idx).values
        v_slice = v_field.isel(lat=lat_idx, lon=lon_idx).values
        raw_vals = np.sqrt(u_slice**2 + v_slice**2)
        clean_vals = np.nan_to_num(raw_vals, nan=0.0).tolist()
        vmin = float(np.nanmin(raw_vals)) if not np.all(np.isnan(raw_vals)) else 0.0
        vmax = float(np.nanmax(raw_vals)) if not np.all(np.isnan(raw_vals)) else 0.0

        lats = ds_sub["lat"].values[lat_idx].tolist()
        lons = ds_sub["lon"].values[lon_idx].tolist()

        return SliceResponse(
            variable=variable, depth=depth, day=day, region=region,
            lats=lats, lons=lons,
            values=clean_vals, vmin=vmin, vmax=vmax,
            units="m/s",
            source=settings.MODEL_SOURCE,
        )

    var_name = resolve_var_name(ds_sub, variable)

    if "depth" in ds_sub.coords:
        field = ds_sub[var_name].sel(depth=depth, method="nearest")
    else:
        field = ds_sub[var_name]

    if "time" in field.coords:
        t_idx = _get_nearest_time_idx(field, day=day)
        field = field.isel(time=t_idx)
    elif "day" in field.coords:
        t_idx = _get_nearest_time_idx(field, day=day)
        field = field.sel(day=t_idx)

    if latitude is not None and longitude is not None:
        point_val = float(field.sel(lat=latitude, lon=longitude, method="nearest").values)
        units = "m/s" if "vel" in variable.lower() or variable.lower() in ["u", "v"] else ("degC" if "temp" in variable.lower() else "PSU")
        return SliceResponse(
            variable=variable, depth=depth, day=day, region=region,
            lats=[float(field.sel(lat=latitude, method="nearest").lat.values)],
            lons=[float(field.sel(lon=longitude, method="nearest").lon.values)],
            values=[[point_val]], vmin=point_val, vmax=point_val,
            units=units,
            source=settings.MODEL_SOURCE,
        )

    field_slice = field.isel(lat=lat_idx, lon=lon_idx)
    raw_vals = field_slice.values
    clean_vals = np.nan_to_num(raw_vals, nan=0.0).tolist()

    vmin = float(np.nanmin(raw_vals)) if not np.all(np.isnan(raw_vals)) else 0.0
    vmax = float(np.nanmax(raw_vals)) if not np.all(np.isnan(raw_vals)) else 0.0

    lats = ds_sub["lat"].values[lat_idx].tolist()
    lons = ds_sub["lon"].values[lon_idx].tolist()

    units = "degC"
    if "sal" in variable.lower():
        units = "PSU"
    elif "vel" in variable.lower() or variable.lower() in ["u", "v"]:
        units = "m/s"

    return SliceResponse(
        variable=variable, depth=depth, day=day, region=region,
        lats=lats, lons=lons,
        values=clean_vals, vmin=vmin, vmax=vmax,
        units=units,
        source=settings.MODEL_SOURCE,
    )


@router.get("/volume", response_model=VolumeResponse)
def model_volume(
    variable: str = Query("temp", pattern="^(temp|sal|saln|uvel|vvel|u|v|temperature|salinity)$"),
    day: int = Query(1, ge=1, le=settings.N_DAYS),
    region: str = Query(settings.DEFAULT_REGION),
):
    """A full 3D block (all standard depth levels) for one day."""
    ds_sub, lat_idx, lon_idx = _downsample_coords(region)
    var_name = resolve_var_name(ds_sub, variable)

    field = ds_sub[var_name]
    if "time" in field.coords:
        t_idx = _get_nearest_time_idx(field, day=day)
        field = field.isel(time=t_idx)
    elif "day" in field.coords:
        t_idx = _get_nearest_time_idx(field, day=day)
        field = field.sel(day=t_idx)

    levels = []
    depth_values = ds_sub["depth"].values if "depth" in ds_sub.coords else settings.DEPTH_LEVELS
    for d in depth_values:
        d_val = float(d)
        if "depth" in field.coords:
            sub_field = field.sel(depth=d_val, method="nearest").isel(lat=lat_idx, lon=lon_idx)
        else:
            sub_field = field.isel(lat=lat_idx, lon=lon_idx)
        clean_vals = np.nan_to_num(sub_field.values, nan=0.0).tolist()
        levels.append(VolumeLevel(depth=d_val, values=clean_vals))

    lats = ds_sub["lat"].values[lat_idx].tolist()
    lons = ds_sub["lon"].values[lon_idx].tolist()

    units = "degC" if "temp" in variable.lower() else ("PSU" if "sal" in variable.lower() else "m/s")

    return VolumeResponse(
        variable=variable, day=day, region=region,
        lats=lats, lons=lons,
        levels=levels,
        units=units,
    )


@router.get("/currents", response_model=CurrentsResponse)
def model_currents(
    day: int = Query(1, ge=1, le=settings.N_DAYS),
    region: str = Query(settings.DEFAULT_REGION),
    depth: float = Query(0, ge=0, le=settings.DEPTH_MAX),
):
    ds_sub, lat_idx, lon_idx = _downsample_coords(region)
    u_var = resolve_var_name(ds_sub, "uvel")
    v_var = resolve_var_name(ds_sub, "vvel")

    u_field = ds_sub[u_var]
    v_field = ds_sub[v_var]

    if "depth" in u_field.coords:
        u_field = u_field.sel(depth=depth, method="nearest")
        v_field = v_field.sel(depth=depth, method="nearest")

    if "time" in u_field.coords:
        t_idx = _get_nearest_time_idx(u_field, day=day)
        u_field = u_field.isel(time=t_idx)
        v_field = v_field.isel(time=t_idx)
    elif "day" in u_field.coords:
        t_idx = _get_nearest_time_idx(u_field, day=day)
        u_field = u_field.sel(day=t_idx)
        v_field = v_field.sel(day=t_idx)

    u_slice = u_field.isel(lat=lat_idx, lon=lon_idx)
    v_slice = v_field.isel(lat=lat_idx, lon=lon_idx)

    u_clean = np.nan_to_num(u_slice.values, nan=0.0).tolist()
    v_clean = np.nan_to_num(v_slice.values, nan=0.0).tolist()

    return CurrentsResponse(
        day=day, region=region,
        lats=ds_sub["lat"].values[lat_idx].tolist(),
        lons=ds_sub["lon"].values[lon_idx].tolist(),
        u=u_clean, v=v_clean,
    )

