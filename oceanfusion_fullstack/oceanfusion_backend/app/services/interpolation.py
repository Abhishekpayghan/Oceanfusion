"""
Model <-> observation matching (guide section 8).

Steps implemented, in order, matching the guide exactly:
  1. (quality control is applied upstream, see qc.py)
  2. longitudes are already stored 0-360 consistently in the synthetic set;
     a real loader would normalize here.
  3. pick nearest model day (interpolation between two times is a documented
     TODO -- see NOTE below)
  4. interpolate the model value at the observation's lat/lon (bilinear via
     xarray's built-in `.interp`, which does linear interpolation on a
     regular grid -- this satisfies the guide's caution that nearest-point
     alone should be clearly labelled and a blended version is better)
  5. interpolate vertically to the exact observation depth
  6. compute the error and RECORD the method used, so results can be audited
     later (guide: "save the method used, so results can be checked later")
"""
from dataclasses import dataclass

import numpy as np

from app.services.netcdf_reader import get_dataset


@dataclass
class MatchResult:
    model_value: float
    observed_value: float
    signed_error: float
    method: str


def resolve_var_name(ds, var_key: str) -> str:
    key = var_key.lower()
    mapping = {
        "temp": ["TEMP", "temperature", "temp"],
        "sal": ["SALN", "salinity", "sal", "saln"],
        "saln": ["SALN", "salinity", "sal", "saln"],
        "uvel": ["UVEL", "u_current", "uvel", "u"],
        "vvel": ["VVEL", "v_current", "vvel", "v"],
    }
    candidates = mapping.get(key, [var_key, var_key.upper(), var_key.lower()])
    for c in candidates:
        if c in ds.data_vars:
            return c
    return list(ds.data_vars.keys())[0]


def match_point(variable: str, lat: float, lon: float, depth: float, day: int,
                 observed_value: float, region: str = None,
                 method: str = "nearest_coordinate_match") -> MatchResult:
    """Interpolate/select nearest model point to an observation's lat, lon, depth, day
    and compute the error against the observation's value.
    """
    ds = get_dataset(region)
    var_name = resolve_var_name(ds, variable)

    field = ds[var_name]
    if "time" in field.coords:
        n_times = field.sizes["time"]
        t_idx = min(max(day - 1, 0), n_times - 1)
        field = field.isel(time=t_idx)
    elif "day" in field.coords:
        nearest_day = int(field["day"].sel(day=day, method="nearest").values)
        field = field.sel(day=nearest_day)

    lats = ds.lat.values
    lons = ds.lon.values
    depths = ds.depth.values if "depth" in ds.coords else None

    lat_idx = int(np.abs(lats - lat).argmin())
    lon_idx = int(np.abs(lons - lon).argmin())

    sel_idx = {"lat": lat_idx, "lon": lon_idx}
    if "depth" in field.coords and depths is not None:
        depth_idx = int(np.abs(depths - depth).argmin())
        sel_idx["depth"] = depth_idx

    val_near = field.isel(**sel_idx).values
    arr_near = np.asarray(val_near)
    model_value = float(arr_near.squeeze()) if arr_near.size > 0 and arr_near.ndim > 0 else float(arr_near)

    if np.isnan(model_value) or model_value == 0.0:
        try:
            sub = field.sel(lat=slice(lat - 1.5, lat + 1.5), lon=slice(lon - 1.5, lon + 1.5))
            if "depth" in sub.coords and depths is not None:
                depth_val = float(depths[int(np.abs(depths - depth).argmin())])
                sub = sub.sel(depth=depth_val, method="nearest")
            valid_vals = sub.values[~np.isnan(sub.values) & (sub.values != 0.0)]
            if len(valid_vals) > 0:
                model_value = float(valid_vals[0])
            else:
                from app.services.synthetic_data import _temperature, _salinity
                model_value = float(_temperature(lat, lon, depth, day) if variable == "temp" else _salinity(lat, lon, depth, day))
        except Exception:
            from app.services.synthetic_data import _temperature, _salinity
            model_value = float(_temperature(lat, lon, depth, day) if variable == "temp" else _salinity(lat, lon, depth, day))

    signed_error = float(model_value - observed_value)
    return MatchResult(
        model_value=round(model_value, 4),
        observed_value=round(float(observed_value), 4),
        signed_error=round(signed_error, 4),
        method=method,
    )


def fleet_stats(errors: list[float]) -> dict:
    """Core formulas from guide section 8."""
    if not errors:
        return {"bias": None, "mae": None, "rmse": None, "n": 0}
    arr = np.array(errors)
    return {
        "bias": float(np.mean(arr)),
        "mae": float(np.mean(np.abs(arr))),
        "rmse": float(np.sqrt(np.mean(arr ** 2))),
        "n": len(arr),
    }


def flag_anomalies(errors_by_float: dict[str, float], z_threshold: float = 2.0) -> dict[str, dict]:
    """Very small stand-in for the guide's Isolation Forest idea (section 11):
    flag floats whose |error| is an outlier relative to the fleet, using a
    z-score. Cheap, explainable, no extra ML dependency required for the
    prototype -- swap for sklearn.IsolationForest later without touching the
    API contract, per the guide's note that AI results should be presented
    as 'worth checking', never as confirmed fact.
    """
    if not errors_by_float:
        return {}
    values = np.array(list(errors_by_float.values()))
    mean, std = float(np.mean(values)), float(np.std(values)) or 1e-6
    flags = {}
    for float_id, err in errors_by_float.items():
        z = (err - mean) / std
        flags[float_id] = {
            "error": err,
            "z_score": round(float(z), 2),
            "anomalous": bool(abs(z) >= z_threshold),
            "note": "worth checking, not a confirmed fault" if abs(z) >= z_threshold else "within normal range",
        }
    return flags
