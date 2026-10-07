import os
import pandas as pd
import numpy as np
from typing import Optional

from app.config import settings
from app.services.observation_adapter import get_floats_for_region, get_observed_value
from app.services.netcdf_reader import get_subset
from app.services import interpolation
from app.ml.train import train_isolation_forest, MODEL_PATH, FEATURE_NAMES, TRAINING_CSV_PATH
from app.ml.predict import is_model_trained, predict_anomalies

PROCESSED_DATA_DIR = os.path.normpath(
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "processed")
)
RESULTS_CSV_PATH = os.path.join(PROCESSED_DATA_DIR, "anomaly_results.csv")


def _find_coord_name(candidates: list[str], container) -> Optional[str]:
    """Find matching coordinate name from container handling upper/lower case."""
    for c in candidates:
        if c in container:
            return c
    return None


def extract_scalar_from_array(
    arr: Optional[np.ndarray],
    dims: tuple,
    coords_dict: dict,
    day: int,
    depth: float,
    lat: float,
    lon: float
) -> Optional[float]:
    """Extract a genuine scalar float from a 3D/4D numpy array by inspecting dimension names and axis order.
    Returns None for missing/NaN values. NEVER converts NaN to 0.0.
    """
    if arr is None or arr.size == 0:
        return None

    slice_indices = []
    for axis, dim in enumerate(dims):
        d_lower = str(dim).lower()
        if d_lower in ["time", "day"]:
            t_idx = min(max(day - 1, 0), arr.shape[axis] - 1)
            slice_indices.append(t_idx)
        elif d_lower == "depth":
            depth_vals = coords_dict.get("depth", np.array([0.0]))
            d_idx = int(np.abs(depth_vals - depth).argmin()) if len(depth_vals) > 0 else 0
            slice_indices.append(min(d_idx, arr.shape[axis] - 1))
        elif d_lower in ["lat", "latitude"]:
            lat_vals = coords_dict.get("lat", np.array([0.0]))
            y_idx = int(np.abs(lat_vals - lat).argmin()) if len(lat_vals) > 0 else 0
            slice_indices.append(min(y_idx, arr.shape[axis] - 1))
        elif d_lower in ["lon", "longitude"]:
            lon_vals = coords_dict.get("lon", np.array([0.0]))
            x_idx = int(np.abs(lon_vals - lon).argmin()) if len(lon_vals) > 0 else 0
            slice_indices.append(min(x_idx, arr.shape[axis] - 1))
        else:
            slice_indices.append(0)

    try:
        val = arr[tuple(slice_indices)]
        f_val = float(val)
        if np.isnan(f_val):
            return None
        return f_val
    except Exception:
        return None


_VAR_NUMPY_CACHE = {}


from app.services.common_adapter import CommonObservationAdapter

def generate_comparison_dataset(
    regions: Optional[list[str]] = None,
    days: Optional[list[int]] = None,
    depths: Optional[list[float]] = None
) -> list[dict]:
    """Generate model-vs-observation comparison records across regions/days/depths consuming standardized Common Schema observations."""
    target_regions = regions or list(settings.REGIONS.keys())
    target_days = days or [1, 7, 14]
    target_depths = depths or [0, 100, 500]

    records = []

    for reg in target_regions:
        ds = interpolation.get_dataset(reg)

        # Discover coordinate names
        lat_name = _find_coord_name(["lat", "LAT", "latitude", "LATITUDE"], ds.coords)
        lon_name = _find_coord_name(["lon", "LON", "longitude", "LONGITUDE"], ds.coords)
        depth_name = _find_coord_name(["depth", "DEPTH"], ds.coords)
        time_name = _find_coord_name(["time", "TIME", "day", "DAY"], ds.coords)

        lats = ds[lat_name].values if lat_name else np.array([])
        lons = ds[lon_name].values if lon_name else np.array([])
        depth_vals = ds[depth_name].values if depth_name else np.array([0.0])

        var_temp = interpolation.resolve_var_name(ds, "temp")
        var_sal = interpolation.resolve_var_name(ds, "sal")
        var_u = interpolation.resolve_var_name(ds, "uvel")
        var_v = interpolation.resolve_var_name(ds, "vvel")

        for day in target_days:
            t_idx = min(max(day - 1, 0), ds.sizes.get(time_name, 1) - 1) if time_name and time_name in ds.dims else 0

            for depth in target_depths:
                dl = float(min(settings.DEPTH_LEVELS, key=lambda d: abs(d - depth)))
                d_idx = int(np.abs(depth_vals - dl).argmin()) if len(depth_vals) > 0 else 0

                sel_kwargs = {}
                if time_name and time_name in ds.dims:
                    sel_kwargs[time_name] = t_idx
                if depth_name and depth_name in ds.dims:
                    sel_kwargs[depth_name] = d_idx

                sub = ds[[var_temp, var_sal, var_u, var_v]].isel(**sel_kwargs)

                t_mat = np.asarray(sub[var_temp].values)
                s_mat = np.asarray(sub[var_sal].values)
                u_mat = np.asarray(sub[var_u].values)
                v_mat = np.asarray(sub[var_v].values)

                # Fetch unified common schema observations
                unified_obs = CommonObservationAdapter.get_unified_observations(
                    region=reg, depth=dl, day=day, include_argo=True, include_gliders=True
                )

                for u_obs in unified_obs:
                    fid = u_obs["platform_id"]
                    lat, lon = u_obs["latitude"], u_obs["longitude"]
                    obs_temp = u_obs["temperature"]
                    obs_sal = u_obs["salinity"]
                    data_source = u_obs["source"]
                    is_synth = bool("SYNTHETIC" in data_source or "SYNTH" in data_source)

                    y_idx = int(np.abs(lats - lat).argmin()) if len(lats) > 0 else 0
                    x_idx = int(np.abs(lons - lon).argmin()) if len(lons) > 0 else 0

                    # Extract values from 2D slice
                    m_temp = float(t_mat[y_idx, x_idx]) if t_mat.ndim == 2 else float(t_mat.squeeze())
                    m_sal = float(s_mat[y_idx, x_idx]) if s_mat.ndim == 2 else float(s_mat.squeeze())
                    u_val = float(u_mat[y_idx, x_idx]) if u_mat.ndim == 2 else float(u_mat.squeeze())
                    v_val = float(v_mat[y_idx, x_idx]) if v_mat.ndim == 2 else float(v_mat.squeeze())

                    if np.isnan(m_temp) or np.isnan(m_sal):
                        continue

                    temp_diff = round(float(m_temp - obs_temp), 4) if obs_temp is not None else None
                    sal_diff = round(float(m_sal - obs_sal), 4) if obs_sal is not None else None
                    current_speed = round(float(np.sqrt(u_val**2 + v_val**2)), 3)

                    records.append({
                        "platform_number": str(fid),
                        "cycle_number": day,
                        "time": u_obs.get("time", f"Day {day}"),
                        "latitude": round(lat, 4),
                        "longitude": round(lon, 4),
                        "depth": float(dl),
                        "argo_temp": round(float(obs_temp), 4) if obs_temp is not None else None,
                        "model_temp": round(float(m_temp), 4),
                        "temp_difference": temp_diff,
                        "argo_salinity": round(float(obs_sal), 4) if obs_sal is not None else None,
                        "model_salinity": round(float(m_sal), 4),
                        "salinity_difference": sal_diff,
                        "model_uvel": round(float(u_val), 3),
                        "model_vvel": round(float(v_val), 3),
                        "current_speed": current_speed,
                        "data_source": data_source,
                        "synthetic": is_synth,
                        "region": reg,
                        "synthetic_test_anomaly": False,
                    })

    return records




