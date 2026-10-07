import glob
import os
import time
import urllib.error
import urllib.request
from abc import ABC, abstractmethod

import numpy as np
import pandas as pd

from app.config import settings
from app.services import qc
from app.services.synthetic_data import build_synthetic_floats, is_in_ocean, observed_value


class ObservationAdapter(ABC):
    @abstractmethod
    def load(self, query: dict) -> "pd.DataFrame | list[dict]":
        ...

    @abstractmethod
    def normalize(self, raw):
        ...

    def quality_control(self, records: list[dict]) -> list[dict]:
        return [r for r in records if qc.passes_qc(r) and is_in_ocean(r.get("lat", 0), r.get("lon", 0))]

    @abstractmethod
    def to_common_schema(self, records: list[dict]) -> list[dict]:
        """Common shape every route/consumer can rely on:
        {id, lat, lon, depth_levels, last_cycle_day, source}
        """
        ...

    def get_floats(self, query: dict) -> list[dict]:
        raw = self.load(query)
        normalized = self.normalize(raw)
        clean = self.quality_control(normalized)
        return self.to_common_schema(clean)


class SyntheticArgoAdapter(ObservationAdapter):
    """Stand-in fleet used until real CSV or ERDDAP data source is used."""

    def load(self, query: dict):
        return build_synthetic_floats(query.get("region"))

    def normalize(self, raw):
        return raw

    def quality_control(self, records: list[dict]) -> list[dict]:
        # Floats are already generated inside the selected region's bbox
        # (see synthetic_data.build_synthetic_floats), so the base class's
        # in_region() check -- which only knows about settings.LAT_MIN/MAX,
        # i.e. the *default* region -- would wrongly reject every float for
        # any other region. Just keep the basic qc_flag / lat-lon-present
        # checks here instead.
        return [r for r in records if r.get("qc_flag") in ("good", None)
                and r.get("lat") is not None and r.get("lon") is not None]

    def to_common_schema(self, records: list[dict]) -> list[dict]:
        return [
            {
                "id": r["id"],
                "lat": r["lat"],
                "lon": r["lon"],
                "last_cycle_day": r["last_cycle_day"],
                "source": "synthetic_argo",
                "_internal": r,  # keeps bias/seed for synthetic lookup
            }
            for r in records
        ]


_ERDDAP_CACHE = {}  # key -> (timestamp, df, floats)
ERDDAP_CACHE_TTL = 1800  # 30 minutes in-memory cache


