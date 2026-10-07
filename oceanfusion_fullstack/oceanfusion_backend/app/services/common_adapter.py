"""
Unified Common Observation Adapter for OceanFusion.

Standardizes heterogeneous observation data from:
  1. HYCOM / NetCDF 3D model grid
  2. INCOIS ERDDAP Argo Floats
  3. Copernicus NRT Argo (INSITU_GLO_PHYBGCWAV_DISCRETE_MYNRT_013_030)
  4. Copernicus NRT Gliders / EGO
  5. Local CSV Argo Datasets
  6. Synthetic Physics Fallbacks

All records are normalized into a single unified Schema:
{
    "platform_id": str,
    "source": str,
    "latitude": float,
    "longitude": float,
    "time": str,
    "depth": float,
    "temperature": float | None,
    "salinity": float | None,
    "u": float | None,
    "v": float | None,
}
"""
from typing import Dict, List, Optional
from datetime import datetime, timezone
import numpy as np
import pandas as pd

from app.config import settings
from app.services.observation_adapter import get_floats_for_region, get_observed_value
from app.services.glider_service import get_glider_observations, get_glider_observed_value


class CommonObservationAdapter:
    """Unified observation interface converting all feeds to standard schema."""

    @staticmethod
    def normalize_record(
        platform_id: str,
        source: str,
        latitude: float,
        longitude: float,
        time_str: str,
        depth: float,
        temperature: Optional[float] = None,
        salinity: Optional[float] = None,
        u: Optional[float] = None,
        v: Optional[float] = None,
    ) -> Dict:
        """Create a guaranteed schema-compliant dictionary."""
        def clean_float(val):
            if val is None:
                return None
            try:
                f_val = float(val)
                return round(f_val, 4) if not np.isnan(f_val) else None
            except (ValueError, TypeError):
                return None

        return {
            "platform_id": str(platform_id),
            "source": str(source).upper(),
            "latitude": round(float(latitude), 4),
            "longitude": round(float(longitude), 4),
            "time": str(time_str),
            "depth": round(float(depth), 2),
            "temperature": clean_float(temperature),
            "salinity": clean_float(salinity),
            "u": clean_float(u),
            "v": clean_float(v),
        }

    @classmethod
    def get_unified_observations(
        cls,
        region: Optional[str] = None,
        depth: float = 0.0,
        day: int = 1,
        include_argo: bool = True,
        include_gliders: bool = True,
        include_copernicus_nrt: bool = True,
    ) -> List[Dict]:
        """
        Gathers observations from all enabled sources and normalizes them into the common schema.
        """
        target_region = region or settings.DEFAULT_REGION
        bbox = settings.region_bbox(target_region)
        lat_min, lat_max = bbox["lat_min"], bbox["lat_max"]
        lon_min, lon_max = bbox["lon_min"], bbox["lon_max"]

        now_iso = datetime.now(timezone.utc).isoformat()
        unified_records: List[Dict] = []

        # 1. INCOIS / CSV / Synthetic Argo Floats
        if include_argo:
            argo_floats = get_floats_for_region({"region": target_region})
            for f in argo_floats:
                fid = f.get("id", "UNKNOWN_ARGO")
                lat = f.get("lat", 0.0)
                lon = f.get("lon", 0.0)
                source_tag = f.get("source", "ARGO_FLOAT")

                temp_val = get_observed_value("temp", f, depth, day, target_region)
                sal_val = get_observed_value("sal", f, depth, day, target_region)

                rec = cls.normalize_record(
                    platform_id=fid,
                    source=source_tag,
                    latitude=lat,
                    longitude=lon,
                    time_str=now_iso,
                    depth=depth,
                    temperature=temp_val,
                    salinity=sal_val,
                    u=None,
                    v=None,
                )
                unified_records.append(rec)

        # 2. Copernicus NRT Gliders / EGO Observations
        if include_gliders:
            try:
                glider_resp = get_glider_observations(
                    min_lon=lon_min, max_lon=lon_max,
                    min_lat=lat_min, max_lat=lat_max,
                    min_depth=0.0, max_depth=1000.0,
                )
                glider_obs = glider_resp.get("observations", [])
                seen_gliders = set()

                for g in glider_obs:
                    pid = str(g.get("platform_id", "")).strip()
                    if not pid or pid in seen_gliders:
                        continue
                    seen_gliders.add(pid)

                    lat = float(g.get("latitude", 0.0))
                    lon = float(g.get("longitude", 0.0))
                    g_obj = {
                        "id": pid, "lat": lat, "lon": lon,
                        "_observations": [o for o in glider_obs if str(o.get("platform_id", "")).strip() == pid]
                    }

                    g_temp = get_glider_observed_value("temp", g_obj, depth, day, target_region)
                    g_sal = get_glider_observed_value("sal", g_obj, depth, day, target_region)
                    g_source = g.get("source", "COPERNICUS_NRT_GLIDER")

                    rec = cls.normalize_record(
                        platform_id=pid,
                        source=g_source,
                        latitude=lat,
                        longitude=lon,
                        time_str=g.get("time", now_iso),
                        depth=depth,
                        temperature=g_temp,
                        salinity=g_sal,
                        u=None,
                        v=None,
                    )
                    unified_records.append(rec)
            except Exception as e:
                print(f"[CommonAdapter] Glider normalization warning: {e}")

        return unified_records


# Module-level convenience functions
def fetch_common_schema_observations(region: str = None, depth: float = 0.0, day: int = 1) -> List[Dict]:
    return CommonObservationAdapter.get_unified_observations(region=region, depth=depth, day=day)
