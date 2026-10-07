"""
Synthetic INCOIS-GODAS-like dataset.

Generates physically plausible 4D oceanic fields (time, depth, lat, lon) and
synthetic Argo float profile observations. Redesigned with realistic upper-ocean
mixed layer physics, sharp thermoclines, regional salinity patterns (high Arabian
Sea salinity vs river-influenced Bay of Bengal salinity), and smooth float sensor
observations with realistic internal-wave thermocline displacement.
"""
import numpy as np
import xarray as xr

from app.config import settings


def _temperature(lat, lon, depth, day):
    """
    Realistic temperature profile using a logistic thermocline model:
    - Warm surface mixed layer (0-40m)
    - Sharp thermocline transition (50-250m)
    - Deep cold layer settling to ~3.5°C at 1000m
    - Absolute latitude dependency (equator warm ~29°C, 30°S cooler ~17°C)
    """
    # Base surface temperature from absolute latitude and longitude
    lat_factor = 29.5 - 0.012 * np.where(lat >= 0, lat ** 2, (lat * 1.1) ** 2)
    lon_factor = 0.6 * np.sin(np.radians(lon * 2.5))
    day_wobble = 0.3 * np.sin(day * 0.22 + lat * 0.1)
    eddy = 0.4 * np.sin(np.radians(lat * 8)) * np.cos(np.radians(lon * 6)) * np.exp(-depth / 300)

    surface_temp = lat_factor + lon_factor + day_wobble + eddy
    deep_temp = 3.5

    # Thermocline depth z0 (~120m) and scale h0 (~65m)
    z0 = 120.0 + 15.0 * np.sin(np.radians(lon * 2))
    h0 = 65.0

    # Smooth logistic thermocline profile
    thermocline = 1.0 / (1.0 + np.exp((depth - z0) / h0))
    profile = deep_temp + (surface_temp - deep_temp) * thermocline

    return profile


def _salinity(lat, lon, depth, day):
    """
    Realistic salinity profile:
    - High surface salinity in Arabian Sea (~36.2 PSU due to high evaporation)
    - Low surface salinity in Bay of Bengal (~33.2 PSU due to river discharge)
    - Subsurface salinity maximum layer around 100-150m
    - Deep water settling near 34.7 PSU at 1000m
    """
    is_northern = lat > 0
    is_arabian = (lon < 78.0) & is_northern
    is_bay_of_bengal = (lon >= 78.0) & is_northern

    arabian_sal = 36.2 - (lat / 30.0) * 0.3 + 0.2 * np.cos(np.radians(lon * 3))
    bob_sal = 33.2 + (lat / 25.0) * 0.8 - 0.3 * np.sin(np.radians((lon - 78) * 4))
    other_sal = 35.1 - (lat / 30.0) * 0.4

    surf_sal = np.where(is_arabian, arabian_sal, np.where(is_bay_of_bengal, bob_sal, other_sal))
    day_wobble = 0.04 * np.sin(day * 0.15 + lon * 0.05)
    surf_sal = surf_sal + day_wobble

    # Subsurface salinity maximum around 120m
    subsurface_max = 0.35 * np.exp(-((depth - 120.0) / 70.0) ** 2)
    deep_sal = 34.72

    # Smooth depth profile
    blend = np.exp(-depth / 350.0)
    profile = deep_sal + (surf_sal - deep_sal) * blend + subsurface_max * (depth / 150.0) * np.exp(1 - depth / 150.0)

    return profile


def _current_u(lat, lon, day):
    return 0.32 * np.sin(np.radians(lat * 6) + day * 0.2) + 0.12 * np.cos(np.radians(lon * 4))


def _current_v(lat, lon, day):
    return 0.28 * np.cos(np.radians(lon * 5) + day * 0.18) - 0.10 * np.sin(np.radians(lat * 4))


_DATASET_CACHE: dict = {}
_FLOAT_CACHE: dict = {}