class ERDDAPArgoAdapter(ObservationAdapter):
    """Real INCOIS ERDDAP loader fetching live float observations from
    https://erddap.incois.gov.in/erddap/tabledap/Indian_ARGO_Floats."""

    def build_query_url(
        self,
        lat_min: float,
        lat_max: float,
        lon_min: float,
        lon_max: float,
        time_min: str = "2024-01-01T00:00:00Z",
    ) -> str:
        base = settings.ERDDAP_BASE_URL
        base_url = base if base.endswith(".csv") else f"{base.rstrip('/')}.csv"
        fields = "PLATFORM_NUMBER,latitude,longitude,time,PRES,TEMP,PSAL"
        url = (
            f"{base_url}?{fields}"
            f"&latitude%3E={lat_min}&latitude%3C={lat_max}"
            f"&longitude%3E={lon_min}&longitude%3C={lon_max}"
        )
        if time_min:
            url += f"&time%3E={time_min}"
        return url

    def load(self, query: dict) -> pd.DataFrame:
        region_key = query.get("region")
        bbox = settings.region_bbox(region_key) if region_key else None
        lat_min = query.get("lat_min", bbox["lat_min"] if bbox else settings.LAT_MIN)
        lat_max = query.get("lat_max", bbox["lat_max"] if bbox else settings.LAT_MAX)
        lon_min = query.get("lon_min", bbox["lon_min"] if bbox else settings.LON_MIN)
        lon_max = query.get("lon_max", bbox["lon_max"] if bbox else settings.LON_MAX)

        cache_key = (round(lat_min, 2), round(lat_max, 2), round(lon_min, 2), round(lon_max, 2))
        now = time.time()

        if cache_key in _ERDDAP_CACHE:
            ts, df, _ = _ERDDAP_CACHE[cache_key]
            if now - ts < ERDDAP_CACHE_TTL:
                return df

        url = self.build_query_url(lat_min, lat_max, lon_min, lon_max)
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) OceanFusion/1.0"},
        )

        try:
            resp = urllib.request.urlopen(req, timeout=15)
            df = pd.read_csv(resp, skiprows=[1])
            _ERDDAP_CACHE[cache_key] = (now, df, None)
            return df
        except Exception as e:
            print(f"[ERDDAPArgoAdapter] Live fetch warning ({e}). Falling back to local dataset.")
            try:
                csv_adapter = CSVArgoAdapter()
                return csv_adapter.load(query)
            except Exception:
                return pd.DataFrame()

    def normalize(self, raw: "pd.DataFrame | list[dict]") -> list[dict]:
        if isinstance(raw, list):
            return raw
        if raw is None or raw.empty:
            return []

        col_map = {str(c).strip().upper(): c for c in raw.columns}
        id_col = col_map.get("PLATFORM_NUMBER") or col_map.get("ID") or col_map.get("FLOAT_ID")
        lat_col = col_map.get("LATITUDE") or col_map.get("LAT")
        lon_col = col_map.get("LONGITUDE") or col_map.get("LON")
        pres_col = col_map.get("PRES") or col_map.get("PRES_ADJUSTED") or col_map.get("DEPTH")
        temp_col = col_map.get("TEMP") or col_map.get("TEMP_ADJUSTED") or col_map.get("TEMPERATURE")
        psal_col = col_map.get("PSAL") or col_map.get("PSAL_ADJUSTED") or col_map.get("SALINITY")
        time_col = col_map.get("TIME") or col_map.get("TIMESTAMP") or col_map.get("DATE")

        if not id_col or not lat_col or not lon_col:
            return []

        min_date = None
        if time_col:
            raw_time = pd.to_datetime(raw[time_col], errors="coerce").dropna()
            if len(raw_time) > 0:
                min_date = raw_time.min().floor("D")

        floats = []
        for fid, group in raw.groupby(id_col):
            if pd.isnull(fid):
                continue
            str_id = str(int(fid)) if isinstance(fid, (int, float, np.integer, np.floating)) and not pd.isna(fid) else str(fid)
            group_sorted = group.sort_values(pres_col).dropna(subset=[pres_col]) if pres_col else group

            valid_lats = group_sorted[lat_col].dropna()
            valid_lons = group_sorted[lon_col].dropna()
            lat_val = float(valid_lats.iloc[0]) if len(valid_lats) > 0 else 0.0
            lon_val = float(valid_lons.iloc[0]) if len(valid_lons) > 0 else 0.0

            cycle_day = 1
            if time_col and min_date is not None:
                group_time = pd.to_datetime(group_sorted[time_col], errors="coerce").dropna()
                if len(group_time) > 0:
                    t_val = group_time.iloc[0]
                    diff_days = int((t_val - min_date).days) + 1
                    cycle_day = max(1, min(settings.N_DAYS, diff_days))

            pres_arr = group_sorted[pres_col].values.astype(float) if pres_col else np.array([])
            temp_arr = group_sorted[temp_col].values.astype(float) if temp_col else np.array([])
            psal_arr = group_sorted[psal_col].values.astype(float) if psal_col else np.array([])

            floats.append({
                "id": str_id,
                "lat": round(lat_val, 4),
                "lon": round(lon_val, 4),
                "last_cycle_day": cycle_day,
                "source": "erddap_argo",
                "_profile_pres": pres_arr,
                "_profile_temp": temp_arr,
                "_profile_psal": psal_arr,
            })

        return floats

    def get_floats(self, query: dict) -> list[dict]:
        floats = super().get_floats(query)
        bbox = settings.region_bbox(query.get("region")) if query.get("region") else None
        lat_min = query.get("lat_min", bbox["lat_min"] if bbox else None)
        lat_max = query.get("lat_max", bbox["lat_max"] if bbox else None)
        lon_min = query.get("lon_min", bbox["lon_min"] if bbox else None)
        lon_max = query.get("lon_max", bbox["lon_max"] if bbox else None)
        if None in (lat_min, lat_max, lon_min, lon_max):
            return floats
        return [
            f for f in floats
            if lat_min <= f["lat"] <= lat_max and lon_min <= f["lon"] <= lon_max
        ]

    def to_common_schema(self, records: list[dict]) -> list[dict]:
        return records


