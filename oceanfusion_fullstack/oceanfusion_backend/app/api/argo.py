import os
import numpy as np
from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from app.config import settings
from app.schemas.api_models import ArgoListResponse, ArgoPoint, ArgoProfileResponse
from app.services import qc
from app.services.netcdf_reader import get_dataset
from app.services.observation_adapter import get_floats_for_region, get_observed_value

router = APIRouter(prefix="/api/argo", tags=["argo"])


@router.get("", response_model=ArgoListResponse)
def list_floats(
    region: str = Query(settings.DEFAULT_REGION),
    lat_min: float = Query(None),
    lat_max: float = Query(None),
    lon_min: float = Query(None),
    lon_max: float = Query(None),
):
    """Observation points in the selected region -- goes through the
    ObservationAdapter so the source (synthetic today, real ERDDAP later)
    is invisible here."""
    bbox = settings.region_bbox(region)
    lat_min = bbox["lat_min"] if lat_min is None else lat_min
    lat_max = bbox["lat_max"] if lat_max is None else lat_max
    lon_min = bbox["lon_min"] if lon_min is None else lon_min
    lon_max = bbox["lon_max"] if lon_max is None else lon_max
    qc.check_bbox_size(lat_min, lat_max, lon_min, lon_max)

    floats = get_floats_for_region({
        "region": region, "lat_min": lat_min, "lat_max": lat_max,
        "lon_min": lon_min, "lon_max": lon_max,
    })
    points = [ArgoPoint(id=f["id"], lat=f["lat"], lon=f["lon"],
                         last_cycle_day=f["last_cycle_day"], source=f["source"])
              for f in floats]
    return ArgoListResponse(count=len(points), region=region, floats=points)


@router.post("/upload")
async def upload_csv(file: UploadFile = File(...)):
    """Upload a new ARGO CSV dataset file."""
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")
    os.makedirs(data_dir, exist_ok=True)
    target_path = os.path.join(data_dir, "Indian_ARGO_Floats.csv")

    content = await file.read()
    with open(target_path, "wb") as f:
        f.write(content)

    settings.ARGO_SOURCE = "csv"
    floats = get_floats_for_region({})
    return {"message": "CSV dataset uploaded successfully", "filename": file.filename, "floats_count": len(floats)}


@router.get("/{float_id}", response_model=ArgoProfileResponse)
def float_profile(
    float_id: str,
    variable: str = Query("temp", pattern="^(temp|sal)$"),
    day: int = Query(1, ge=1, le=settings.N_DAYS),
    region: str = Query(settings.DEFAULT_REGION),
):
    """One float's full depth profile, plus the model's profile at the same
    lat/lon/day, so the frontend can plot both on one chart (guide's
    'Depth vs temperature/salinity graph' control)."""
    floats = get_floats_for_region({"region": region})
    match = next((f for f in floats if str(f["id"]) == str(float_id)), None)
    is_glider = False
    if match is None:
        from app.services.glider_service import get_glider_by_id
        glider_obj = get_glider_by_id(float_id)
        if glider_obj:
            match = glider_obj
            is_glider = True
        else:
            raise HTTPException(status_code=404, detail=f"Platform {float_id} not found in current region")

    ds = get_dataset(region)
    from app.api.model import resolve_var_name
    var_name = resolve_var_name(ds, variable)

    field = ds[var_name]
    if "time" in field.coords:
        n_times = field.sizes["time"]
        t_idx = min(max(day - 1, 0), n_times - 1)
        field = field.isel(time=t_idx)
    elif "day" in field.coords:
        nearest_day = int(field["day"].sel(day=day, method="nearest").values)
        field = field.sel(day=nearest_day)

    clamped_lat = float(np.clip(match["lat"], float(ds.lat.min().values), float(ds.lat.max().values)))
    clamped_lon = float(np.clip(match["lon"], float(ds.lon.min().values), float(ds.lon.max().values)))

    observed, model_vals = [], []
    from app.services.synthetic_data import _temperature, _salinity
    from app.services.glider_service import get_glider_observed_value

    for depth in settings.DEPTH_LEVELS:
        if is_glider:
            observed.append(get_glider_observed_value(variable, match, depth, day, region))
        else:
            observed.append(get_observed_value(variable, match, depth, day, region))

        val_near = field.sel(lat=clamped_lat, lon=clamped_lon, method="nearest")
        if "depth" in val_near.coords:
            val_near = val_near.sel(depth=depth, method="nearest")
        m_val = float(val_near.values) if val_near.values.size == 1 else float(val_near.values.flat[0])

        if np.isnan(m_val) or m_val == 0.0:
            # Spatial neighbourhood fallback for land mask / NaNs
            try:
                sub = field.sel(lat=slice(clamped_lat - 1.5, clamped_lat + 1.5), lon=slice(clamped_lon - 1.5, clamped_lon + 1.5))
                if "depth" in sub.coords:
                    sub = sub.sel(depth=depth, method="nearest")
                valid_vals = sub.values[~np.isnan(sub.values) & (sub.values != 0.0)]
                if len(valid_vals) > 0:
                    m_val = float(valid_vals[0])
                else:
                    m_val = float(_temperature(clamped_lat, clamped_lon, depth, day) if variable == "temp" else _salinity(clamped_lat, clamped_lon, depth, day))
            except Exception:
                m_val = float(_temperature(clamped_lat, clamped_lon, depth, day) if variable == "temp" else _salinity(clamped_lat, clamped_lon, depth, day))

        model_vals.append(round(m_val, 4))

    return ArgoProfileResponse(
        id=str(match["id"]), lat=match["lat"], lon=match["lon"], day=day,
        depths=settings.DEPTH_LEVELS, observed=observed, model=model_vals, variable=variable,
    )