def build_synthetic_dataset(region: str = None) -> xr.Dataset:
    """Build (and cache) a full 4D xarray Dataset: dims = (day, depth, lat, lon)
    for the given region key."""
    region = region or settings.DEFAULT_REGION
    if region in _DATASET_CACHE:
        return _DATASET_CACHE[region]

    bbox = settings.region_bbox(region)
    lat_min, lat_max = bbox["lat_min"], bbox["lat_max"]
    lon_min, lon_max = bbox["lon_min"], bbox["lon_max"]

    lats = np.linspace(lat_min, lat_max, 41)
    lons = np.linspace(lon_min, lon_max, 51)
    depths = np.array(settings.DEPTH_LEVELS, dtype=float)
    days = np.arange(1, settings.N_DAYS + 1)

    DEPTH, LAT, LON = np.meshgrid(depths, lats, lons, indexing="ij")

    temp = np.zeros((len(days), len(depths), len(lats), len(lons)))
    sal = np.zeros_like(temp)
    for di, day in enumerate(days):
        temp[di] = _temperature(LAT, LON, DEPTH, day)
        sal[di] = _salinity(LAT, LON, DEPTH, day)

    LAT2, LON2 = np.meshgrid(lats, lons, indexing="ij")
    u = np.zeros((len(days), len(lats), len(lons)))
    v = np.zeros_like(u)
    for di, day in enumerate(days):
        u[di] = _current_u(LAT2, LON2, day)
        v[di] = _current_v(LAT2, LON2, day)

    ds = xr.Dataset(
        data_vars=dict(
            temperature=(["day", "depth", "lat", "lon"], temp),
            salinity=(["day", "depth", "lat", "lon"], sal),
            u_current=(["day", "lat", "lon"], u),
            v_current=(["day", "lat", "lon"], v),
        ),
        coords=dict(day=days, depth=depths, lat=lats, lon=lons),
        attrs=dict(
            source="OceanFusion synthetic prototype field "
                   "(physically realistic mixed-layer & thermocline model)",
            region=region,
            units_temperature="degC",
            units_salinity="PSU",
        ),
    )
    _DATASET_CACHE[region] = ds
    return ds


# ---------------------------------------------------------------------------
# Synthetic Argo fleet (stand-in for Dataset A / Indian_ARGO_Floats)
# ---------------------------------------------------------------------------
def is_in_ocean(lat: float, lon: float) -> bool:
    """Strict geospatial check to ensure point is in ocean water and not on land mass."""
    # North of 20.5°N anywhere in South Asia is land (Tibet, Nepal, North India, Bangladesh, Myanmar)
    if lat >= 20.5 and 60.0 <= lon <= 100.0:
        return False

    # Indian Subcontinent landmass (South & Central India, Maharashtra, Odisha, Bengal)
    if 8.0 <= lat <= 20.5:
        # Southern Tip (Tamil Nadu / Kerala)
        if 8.0 <= lat <= 12.0 and 76.0 <= lon <= 79.8:
            return False
        # Karnataka / AP / Telangana
        if 12.0 < lat <= 16.0 and 73.8 <= lon <= 80.5:
            return False
        # Maharashtra / Odisha / Gujarat / Bengal
        if 16.0 < lat <= 20.5 and 72.5 <= lon <= 87.5:
            return False

    # Sri Lanka
    if 5.8 <= lat <= 9.9 and 79.4 <= lon <= 82.2:
        return False

    # Bangladesh, Assam, Myanmar, Southeast Asia
    if lat >= 15.0 and lon >= 89.0:
        return False
    if lat >= 9.0 and lon >= 97.5:
        return False
    if lat >= 0.0 and lon >= 98.0:
        return False

    # Arabian peninsula (Oman, Yemen, Saudi Arabia, Iran)
    if lat >= 12.0 and lon <= 53.5:
        return False
    if lat >= 15.0 and lon <= 59.0:
        return False
    if lat >= 22.0 and lon <= 61.5:
        return False

    # East Africa / Horn of Africa / Somalia
    if lat >= -12.0 and lon <= 41.5:
        return False
    if lat >= 0.0 and lon <= 43.5:
        return False

    # Madagascar
    if -26.0 <= lat <= -11.5 and 43.0 <= lon <= 50.8:
        return False

    # Australia
    if lat <= -11.5 and lon >= 113.0:
        return False

    return True