_CACHED_CSV_DF = None
_CACHED_CSV_FLOATS = None

class CSVArgoAdapter(ObservationAdapter):
    """Adapter to load real ARGO float profile data directly from CSV files."""

    def find_csv_path(self) -> str:
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        candidates = [
            settings.CSV_ARGO_FILE_PATH,
            os.path.join(backend_dir, "data", "Indian_ARGO_Floats.csv"),
            os.path.join(backend_dir, "data", "Indian_ARGO_Floats_5ffc_ac18_b1a5.csv"),
            os.path.expanduser("~/Downloads/Indian_ARGO_Floats_5ffc_ac18_b1a5.csv"),
        ]
        data_dir = os.path.join(backend_dir, "data")
        if os.path.isdir(data_dir):
            candidates.extend(glob.glob(os.path.join(data_dir, "*.csv")))
        candidates.extend(glob.glob(os.path.expanduser("~/Downloads/*ARGO*.csv")))

        for path in candidates:
            if path and os.path.isfile(path):
                return path
        raise FileNotFoundError("No ARGO Float CSV file found.")

    def load(self, query: dict) -> pd.DataFrame:
        global _CACHED_CSV_DF
        if _CACHED_CSV_DF is not None:
            return _CACHED_CSV_DF

        path = self.find_csv_path()
        df_sample = pd.read_csv(path, nrows=2)
        has_unit_row = False
        if len(df_sample) > 0:
            first_val = str(df_sample.iloc[0].values[1]) if len(df_sample.columns) > 1 else ""
            if any(k in first_val for k in ["UTC", "degrees", "decibar", "degree"]):
                has_unit_row = True

        if has_unit_row:
            df = pd.read_csv(path, skiprows=[1])
        else:
            df = pd.read_csv(path)

        _CACHED_CSV_DF = df
        return _CACHED_CSV_DF


    def normalize(self, raw: pd.DataFrame) -> list[dict]:
        global _CACHED_CSV_FLOATS
        if _CACHED_CSV_FLOATS is not None:
            return _CACHED_CSV_FLOATS

        col_map = {str(c).upper(): c for c in raw.columns}
        id_col = col_map.get("PLATFORM_NUMBER") or col_map.get("ID") or col_map.get("FLOAT_ID")
        lat_col = col_map.get("LATITUDE") or col_map.get("LAT")
        lon_col = col_map.get("LONGITUDE") or col_map.get("LON")
        pres_col = col_map.get("PRES") or col_map.get("PRES_ADJUSTED") or col_map.get("DEPTH")
        temp_col = col_map.get("TEMP") or col_map.get("TEMP_ADJUSTED") or col_map.get("TEMPERATURE")
        psal_col = col_map.get("PSAL") or col_map.get("PSAL_ADJUSTED") or col_map.get("SALINITY")
        time_col = col_map.get("TIME") or col_map.get("TIMESTAMP") or col_map.get("DATE")

        if not id_col or not lat_col or not lon_col:
            return []

        min_date = None
        if time_col:
            raw_time = pd.to_datetime(raw[time_col], errors="coerce").dropna()
            if len(raw_time) > 0:
                min_date = raw_time.min().floor("D")

        floats = []
        for fid, group in raw.groupby(id_col):
            if pd.isnull(fid):
                continue
            str_id = str(int(fid)) if isinstance(fid, (int, float, np.integer, np.floating)) and not pd.isna(fid) else str(fid)
            group_sorted = group.sort_values(pres_col).dropna(subset=[pres_col]) if pres_col else group

            valid_lats = group_sorted[lat_col].dropna()
            valid_lons = group_sorted[lon_col].dropna()
            lat_val = float(valid_lats.iloc[0]) if len(valid_lats) > 0 else 0.0
            lon_val = float(valid_lons.iloc[0]) if len(valid_lons) > 0 else 0.0

            cycle_day = 1
            if time_col and min_date is not None:
                group_time = pd.to_datetime(group_sorted[time_col], errors="coerce").dropna()
                if len(group_time) > 0:
                    t_val = group_time.iloc[0]
                    diff_days = int((t_val - min_date).days) + 1
                    cycle_day = max(1, min(settings.N_DAYS, diff_days))

            pres_arr = group_sorted[pres_col].values.astype(float) if pres_col else np.array([])
            temp_arr = group_sorted[temp_col].values.astype(float) if temp_col else np.array([])
            psal_arr = group_sorted[psal_col].values.astype(float) if psal_col else np.array([])

            floats.append({
                "id": str_id,
                "lat": round(lat_val, 4),
                "lon": round(lon_val, 4),
                "last_cycle_day": cycle_day,
                "source": "csv_argo",
                "_profile_pres": pres_arr,
                "_profile_temp": temp_arr,
                "_profile_psal": psal_arr,
            })

        _CACHED_CSV_FLOATS = floats
        return _CACHED_CSV_FLOATS


    def quality_control(self, records: list[dict]) -> list[dict]:
        clean = []
        for f in records:
            if -90 <= f["lat"] <= 90 and -180 <= f["lon"] <= 180:
                clean.append(f)
        return clean

    def get_floats(self, query: dict) -> list[dict]:
        floats = super().get_floats(query)
        # Real-CSV floats aren't generated per region like the synthetic
        # fleet is, so filter to whichever region's bbox the frontend has
        # selected (falls back to the configured region if none is given).
        bbox = settings.region_bbox(query.get("region")) if query.get("region") else None
        lat_min = query.get("lat_min", bbox["lat_min"] if bbox else None)
        lat_max = query.get("lat_max", bbox["lat_max"] if bbox else None)
        lon_min = query.get("lon_min", bbox["lon_min"] if bbox else None)
        lon_max = query.get("lon_max", bbox["lon_max"] if bbox else None)
        if None in (lat_min, lat_max, lon_min, lon_max):
            return floats
        return [
            f for f in floats
            if lat_min <= f["lat"] <= lat_max and lon_min <= f["lon"] <= lon_max
        ]

    def to_common_schema(self, records: list[dict]) -> list[dict]:
        return records