def train_anomaly_model() -> dict:
    """Build dataset and train Isolation Forest model."""
    dataset = generate_comparison_dataset()
    report = train_isolation_forest(dataset)
    return report


def get_anomaly_status() -> dict:
    """Return model training status and metadata."""
    trained = is_model_trained()
    trained_rows = 0
    real_rows = 0
    synthetic_rows = 0

    if trained and os.path.exists(TRAINING_CSV_PATH):
        try:
            df = pd.read_csv(TRAINING_CSV_PATH)
            trained_rows = len(df)
            real_rows = int((~df["synthetic"]).sum()) if "synthetic" in df.columns else 0
            synthetic_rows = int(df["synthetic"].sum()) if "synthetic" in df.columns else 0
        except Exception:
            pass

    return {
        "model_trained": trained,
        "trained_rows": trained_rows,
        "real_rows": real_rows,
        "synthetic_rows": synthetic_rows,
        "features": FEATURE_NAMES,
        "model_path": MODEL_PATH,
    }


def run_anomaly_detection(region: str = None, depth: float = 0, day: int = 1, inject_synthetic_anomaly: bool = False) -> dict:
    """Run anomaly detection using trained Isolation Forest over filtered comparison records."""
    if not is_model_trained():
        # Auto-train if model hasn't been trained yet
        train_anomaly_model()

    target_region = region or settings.DEFAULT_REGION
    records = generate_comparison_dataset(regions=[target_region], days=[day], depths=[depth])

    if inject_synthetic_anomaly and len(records) > 0:
        # Controlled synthetic anomaly injection for demo/testing
        idx = len(records) // 2
        rec = records[idx]
        rec["argo_temp"] += 3.8
        rec["temp_difference"] += 3.8
        rec["synthetic_test_anomaly"] = True

    predictions = predict_anomalies(records)

    # Save detection results to CSV
    os.makedirs(PROCESSED_DATA_DIR, exist_ok=True)
    if predictions:
        df_res = pd.DataFrame(predictions)
        df_res.to_csv(RESULTS_CSV_PATH, index=False)

    normal_cnt = sum(1 for p in predictions if p.get("anomaly_label") == "NORMAL")
    anomaly_cnt = sum(1 for p in predictions if p.get("anomaly_label") == "POTENTIAL_ANOMALY")
    real_cnt = sum(1 for p in predictions if not p.get("synthetic"))
    synth_cnt = sum(1 for p in predictions if p.get("synthetic"))

    return {
        "count": len(predictions),
        "normal_count": normal_cnt,
        "potential_anomaly_count": anomaly_cnt,
        "real_count": real_cnt,
        "synthetic_count": synth_cnt,
        "region": target_region,
        "depth": depth,
        "day": day,
        "results": predictions,
    }


def get_saved_anomaly_results(
    region: Optional[str] = None,
    severity: Optional[str] = None,
    anomaly_label: Optional[str] = None,
    data_source: Optional[str] = None,
) -> list[dict]:
    """Retrieve saved anomaly results from CSV with optional filtering."""
    if not os.path.exists(RESULTS_CSV_PATH):
        return []

    try:
        df = pd.read_csv(RESULTS_CSV_PATH)
        if region:
            df = df[df["region"] == region]
        if severity:
            df = df[df["severity"] == severity]
        if anomaly_label:
            df = df[df["anomaly_label"] == anomaly_label]
        if data_source:
            df = df[df["data_source"] == data_source]

        return df.to_dict("records")
    except Exception:
        return []