def _seeded_rng(region: str):
    region_offset = sum(ord(c) for c in region) * 37
    return np.random.default_rng(266007 + region_offset)


OCEAN_TRANSECTS = {
    "arabian_sea": {"lat_min": 10.0, "lat_max": 18.5, "lon_min": 60.0, "lon_max": 71.0},
    "bay_of_bengal": {"lat_min": 8.0, "lat_max": 18.5, "lon_min": 82.5, "lon_max": 88.5},
    "equatorial_io": {"lat_min": -8.0, "lat_max": 4.5, "lon_min": 55.0, "lon_max": 94.0},
    "south_io": {"lat_min": -28.0, "lat_max": -12.0, "lon_min": 52.0, "lon_max": 105.0},
}


def build_synthetic_floats(region: str = None):
    region = region or settings.DEFAULT_REGION
    if region in _FLOAT_CACHE:
        return _FLOAT_CACHE[region]

    transect = OCEAN_TRANSECTS.get(region, OCEAN_TRANSECTS["bay_of_bengal"])
    rng = _seeded_rng(region)
    floats = []
    attempts = 0
    while len(floats) < settings.N_FLOATS and attempts < 1000:
        attempts += 1
        lat = transect["lat_min"] + rng.random() * (transect["lat_max"] - transect["lat_min"])
        lon = transect["lon_min"] + rng.random() * (transect["lon_max"] - transect["lon_min"])

        if not is_in_ocean(lat, lon):
            continue

        bias = (rng.random() - 0.5) * 0.4  # Realistic float sensor calibration offset (±0.2°C)
        depth_shift = (rng.random() - 0.5) * 12.0  # Internal wave thermocline shift (±6m)
        floats.append({
            "id": f"59{1000 + int(rng.random() * 8999)}",
            "lat": round(float(lat), 3),
            "lon": round(float(lon), 3),
            "bias": float(bias),
            "depth_shift": float(depth_shift),
            "seed": int(1000 + len(floats) * 37),
            "last_cycle_day": int(1 + rng.random() * 3),
            "qc_flag": "good",
        })
    _FLOAT_CACHE[region] = floats
    return floats


def observed_value(variable: str, float_record: dict, depth: float, day: int,
                    region: str = None) -> float:
    """
    Realistic Argo observation profile = Model profile at (lat, lon) with:
    1. Small float sensor calibration bias (constant across depth)
    2. Internal wave depth shift (thermocline displacement)
    3. Smooth micro-turbulence fluctuations across depth
    """
    region = region or settings.DEFAULT_REGION
    ds = build_synthetic_dataset(region)

    lat = float_record["lat"]
    lon = float_record["lon"]
    depth_shift = float_record.get("depth_shift", 0.0)
    bias = float_record.get("bias", 0.0)

    # Shift depth slightly to simulate real ocean internal thermocline waves
    effective_depth = max(0.0, depth + depth_shift)

    is_temp = (variable == "temp")
    if is_temp:
        model_val = float(_temperature(lat, lon, effective_depth, day))
    else:
        model_val = float(_salinity(lat, lon, effective_depth, day))

    # Add smooth sensor variation across depth instead of noisy uncorrelated jumps
    depth_smooth = np.sin(depth * 0.015 + float_record.get("seed", 1000) * 0.1) * (0.12 if is_temp else 0.02)
    calib_bias = bias if is_temp else bias * 0.15

    result = model_val + calib_bias + depth_smooth
    return round(float(result), 4)
