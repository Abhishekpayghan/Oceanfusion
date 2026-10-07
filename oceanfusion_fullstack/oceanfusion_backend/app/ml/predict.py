import os
import joblib
import pandas as pd
import numpy as np
from app.ml.train import extract_features, MODEL_PATH, FEATURE_NAMES

TEMP_DIFF_THRESHOLD = 1.5
SAL_DIFF_THRESHOLD = 0.5


def is_model_trained() -> bool:
    return os.path.exists(MODEL_PATH)


def load_model():
    if not is_model_trained():
        raise RuntimeError("Anomaly model is not trained yet. Call /api/anomaly/train first.")
    return joblib.load(MODEL_PATH)


def classify_severity(score: float, is_anomaly: bool) -> str:
    """Application-defined anomaly severity score classification."""
    if not is_anomaly:
        return "LOW"
    if score <= -0.12:
        return "HIGH"
    elif score <= -0.05:
        return "MEDIUM"
    return "LOW"


def predict_anomalies(records: list[dict]) -> list[dict]:
    """Run anomaly detection over comparison records."""
    if not records:
        return []

    model = load_model()
    df = pd.DataFrame(records)

    # Ensure required columns exist
    for c in ["temp_difference", "salinity_difference", "depth", "latitude", "longitude"]:
        if c not in df.columns:
            df[c] = np.nan

    valid_mask = df[["temp_difference", "salinity_difference", "depth", "latitude", "longitude"]].notnull().all(axis=1)
    df_valid = df[valid_mask].copy()

    if len(df_valid) == 0:
        return []

    X = extract_features(df_valid)

    raw_preds = model.predict(X)  # 1 for normal, -1 for anomaly
    raw_scores = model.decision_function(X)  # lower = more anomalous

    results = []
    for idx, (_, row) in enumerate(df_valid.iterrows()):
        pred = raw_preds[idx]
        score = float(raw_scores[idx])

        is_anomaly = bool(pred == -1)
        label = "POTENTIAL_ANOMALY" if is_anomaly else "NORMAL"
        severity = classify_severity(score, is_anomaly)

        temp_diff = float(row.get("temp_difference", 0.0) or 0.0)
        sal_diff = float(row.get("salinity_difference", 0.0) or 0.0)

        item = dict(row)
        item["anomaly_score"] = round(score, 4)
        item["anomaly_label"] = label
        item["severity"] = severity
        item["large_temp_diff"] = bool(abs(temp_diff) >= TEMP_DIFF_THRESHOLD)
        item["large_sal_diff"] = bool(abs(sal_diff) >= SAL_DIFF_THRESHOLD)
        results.append(item)

    return results
