"""
Copernicus Marine FastAPI Router (/api/copernicus)

Provides endpoints to query Copernicus Marine Product:
GLOBAL_ANALYSISFORECAST_PHY_001_024

Endpoints:
- GET  /api/copernicus/status  - Status, version, dataset IDs, credentials check
- POST /api/copernicus/fetch   - Triggers copernicusmarine.subset() for specified lat/lon/depth/time
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.config import settings
from app.services.copernicus_adapter import CopernicusMarineAdapter

router = APIRouter(prefix="/api/copernicus", tags=["copernicus"])


class CopernicusFetchRequest(BaseModel):
    output_directory: Optional[str] = "data/copernicus"
    lat_min: Optional[float] = -30.0
    lat_max: Optional[float] = 30.0
    lon_min: Optional[float] = 30.0
    lon_max: Optional[float] = 120.0
    depth_min: Optional[float] = 0.0
    depth_max: Optional[float] = 1000.0
    start_datetime: Optional[str] = None
    end_datetime: Optional[str] = None


@router.get("/status")
def get_copernicus_status():
    """Return status of Copernicus Marine Toolbox integration, product & dataset IDs."""
    return CopernicusMarineAdapter.get_status()


@router.post("/fetch")
def fetch_copernicus_subset(req: CopernicusFetchRequest):
    """
    Triggers copernicusmarine.subset() for Product GLOBAL_ANALYSISFORECAST_PHY_001_024
    for datasets:
    - Temperature (thetao): cmems_mod_glo_phy-thetao_anfc_0.083deg_PT6H-i
    - Salinity (so):      cmems_mod_glo_phy-so_anfc_0.083deg_PT6H-i
    - Currents (uo, vo):  cmems_mod_glo_phy-cur_anfc_0.083deg_PT6H-i
    """
    if not CopernicusMarineAdapter.is_available():
        raise HTTPException(
            status_code=503,
            detail="copernicusmarine Python package is not installed on the server.",
        )

    try:
        results = CopernicusMarineAdapter.fetch_subset_files(
            output_directory=req.output_directory,
            lat_min=req.lat_min,
            lat_max=req.lat_max,
            lon_min=req.lon_min,
            lon_max=req.lon_max,
            depth_min=req.depth_min,
            depth_max=req.depth_max,
            start_datetime=req.start_datetime,
            end_datetime=req.end_datetime,
        )
        return {
            "status": "success",
            "product_id": CopernicusMarineAdapter.PRODUCT_ID,
            "request_bounds": req.dict(),
            "results": results,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Copernicus subset request failed: {e}")
