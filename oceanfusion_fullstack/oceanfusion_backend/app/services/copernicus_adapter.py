"""
Copernicus Marine Toolbox Adapter for OceanFusion.

Implements programmatic integration with Copernicus Marine Product:
GLOBAL_ANALYSISFORECAST_PHY_001_024

Datasets:
- Temperature (thetao): cmems_mod_glo_phy-thetao_anfc_0.083deg_PT6H-i
- Salinity (so):      cmems_mod_glo_phy-so_anfc_0.083deg_PT6H-i
- Currents (uo, vo):  cmems_mod_glo_phy-cur_anfc_0.083deg_PT6H-i

Supported Access Modes:
1. copernicusmarine.subset() - Downloads spatial/depth/time subsets to local NetCDF.
2. copernicusmarine.open_dataset() - Directly streams remote xarray.Dataset fields.
"""
import os
import time
from typing import Dict, Optional, Tuple

import numpy as np
import xarray as xr

from app.config import settings

try:
    import copernicusmarine
    COPERNICUS_AVAILABLE = True
except ImportError:
    copernicusmarine = None
    COPERNICUS_AVAILABLE = False


_COPERNICUS_CACHE: Dict[str, Tuple[float, xr.Dataset]] = {}
CACHE_TTL_SECONDS = 3600  # 1 hour in-memory cache


