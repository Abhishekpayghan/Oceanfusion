from typing import Optional

from pydantic import BaseModel, ConfigDict


class _NoProtectedNamespace(BaseModel):
    model_config = ConfigDict(protected_namespaces=())


class SliceResponse(_NoProtectedNamespace):
    variable: str
    depth: float
    day: int
    region: str = ""
    lats: list[float]
    lons: list[float]
    values: list[list[float]]   # [lat_index][lon_index]
    vmin: float
    vmax: float
    units: str
    source: str


class VolumeLevel(_NoProtectedNamespace):
    depth: float
    values: list[list[float]]


class VolumeResponse(_NoProtectedNamespace):
    variable: str
    day: int
    region: str = ""
    lats: list[float]
    lons: list[float]
    levels: list[VolumeLevel]
    units: str


class CurrentsResponse(_NoProtectedNamespace):
    day: int
    region: str = ""
    lats: list[float]
    lons: list[float]
    u: list[list[float]]
    v: list[list[float]]


class RegionInfo(_NoProtectedNamespace):
    key: str
    label: str
    lat_min: float
    lat_max: float
    lon_min: float
    lon_max: float


class RegionsResponse(_NoProtectedNamespace):
    default: str
    regions: list[RegionInfo]


class ArgoPoint(_NoProtectedNamespace):
    id: str
    lat: float
    lon: float
    last_cycle_day: int
    source: str


class ArgoListResponse(_NoProtectedNamespace):
    count: int
    region: str = ""
    floats: list[ArgoPoint]


class ArgoProfileResponse(_NoProtectedNamespace):
    id: str
    lat: float
    lon: float
    day: int
    depths: list[float]
    observed: list[float]
    model: list[float]
    variable: str


class CompareResponse(_NoProtectedNamespace):
    id: str
    variable: str
    depth: float
    day: int
    model_value: float
    observed_value: float
    signed_error: float
    method: str


class FleetStatsResponse(_NoProtectedNamespace):
    variable: str
    depth: float
    day: int
    n: int
    bias: Optional[float]
    mae: Optional[float]
    rmse: Optional[float]
    per_float_error: dict[str, float]


class AnomalyResponse(_NoProtectedNamespace):
    variable: str
    depth: float
    day: int
    flags: dict[str, dict]


class MetadataResponse(_NoProtectedNamespace):
    model_source: str
    argo_source: str
    region_key: str = ""
    region_label: str = ""
    region: dict
    depth_levels: list[float]
    n_days: int
    variables: dict
    provenance_note: str


class AnomalyItem(_NoProtectedNamespace):
    platform_number: str
    cycle_number: int = 1
    time: str = ""
    latitude: float
    longitude: float
    depth: float
    argo_temp: Optional[float] = None
    model_temp: Optional[float] = None
    temp_difference: Optional[float] = None
    argo_salinity: Optional[float] = None
    model_salinity: Optional[float] = None
    salinity_difference: Optional[float] = None
    current_speed: Optional[float] = None
    data_source: str
    synthetic: bool
    anomaly_score: float
    anomaly_label: str
    severity: str
    large_temp_diff: bool = False
    large_sal_diff: bool = False
    synthetic_test_anomaly: bool = False


class AnomalyStatusResponse(_NoProtectedNamespace):
    model_trained: bool
    trained_rows: int = 0
    real_rows: int = 0
    synthetic_rows: int = 0
    features: list[str] = []
    model_path: str = ""


class AnomalyTrainResponse(_NoProtectedNamespace):
    success: bool
    algorithm: str = "IsolationForest"
    training_rows: int
    real_rows: int
    synthetic_rows: int
    excluded_rows: int
    features: list[str]
    model_path: str


class AnomalyDetectResponse(_NoProtectedNamespace):
    count: int
    normal_count: int
    potential_anomaly_count: int
    real_count: int
    synthetic_count: int
    region: str = ""
    depth: float = 0.0
    day: int = 1
    results: list[AnomalyItem]

