"""
Quality control -- guide section 15 "Data checks":
  - missing values removed or clearly flagged
  - bad-quality readings excluded
  - longitude / depth direction / units consistent
  - timestamps in UTC (N/A for the synthetic day-index prototype, but the
    hook is here so a real loader has somewhere to enforce it)
"""
from app.config import settings


def normalize_longitude(lon: float) -> float:
    """Keep -180..180 convention consistent (guide section 8, step 2)."""
    lon = ((lon + 180) % 360) - 180
    return lon


def in_region(lat: float, lon: float) -> bool:
    return settings.LAT_MIN <= lat <= settings.LAT_MAX and settings.LON_MIN <= lon <= settings.LON_MAX


def passes_qc(record: dict) -> bool:
    """Reject a float record that fails basic checks. Real ERDDAP data would
    check TEMP_QC / PSAL_QC flags here (guide Dataset A field table)."""
    if record.get("qc_flag") not in ("good", None):
        return False
    if record.get("lat") is None or record.get("lon") is None:
        return False
    if not in_region(record["lat"], record["lon"]):
        return False
    return True


def check_bbox_size(lat_min, lat_max, lon_min, lon_max):
    """Section 14 security checklist: 'Limit how large a single request's
    bounding box can be.'"""
    if (lat_max - lat_min) > settings.MAX_BBOX_DEG or (lon_max - lon_min) > settings.MAX_BBOX_DEG:
        raise ValueError(
            f"Requested bounding box exceeds the {settings.MAX_BBOX_DEG}° limit."
        )
