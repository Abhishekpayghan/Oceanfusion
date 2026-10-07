from typing import Optional
from fastapi import APIRouter, Query, HTTPException

from app.config import settings
from app.schemas.api_models import (
    AnomalyStatusResponse, AnomalyTrainResponse, AnomalyDetectResponse, AnomalyItem
)
from app.services import anomaly_service

router = APIRouter(prefix="/api/anomaly", tags=["anomaly"])


@router.get("/status", response_model=AnomalyStatusResponse)
def get_status():
    """Return model status, training statistics, and feature matrix metadata."""
    return anomaly_service.get_anomaly_status()


@router.post("/train", response_model=AnomalyTrainResponse)
def train_model():
    """Trigger model training on matched comparison records and export model.joblib."""
    try:
        report = anomaly_service.train_anomaly_model()
        return AnomalyTrainResponse(**report)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")


@router.post("/detect", response_model=AnomalyDetectResponse)
@router.get("/detect", response_model=AnomalyDetectResponse)
def detect_anomalies(
    region: str = Query(settings.DEFAULT_REGION),
    depth: float = Query(0, ge=0, le=settings.DEPTH_MAX),
    day: int = Query(1, ge=1, le=settings.N_DAYS),
    inject_synthetic_anomaly: bool = Query(False),
):
    """Run anomaly detection using trained Isolation Forest model over filtered comparison data."""
    try:
        res = anomaly_service.run_anomaly_detection(
            region=region,
            depth=depth,
            day=day,
            inject_synthetic_anomaly=inject_synthetic_anomaly,
        )
        return AnomalyDetectResponse(**res)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")


@router.get("/results", response_model=list[AnomalyItem])
def get_saved_results(
    region: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    anomaly_label: Optional[str] = Query(None),
    data_source: Optional[str] = Query(None),
):
    """Fetch saved anomaly detection results with optional filters."""
    results = anomaly_service.get_saved_anomaly_results(
        region=region,
        severity=severity,
        anomaly_label=anomaly_label,
        data_source=data_source,
    )
    return [AnomalyItem(**r) for r in results]
