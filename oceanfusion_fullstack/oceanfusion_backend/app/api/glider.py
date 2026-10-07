"""
Glider API Router (/api/gliders)

Integrates Copernicus Marine NRT In-Situ observations (INSITU_GLO_PHYBGCWAV_DISCRETE_MYNRT_013_030)
with endpoints for glider listings, platform summaries, trajectory tracks, and depth profiles.
"""
from typing import Optional
from fastapi import APIRouter, Query

from app.services.glider_service import (
    get_glider_observations,
    get_glider_platforms,
    get_glider_profile,
    get_glider_track,
)

router = APIRouter(prefix="/api/gliders", tags=["glider"])


@router.get("")
def list_gliders(
    source: Optional[str] = Query(None),
    min_lon: float = Query(30.0),
    max_lon: float = Query(120.0),
    min_lat: float = Query(-30.0),
    max_lat: float = Query(30.0),
    min_depth: float = Query(0.0),
    max_depth: float = Query(1000.0),
    start_time: Optional[str] = Query(None),
    end_time: Optional[str] = Query(None),
    refresh: bool = Query(False),
):
    """
    Returns Copernicus Marine NRT Glider / EGO observations in the Indian Ocean domain.
    Response includes live vs fallback source indicator ('COPERNICUS_NRT', 'LOCAL_FALLBACK', 'SYNTHETIC').
    """
    return get_glider_observations(
        min_lon=min_lon,
        max_lon=max_lon,
        min_lat=min_lat,
        max_lat=max_lat,
        min_depth=min_depth,
        max_depth=max_depth,
        start_time=start_time,
        end_time=end_time,
        refresh=refresh,
    )


@router.get("/platforms")
def list_glider_platforms():
    """Return active/recent glider platforms with ID, position, and observation count."""
    return get_glider_platforms()


@router.get("/{platform_id}/track")
def get_track(platform_id: str):
    """Return historical trajectory points for a given glider platform for globe route drawing."""
    return get_glider_track(platform_id)


@router.get("/{platform_id}/profile")
def get_profile(platform_id: str):
    """Return depth-dependent temperature and salinity observations for a given glider platform."""
    return get_glider_profile(platform_id)
