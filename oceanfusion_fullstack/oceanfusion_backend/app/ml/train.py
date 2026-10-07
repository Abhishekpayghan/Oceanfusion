import os
import joblib
import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest

FEATURE_NAMES = [
    "temp_difference",
    "absolute_temp_difference",
    "salinity_difference",
    "absolute_salinity_difference",
    "depth",
    "latitude",
    "longitude",
    "current_speed",
    "model_uvel",
    "model_vvel",
]

MODEL_PATH = os.path.join(os.path.dirname(__file__), "model.joblib")
PROCESSED_DATA_DIR = os.path.normpath(
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "processed")
)
TRAINING_CSV_PATH = os.path.join(PROCESSED_DATA_DIR, "anomaly_training_data.csv")


def extract_features(df: pd.DataFrame) -> pd.DataFrame:
    """Extract physical features for ML matrix, guaranteeing no metadata leaks."""
    X = pd.DataFrame()
    X["temp_difference"] = df["temp_difference"].astype(float)
    X["absolute_temp_difference"] = df["temp_difference"].abs()
    X["salinity_difference"] = df["salinity_difference"].astype(float)
    X["absolute_salinity_difference"] = df["salinity_difference"].abs()
    X["depth"] = df["depth"].astype(float)
    X["latitude"] = df["latitude"].astype(float)
    X["longitude"] = df["longitude"].astype(float)
    X["current_speed"] = df.get("current_speed", 0.0).fillna(0.0).astype(float)
    X["model_uvel"] = df.get("model_uvel", 0.0).fillna(0.0).astype(float)
    X["model_vvel"] = df.get("model_vvel", 0.0).fillna(0.0).astype(float)
    return X[FEATURE_NAMES]


def train_isolation_forest(
    comparison_records: list[dict],
    contamination: float = 0.05,
    n_estimators: int = 100,
    random_state: int = 42,
) -> dict:
    """Train IsolationForest on matched model-vs-observation comparisons."""
    if not comparison_records:
        raise ValueError("No comparison records provided for training.")

    df = pd.DataFrame(comparison_records)
    total_rows = len(df)

    # Required physical fields (exclude any rows with missing values)
    required_cols = ["temp_difference", "salinity_difference", "depth", "latitude", "longitude"]
    for col in required_cols:
        if col not in df.columns:
            df[col] = np.nan

    valid_mask = df[required_cols].notnull().all(axis=1)
    df_clean = df[valid_mask].copy()
    excluded_rows = total_rows - len(df_clean)

    if len(df_clean) == 0:
        raise ValueError("No valid comparison records remaining after dropping missing values.")

    X = extract_features(df_clean)

    # Train Isolation Forest
    model = IsolationForest(
        n_estimators=n_estimators,
        contamination=contamination,
        random_state=random_state,
    )
    model.fit(X)

    # Save model
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    joblib.dump(model, MODEL_PATH)

    # Save cleaned training data CSV
    os.makedirs(PROCESSED_DATA_DIR, exist_ok=True)
    df_clean.to_csv(TRAINING_CSV_PATH, index=False)

    real_rows = int((~df_clean["synthetic"]).sum()) if "synthetic" in df_clean.columns else 0
    synthetic_rows = int(df_clean["synthetic"].sum()) if "synthetic" in df_clean.columns else 0

    return {
        "success": True,
        "algorithm": "IsolationForest",
        "training_rows": len(df_clean),
        "real_rows": real_rows,
        "synthetic_rows": synthetic_rows,
        "excluded_rows": excluded_rows,
        "features": FEATURE_NAMES,
        "model_path": MODEL_PATH,
    }
