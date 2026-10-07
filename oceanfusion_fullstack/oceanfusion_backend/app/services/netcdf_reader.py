"""
Model data loader.

This is the ONE place that knows whether we're reading a real NetCDF file
(INCOIS-GODAS or the Copernicus backup, section 4 Dataset B/D) or the
synthetic stand-in. Every API route below goes through `get_dataset()` /
`get_subset()` so switching sources later is a one-line config change, not a
rewrite (this is the guide's "source file location is a setting" requirement).
"""
import os
import xarray as xr

from app.config import settings
from app.services.copernicus_adapter import CopernicusMarineAdapter
from app.services.synthetic_data import build_synthetic_dataset

_CACHED_DATASET: xr.Dataset = None
_CACHED_PATH: str = None


def get_dataset(region: str = None) -> xr.Dataset:
    global _CACHED_DATASET, _CACHED_PATH

    region = region or settings.DEFAULT_REGION
    if settings.MODEL_SOURCE == "synthetic":
        return build_synthetic_dataset(region)

    if settings.MODEL_SOURCE == "copernicus":
        copernicus_ds = CopernicusMarineAdapter.open_remote_dataset(region)
        if copernicus_ds is not None:
            return copernicus_ds

    model_path = settings.MODEL_NETCDF_PATH
    if not model_path:
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        default_hycom = os.path.join(backend_dir, "data", "model", "OceanFusion_HYCOM_small.nc")
        if os.path.exists(default_hycom):
            model_path = default_hycom

    if model_path and not os.path.isabs(model_path):
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        abs_path = os.path.normpath(os.path.join(backend_dir, model_path))
        if os.path.exists(abs_path):
            model_path = abs_path

    if _CACHED_DATASET is not None and _CACHED_PATH == model_path:
        return _CACHED_DATASET

    try:
        if model_path and os.path.exists(model_path):
            print(f"Opening and caching NetCDF model dataset: {model_path}")
            ds = xr.open_dataset(model_path)

            # Standardize coordinate names to lowercase if stored in uppercase (e.g. LAT, LON, DEPTH, TIME)
            rename_map = {}
            for c in ds.coords:
                if str(c).upper() in ["TIME", "DEPTH", "LAT", "LON"] and str(c) != str(c).lower():
                    rename_map[str(c)] = str(c).lower()
            if rename_map:
                ds = ds.rename(rename_map)

            # Also rename dim names if they remain uppercase
            dim_rename = {}
            for d in ds.dims:
                if str(d).upper() in ["TIME", "DEPTH", "LAT", "LON"] and str(d) != str(d).lower():
                    dim_rename[str(d)] = str(d).lower()
            if dim_rename:
                ds = ds.rename(dim_rename)

            _CACHED_DATASET = ds
            _CACHED_PATH = model_path
            return _CACHED_DATASET
    except Exception as e:
        print(f"Warning: Failed to load real NetCDF dataset ({e}). Falling back to synthetic model data.")

    print(f"Using synthetic model dataset fallback for region: {region}")
    return build_synthetic_dataset(region)


def get_subset(lat_min=None, lat_max=None, lon_min=None, lon_max=None,
                depth_min=None, depth_max=None) -> xr.Dataset:
    """Cut the dataset down BEFORE anything is sent to the browser (section 12
    golden rule: 'the browser should never receive the entire raw file')."""
    ds = get_dataset()
    sel = {}
    if lat_min is not None and lat_max is not None:
        sel["lat"] = slice(lat_min, lat_max)
    if lon_min is not None and lon_max is not None:
        sel["lon"] = slice(lon_min, lon_max)
    if depth_min is not None and depth_max is not None:
        sel["depth"] = slice(depth_min, depth_max)
    return ds.sel(**sel) if sel else ds