def get_floats_for_region(query: dict) -> list[dict]:
    """Get the observation fleet for a region, preferring whatever the
    configured ARGO_SOURCE is, but falling back/supplementing with the
    synthetic fleet if the real data source has no or sparse coverage in the
    selected region (e.g. custom bounding boxes or regions outside CSV coverage)."""
    adapter = get_argo_adapter()
    floats = adapter.get_floats(query)
    min_floats_needed = 5
    if len(floats) < min_floats_needed and not isinstance(adapter, SyntheticArgoAdapter):
        synth = SyntheticArgoAdapter().get_floats(query)
        existing_ids = {f["id"] for f in floats}
        for sf in synth:
            if sf["id"] not in existing_ids:
                floats.append(sf)
                existing_ids.add(sf["id"])
    return floats


def get_argo_adapter() -> ObservationAdapter:
    if settings.ARGO_SOURCE == "erddap":
        return ERDDAPArgoAdapter()
    elif settings.ARGO_SOURCE == "csv":
        return CSVArgoAdapter()
    elif settings.ARGO_SOURCE == "synthetic":
        return SyntheticArgoAdapter()

    try:
        adapter = CSVArgoAdapter()
        adapter.find_csv_path()
        return adapter
    except Exception:
        return SyntheticArgoAdapter()


def get_observed_value(variable: str, float_common_record: dict, depth: float, day: int,
                        region: str = None) -> float:
    internal = float_common_record.get("_internal")
    if internal is not None:
        return observed_value(variable, internal, depth, day, region)

    pres_arr = float_common_record.get("_profile_pres")
    if pres_arr is not None and len(pres_arr) > 0:
        val_arr = float_common_record.get("_profile_temp" if variable == "temp" else "_profile_psal")
        if val_arr is not None and len(val_arr) > 0:
            valid_mask = ~np.isnan(pres_arr) & ~np.isnan(val_arr)
            if np.any(valid_mask):
                base_val = float(np.interp(depth, pres_arr[valid_mask], val_arr[valid_mask]))
                # Add physical day-dependent internal wave/thermocline wobble for CSV float profiles
                float_id_num = sum(ord(c) for c in str(float_common_record.get("id", "0")))
                wobble = (0.25 * np.sin(day * 0.35 + depth * 0.015 + float_id_num * 0.1)
                          if variable == "temp" else 0.04 * np.sin(day * 0.28 + depth * 0.01 + float_id_num * 0.1))
                return round(base_val + wobble, 4)

    return float(float_common_record.get("temperature" if variable == "temp" else "salinity", 20.0))

