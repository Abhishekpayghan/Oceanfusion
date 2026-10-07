"""
Copernicus Marine Client & Subset Utility for OceanFusion.

Handles authentication, environment variable loading, and subsetting
via the official `copernicusmarine` Python SDK.
"""
import os
import time
from typing import Dict, List, Optional
import xarray as xr

from app.config import settings

try:
    import copernicusmarine
    COPERNICUS_AVAILABLE = True
except ImportError:
    copernicusmarine = None
    COPERNICUS_AVAILABLE = False


USERNAME = os.getenv("COPERNICUSMARINE_SERVICE_USERNAME", "")
PASSWORD = os.getenv("COPERNICUSMARINE_SERVICE_PASSWORD", "")

PRODUCT_ID = os.getenv("COPERNICUS_MODEL_PRODUCT", "GLOBAL_ANALYSISFORECAST_PHY_001_024")
TEMP_DATASET = os.getenv("COPERNICUS_TEMP_DATASET", "cmems_mod_glo_phy-thetao_anfc_0.083deg_P1D-m")
SAL_DATASET = os.getenv("COPERNICUS_SAL_DATASET", "cmems_mod_glo_phy-so_anfc_0.083deg_P1D-m")
CURRENT_DATASET = os.getenv("COPERNICUS_CURRENT_DATASET", "cmems_mod_glo_phy-cur_anfc_0.083deg_P1D-m")

MIN_LON = float(os.getenv("OCEAN_MIN_LON", 30))
MAX_LON = float(os.getenv("OCEAN_MAX_LON", 120))
MIN_LAT = float(os.getenv("OCEAN_MIN_LAT", -30))
MAX_LAT = float(os.getenv("OCEAN_MAX_LAT", 30))
CACHE_TTL = int(os.getenv("COPERNICUS_CACHE_TTL", 900))


def get_model_subset(
    dataset_id: str,
    variables: List[str],
    min_lon: float = MIN_LON,
    max_lon: float = MAX_LON,
    min_lat: float = MIN_LAT,
    max_lat: float = MAX_LAT,
    min_depth: float = 0.0,
    max_depth: float = 1000.0,
    start_datetime: Optional[str] = None,
    end_datetime: Optional[str] = None,
    output_directory: str = "data/copernicus_subsets",
):
    """
    Executes copernicusmarine.subset() for specified dataset, bounding box, depth, and variables.
    """
    if not COPERNICUS_AVAILABLE:
        raise RuntimeError("copernicusmarine Python SDK is not installed.")

    auth_args = {}
    if USERNAME and PASSWORD and USERNAME != "YOUR_COPERNICUS_USERNAME":
        auth_args["username"] = USERNAME
        auth_args["password"] = PASSWORD

    os.makedirs(output_directory, exist_ok=True)

    return copernicusmarine.subset(
        dataset_id=dataset_id,
        variables=variables,
        minimum_longitude=min_lon,
        maximum_longitude=max_lon,
        minimum_latitude=min_lat,
        maximum_latitude=max_lat,
        minimum_depth=min_depth,
        maximum_depth=max_depth,
        start_datetime=start_datetime,
        end_datetime=end_datetime,
        output_directory=output_directory,
        disable_progress_bar=True,
        **auth_args,
    )


def fetch_nrt_model_field(
    variable: str = "temperature",
    region: Optional[str] = None,
    depth: float = 0.0,
    day: int = 1,
) -> Optional[xr.Dataset]:
    """
    Fetch remote or subset dataset mapping OceanFusion standard variables:
    temperature -> thetao
    salinity    -> so
    currents    -> uo + vo
    """
    if not COPERNICUS_AVAILABLE:
        return None

    dataset_id_map = {
        "temperature": (TEMP_DATASET, ["thetao"]),
        "salinity": (SAL_DATASET, ["so"]),
        "currents": (CURRENT_DATASET, ["uo", "vo"]),
    }

    entry = dataset_id_map.get(variable)
    if not entry:
        return None

    dataset_id, vars_to_fetch = entry

    bbox = settings.region_bbox(region) if region else {
        "lat_min": MIN_LAT, "lat_max": MAX_LAT, "lon_min": MIN_LON, "lon_max": MAX_LON
    }

    try:
        auth_args = {}
        if USERNAME and PASSWORD and USERNAME != "YOUR_COPERNICUS_USERNAME":
            auth_args["username"] = USERNAME
            auth_args["password"] = PASSWORD

        print(f"[CopernicusClient] Streaming dataset '{dataset_id}' for variable '{variable}'...")
        ds = copernicusmarine.open_dataset(
            dataset_id=dataset_id,
            variables=vars_to_fetch,
            **auth_args,
        )

        lat_slice = slice(bbox["lat_min"], bbox["lat_max"])
        lon_slice = slice(bbox["lon_min"], bbox["lon_max"])
        depth_slice = slice(0.0, min(depth + 10.0, 1000.0))

        sub = ds.sel(latitude=lat_slice, longitude=lon_slice, depth=depth_slice)
        return sub
    except Exception as e:
        print(f"[CopernicusClient] Error fetching NRT model field ({e}). Fallback triggered.")
        return None
