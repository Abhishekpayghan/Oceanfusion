"""
Central configuration for OceanFusion backend.

Per the implementation guide (section 4 / Dataset B access note): "Build the
data-loading code so the source file location is a setting, not hard-coded —
this way the team isn't blocked while waiting for access." Everything that
depends on a real dataset path or credential is read from environment
variables here, with a synthetic fallback so the whole API is runnable and
demoable before INCOIS-GODAS / ERDDAP access is granted.
"""
import os


class Settings:
    # "hycom" | "copernicus" | "synthetic"
    MODEL_SOURCE: str = os.getenv("OCEANFUSION_MODEL_SOURCE", "hycom")
    MODEL_NETCDF_PATH: str = os.getenv("OCEANFUSION_MODEL_PATH", "data/model/OceanFusion_HYCOM_small.nc")

    # "erddap" | "csv" | "synthetic"
    ARGO_SOURCE: str = os.getenv("OCEANFUSION_ARGO_SOURCE", "erddap")
    CSV_ARGO_FILE_PATH: str = os.getenv("OCEANFUSION_CSV_PATH", "data/Indian_ARGO_Floats.csv")
    ERDDAP_BASE_URL: str = os.getenv(
        "OCEANFUSION_ERDDAP_URL",
        "https://erddap.incois.gov.in/erddap/tabledap/Indian_ARGO_Floats.csv",
    )

    # Copernicus Marine Toolbox Configuration
    COPERNICUS_PRODUCT_ID: str = os.getenv("COPERNICUS_PRODUCT_ID", "GLOBAL_ANALYSISFORECAST_PHY_001_024")
    COPERNICUS_DATASET_THETAO: str = os.getenv("COPERNICUS_DATASET_THETAO", "cmems_mod_glo_phy-thetao_anfc_0.083deg_PT6H-i")
    COPERNICUS_DATASET_SO: str = os.getenv("COPERNICUS_DATASET_SO", "cmems_mod_glo_phy-so_anfc_0.083deg_PT6H-i")
    COPERNICUS_DATASET_CUR: str = os.getenv("COPERNICUS_DATASET_CUR", "cmems_mod_glo_phy-cur_anfc_0.083deg_PT6H-i")

    # Copernicus Marine NRT In-Situ Observations Configuration (Glider / EGO)
    COPERNICUS_GLIDER_PRODUCT_ID: str = os.getenv("COPERNICUS_GLIDER_PRODUCT_ID", "INSITU_GLO_PHYBGCWAV_DISCRETE_MYNRT_013_030")
    COPERNICUS_GLIDER_DATASET_ID: str = os.getenv("COPERNICUS_GLIDER_DATASET_ID", "cmems_obs-ins_glo_phybgcwav_mynrt_na_irr")
    GLIDER_CACHE_DIR: str = os.getenv("OCEANFUSION_GLIDER_CACHE_DIR", "data/cache/copernicus_glider")
    GLIDER_CACHE_TTL: int = int(os.getenv("OCEANFUSION_GLIDER_CACHE_TTL", 1800))

    # ---- Selectable regions ----------------------------------------------
    # The user picks one of these on the region-select screen before the 3D
    # dashboard loads. Each key is a self-contained bounding box; everything
    # downstream (synthetic model field, synthetic float fleet, CSV/ERDDAP
    # bbox filtering) is generated/filtered per region, so switching regions
    # in the UI produces a genuinely different 3D scene, not just a label.
    REGIONS: dict = {
        "bay_of_bengal": {
            "label": "Bay of Bengal",
            "lat_min": 5.0, "lat_max": 22.0, "lon_min": 80.0, "lon_max": 100.0,
        },
        "arabian_sea": {
            "label": "Arabian Sea",
            "lat_min": 5.0, "lat_max": 25.0, "lon_min": 55.0, "lon_max": 78.0,
        },
        "equatorial_indian_ocean": {
            "label": "Equatorial Indian Ocean",
            "lat_min": -10.0, "lat_max": 5.0, "lon_min": 50.0, "lon_max": 100.0,
        },
        "southern_indian_ocean": {
            "label": "Southern Indian Ocean",
            "lat_min": -30.0, "lat_max": -10.0, "lon_min": 50.0, "lon_max": 100.0,
        },
    }
    DEFAULT_REGION: str = os.getenv("OCEANFUSION_DEFAULT_REGION", "bay_of_bengal")

    # Legacy single-region fallback (kept for any code/env still reading
    # settings.LAT_MIN etc. directly) -- mirrors the default region above.
    LAT_MIN: float = float(os.getenv("OCEANFUSION_LAT_MIN", REGIONS[DEFAULT_REGION]["lat_min"]))
    LAT_MAX: float = float(os.getenv("OCEANFUSION_LAT_MAX", REGIONS[DEFAULT_REGION]["lat_max"]))
    LON_MIN: float = float(os.getenv("OCEANFUSION_LON_MIN", REGIONS[DEFAULT_REGION]["lon_min"]))
    LON_MAX: float = float(os.getenv("OCEANFUSION_LON_MAX", REGIONS[DEFAULT_REGION]["lon_max"]))
    DEPTH_MAX: float = float(os.getenv("OCEANFUSION_DEPTH_MAX", 1000))
    DEPTH_LEVELS = [0, 10, 50, 100, 250, 500, 700, 1000]
    N_DAYS: int = int(os.getenv("OCEANFUSION_N_DAYS", 28))
    N_FLOATS: int = int(os.getenv("OCEANFUSION_N_FLOATS", 25))

    # Server-side safety limits (section 14 "Basic security checklist")
    MAX_BBOX_DEG: float = 60.0        # reject absurdly large requested boxes
    SLICE_GRID_RES: int = 60          # resolution returned to the browser (never raw grid)

    HYCOM_LAT_MIN: float = -30.0
    HYCOM_LAT_MAX: float = 30.0
    HYCOM_LON_MIN: float = 30.0
    HYCOM_LON_MAX: float = 120.0

    def region_bbox(self, region_key: str) -> dict:
        """Look up a region's bounding box, supporting both predefined keys
        and dynamic custom region keys (e.g. custom_5_20_75_90)."""
        if region_key and region_key.startswith("custom_"):
            parts = region_key.split("_")
            if len(parts) >= 5:
                try:
                    lmin = max(self.HYCOM_LAT_MIN, min(self.HYCOM_LAT_MAX, float(parts[1])))
                    lmax = max(self.HYCOM_LAT_MIN, min(self.HYCOM_LAT_MAX, float(parts[2])))
                    omin = max(self.HYCOM_LON_MIN, min(self.HYCOM_LON_MAX, float(parts[3])))
                    omax = max(self.HYCOM_LON_MIN, min(self.HYCOM_LON_MAX, float(parts[4])))

                    fmt_lat = lambda v: f"{abs(v):.0f}°{'N' if v >= 0 else 'S'}"
                    fmt_lon = lambda v: f"{abs(v):.0f}°{'E' if v >= 0 else 'W'}"

                    return {
                        "label": f"Custom ({fmt_lat(lmin)}–{fmt_lat(lmax)}, {fmt_lon(omin)}–{fmt_lon(omax)})",
                        "lat_min": lmin, "lat_max": lmax,
                        "lon_min": omin, "lon_max": omax,
                    }
                except ValueError:
                    pass
        return self.REGIONS.get(region_key, self.REGIONS[self.DEFAULT_REGION])


settings = Settings()