class CopernicusMarineAdapter:
    PRODUCT_ID = settings.COPERNICUS_PRODUCT_ID
    DATASET_THETAO = settings.COPERNICUS_DATASET_THETAO
    DATASET_SO = settings.COPERNICUS_DATASET_SO
    DATASET_CUR = settings.COPERNICUS_DATASET_CUR

    @classmethod
    def is_available(cls) -> bool:
        return COPERNICUS_AVAILABLE

    @classmethod
    def get_status(cls) -> dict:
        has_credentials = bool(os.getenv("COPERNICUS_USERNAME") or os.getenv("COPERNICUS_PASSWORD"))
        return {
            "available": COPERNICUS_AVAILABLE,
            "product_id": cls.PRODUCT_ID,
            "datasets": {
                "temperature": cls.DATASET_THETAO,
                "salinity": cls.DATASET_SO,
                "currents": cls.DATASET_CUR,
            },
            "variables": {
                "temperature": "thetao",
                "salinity": "so",
                "currents": ["uo", "vo"],
            },
            "domain_bounds": {
                "lat_min": settings.HYCOM_LAT_MIN,
                "lat_max": settings.HYCOM_LAT_MAX,
                "lon_min": settings.HYCOM_LON_MIN,
                "lon_max": settings.HYCOM_LON_MAX,
                "depth_max": settings.DEPTH_MAX,
            },
            "has_credentials": has_credentials,
            "copernicusmarine_version": getattr(copernicusmarine, "__version__", None) if COPERNICUS_AVAILABLE else None,
        }

    @classmethod
    def fetch_subset_files(
        cls,
        output_directory: str = "data/copernicus",
        lat_min: float = -30.0,
        lat_max: float = 30.0,
        lon_min: float = 30.0,
        lon_max: float = 120.0,
        depth_min: float = 0.0,
        depth_max: float = 1000.0,
        start_datetime: Optional[str] = None,
        end_datetime: Optional[str] = None,
    ) -> dict:
        """
        Executes copernicusmarine.subset() requests for temperature, salinity, and currents
        saving NetCDF subsets for the requested spatial/depth/temporal bounds.
        """
        if not COPERNICUS_AVAILABLE:
            raise RuntimeError("copernicusmarine Python package is not installed.")

        os.makedirs(output_directory, exist_ok=True)

        if not start_datetime:
            today_str = time.strftime("%Y-%m-%d")
            start_datetime = f"{today_str}T00:00:00"
            end_datetime = f"{today_str}T06:00:00"

        username = os.getenv("COPERNICUS_USERNAME")
        password = os.getenv("COPERNICUS_PASSWORD")

        common_args = {
            "minimum_longitude": lon_min,
            "maximum_longitude": lon_max,
            "minimum_latitude": lat_min,
            "maximum_latitude": lat_max,
            "minimum_depth": depth_min,
            "maximum_depth": depth_max,
            "start_datetime": start_datetime,
            "end_datetime": end_datetime,
            "output_directory": output_directory,
            "force_download": True,
        }
        if username and password:
            common_args["username"] = username
            common_args["password"] = password

        results = {}

        # 1. Temperature (thetao)
        try:
            print(f"[Copernicus] Requesting subset for temperature ({cls.DATASET_THETAO})...")
            file_temp = copernicusmarine.subset(
                dataset_id=cls.DATASET_THETAO,
                variables=["thetao"],
                output_filename="indian_ocean_temperature.nc",
                **common_args,
            )
            results["temperature_file"] = str(file_temp)
        except Exception as e:
            print(f"[Copernicus] Temperature subset warning: {e}")
            results["temperature_error"] = str(e)

        # 2. Salinity (so)
        try:
            print(f"[Copernicus] Requesting subset for salinity ({cls.DATASET_SO})...")
            file_sal = copernicusmarine.subset(
                dataset_id=cls.DATASET_SO,
                variables=["so"],
                output_filename="indian_ocean_salinity.nc",
                **common_args,
            )
            results["salinity_file"] = str(file_sal)
        except Exception as e:
            print(f"[Copernicus] Salinity subset warning: {e}")
            results["salinity_error"] = str(e)

        # 3. Currents (uo, vo)
        try:
            print(f"[Copernicus] Requesting subset for currents ({cls.DATASET_CUR})...")
            file_cur = copernicusmarine.subset(
                dataset_id=cls.DATASET_CUR,
                variables=["uo", "vo"],
                output_filename="indian_ocean_currents.nc",
                **common_args,
            )
            results["currents_file"] = str(file_cur)
        except Exception as e:
            print(f"[Copernicus] Currents subset warning: {e}")
            results["currents_error"] = str(e)

        return results

    @classmethod
    def open_remote_dataset(cls, region: str = None) -> Optional[xr.Dataset]:
        """
        Uses copernicusmarine.open_dataset() to stream datasets directly into xarray.
        Standardizes dimensions (lat, lon, depth, time) and variable names (temp, sal, uvel, vvel).
        """
        if not COPERNICUS_AVAILABLE:
            return None

        region = region or settings.DEFAULT_REGION
        cache_key = f"copernicus_{region}"
        now = time.time()

        if cache_key in _COPERNICUS_CACHE:
            ts, cached_ds = _COPERNICUS_CACHE[cache_key]
            if now - ts < CACHE_TTL_SECONDS:
                return cached_ds

        username = os.getenv("COPERNICUS_USERNAME")
        password = os.getenv("COPERNICUS_PASSWORD")
        auth_kwargs = {}
        if username and password:
            auth_kwargs = {"username": username, "password": password}

        try:
            print(f"[Copernicus] Opening remote stream for product {cls.PRODUCT_ID}...")
            # Open temperature dataset
            ds_temp = copernicusmarine.open_dataset(
                dataset_id=cls.DATASET_THETAO,
                variables=["thetao"],
                **auth_kwargs,
            )
            # Open salinity dataset
            ds_sal = copernicusmarine.open_dataset(
                dataset_id=cls.DATASET_SO,
                variables=["so"],
                **auth_kwargs,
            )
            # Open currents dataset
            ds_cur = copernicusmarine.open_dataset(
                dataset_id=cls.DATASET_CUR,
                variables=["uo", "vo"],
                **auth_kwargs,
            )

            # Crop spatial region (Indian Ocean: 30°S–30°N, 30°E–120°E)
            bbox = settings.region_bbox(region)
            lat_slice = slice(bbox["lat_min"], bbox["lat_max"])
            lon_slice = slice(bbox["lon_min"], bbox["lon_max"])
            depth_slice = slice(0.0, settings.DEPTH_MAX)

            sub_temp = ds_temp.sel(latitude=lat_slice, longitude=lon_slice, depth=depth_slice)
            sub_sal = ds_sal.sel(latitude=lat_slice, longitude=lon_slice, depth=depth_slice)
            sub_cur = ds_cur.sel(latitude=lat_slice, longitude=lon_slice, depth=depth_slice)

            # Standardize names
            unified = xr.Dataset(
                data_vars={
                    "temp": (["time", "depth", "lat", "lon"], sub_temp["thetao"].values),
                    "sal": (["time", "depth", "lat", "lon"], sub_sal["so"].values),
                    "uvel": (["time", "depth", "lat", "lon"], sub_cur["uo"].values),
                    "vvel": (["time", "depth", "lat", "lon"], sub_cur["vo"].values),
                },
                coords={
                    "time": sub_temp["time"].values,
                    "depth": sub_temp["depth"].values,
                    "lat": sub_temp["latitude"].values,
                    "lon": sub_temp["longitude"].values,
                },
                attrs={
                    "source": f"Copernicus Marine {cls.PRODUCT_ID} (Live Marine Toolbox API)",
                    "product_id": cls.PRODUCT_ID,
                },
            )

            _COPERNICUS_CACHE[cache_key] = (now, unified)
            return unified
        except Exception as e:
            print(f"[Copernicus] Remote streaming notification: {e}")
            return None
