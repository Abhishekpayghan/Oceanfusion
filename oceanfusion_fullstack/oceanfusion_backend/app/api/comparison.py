from fastapi import APIRouter, HTTPException, Query

from app.config import settings
from app.schemas.api_models import (
    AnomalyResponse, CompareResponse, FleetStatsResponse, MetadataResponse,
    RegionInfo, RegionsResponse,
)
from app.services import interpolation
from app.services.observation_adapter import get_floats_for_region, get_observed_value

router = APIRouter(prefix="/api", tags=["comparison"])


def _nearest_depth_level(depth: float) -> float:
    return min(settings.DEPTH_LEVELS, key=lambda d: abs(d - depth))


@router.get("/regions", response_model=RegionsResponse)
def list_regions():
    """Every selectable region -- powers the region-select screen the user
    sees before the 3D dashboard loads."""
    return RegionsResponse(
        default=settings.DEFAULT_REGION,
        regions=[
            RegionInfo(key=key, **bbox)
            for key, bbox in settings.REGIONS.items()
        ],
    )


@router.get("/compare/{float_id}", response_model=CompareResponse)
def compare_one(
    float_id: str,
    variable: str = Query("temp", pattern="^(temp|sal)$"),
    depth: float = Query(0, ge=0, le=settings.DEPTH_MAX),
    day: int = Query(1, ge=1, le=settings.N_DAYS),
    region: str = Query(settings.DEFAULT_REGION),
):
    """Model vs observation + error stats for one float (guide section 7.3
    endpoint table)."""
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
            raise HTTPException(status_code=404, detail=f"Platform {float_id} not found")

    dl = _nearest_depth_level(depth)
    if is_glider:
        from app.services.glider_service import get_glider_observed_value
        obs_val = get_glider_observed_value(variable, match, dl, day, region)
    else:
        obs_val = get_observed_value(variable, match, dl, day, region)

    result = interpolation.match_point(variable, match["lat"], match["lon"], dl, day, obs_val, region)

    return CompareResponse(
        id=float_id, variable=variable, depth=dl, day=day,
        model_value=result.model_value, observed_value=result.observed_value,
        signed_error=result.signed_error, method=result.method,
    )



@router.get("/analytics/fleet", response_model=FleetStatsResponse)
def fleet_comparison(
    variable: str = Query("temp", pattern="^(temp|sal)$"),
    depth: float = Query(0, ge=0, le=settings.DEPTH_MAX),
    day: int = Query(1, ge=1, le=settings.N_DAYS),
    region: str = Query(settings.DEFAULT_REGION),
):
    """Bias / MAE / RMSE across every float & glider in the region at one depth+day."""
    floats = get_floats_for_region({"region": region})
    dl = _nearest_depth_level(depth)

    per_float_error = {}
    for f in floats:
        obs_val = get_observed_value(variable, f, dl, day, region)
        result = interpolation.match_point(variable, f["lat"], f["lon"], dl, day, obs_val, region)
        per_float_error[str(f["id"])] = result.signed_error

    # Combine gliders in the region
    try:
        from app.services.glider_service import get_glider_observations, get_glider_observed_value
        glider_resp = get_glider_observations()
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
            obs_val = get_glider_observed_value(variable, g_obj, dl, day, region)
            result = interpolation.match_point(variable, lat, lon, dl, day, obs_val, region)
            per_float_error[pid] = result.signed_error
    except Exception as e:
        print(f"[FLEET COMPARISON] Gliders error calculation warning: {e}")

    stats = interpolation.fleet_stats(list(per_float_error.values()))
    return FleetStatsResponse(
        variable=variable, depth=dl, day=day,
        n=stats["n"], bias=stats["bias"], mae=stats["mae"], rmse=stats["rmse"],
        per_float_error=per_float_error,
    )



@router.get("/anomaly", response_model=AnomalyResponse)
def anomaly_map(
    variable: str = Query("temp", pattern="^(temp|sal)$"),
    depth: float = Query(0, ge=0, le=settings.DEPTH_MAX),
    day: int = Query(1, ge=1, le=settings.N_DAYS),
    region: str = Query(settings.DEFAULT_REGION),
):
    """Flagged unusual mismatches (guide section 11) -- z-score stand-in for
    Isolation Forest, always presented as 'worth checking', never fact."""
    floats = get_floats_for_region({"region": region})
    dl = _nearest_depth_level(depth)

    errors = {}
    for f in floats:
        obs_val = get_observed_value(variable, f, dl, day, region)
        result = interpolation.match_point(variable, f["lat"], f["lon"], dl, day, obs_val, region)
        errors[f["id"]] = result.signed_error

    flags = interpolation.flag_anomalies(errors)
    return AnomalyResponse(variable=variable, depth=dl, day=day, flags=flags)


@router.get("/metadata", response_model=MetadataResponse)
def metadata(region: str = Query(settings.DEFAULT_REGION)):
    bbox = settings.region_bbox(region)
    return MetadataResponse(
        model_source=settings.MODEL_SOURCE,
        argo_source=settings.ARGO_SOURCE,
        region_key=region,
        region_label=bbox["label"],
        region={"lat_min": bbox["lat_min"], "lat_max": bbox["lat_max"],
                "lon_min": bbox["lon_min"], "lon_max": bbox["lon_max"]},
        depth_levels=settings.DEPTH_LEVELS,
        n_days=settings.N_DAYS,
        variables={"temp": "degC", "sal": "PSU"},
        provenance_note=(
            "Prototype data is generated by an analytic function standing in "
            "for INCOIS-GODAS and Indian_ARGO_Floats while live dataset "
            "access is arranged (see guide section 4 & 20). Swap by setting "
            "OCEANFUSION_MODEL_SOURCE / OCEANFUSION_ARGO_SOURCE."
        ),
    )
