"""
Tyre Degradation Model Training Script.

Usage:
    python ml/train.py
    python ml/train.py --seasons 2022 2023 2024
    python ml/train.py --seasons 2024 --output degradation_2024.pkl

This script:
1. Loads race data from FastF1 for the specified seasons
2. Extracts features (tyre_age, compound, temperatures, circuit)
3. Trains a Gradient Boosting Regressor
4. Saves the model to ml/saved_models/
"""

import sys
import os
import logging
import argparse
import pickle
from pathlib import Path

# Add backend dir to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
import joblib
import fastf1

from ml.feature_engineering import extract_race_features, build_feature_matrix

# Enable FastF1 cache
cache_dir = Path(__file__).parent.parent / "cache"
cache_dir.mkdir(exist_ok=True)
fastf1.Cache.enable_cache(str(cache_dir))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).parent / "saved_models"
MODELS_DIR.mkdir(exist_ok=True)

# Seasons to train on by default
DEFAULT_SEASONS = [2022, 2023, 2024]


def collect_training_data(seasons: list[int], max_gps_per_season: int = 24) -> pd.DataFrame:
    """Collect race data from FastF1 for multiple seasons."""
    all_data: list[pd.DataFrame] = []

    for year in seasons:
        logger.info("Loading schedule for %d...", year)
        try:
            schedule = fastf1.get_event_schedule(year, include_testing=False)
        except Exception as exc:
            logger.warning("Could not load schedule for %d: %s", year, exc)
            continue

        for _, event in schedule.head(max_gps_per_season).iterrows():
            gp_name = str(event.get("EventName", ""))
            if not gp_name:
                continue

            logger.info("  Processing %d %s...", year, gp_name)
            df = extract_race_features(year, gp_name, "R")

            if df is not None and len(df) > 0:
                all_data.append(df)
                logger.info("    → %d rows extracted", len(df))
            else:
                logger.info("    → No data")

    if not all_data:
        raise ValueError("No training data collected. Check FastF1 cache and network connection.")

    combined = pd.concat(all_data, ignore_index=True)
    logger.info("Total training rows: %d", len(combined))
    return combined


def train_model(df: pd.DataFrame) -> Pipeline:
    """Train a Gradient Boosting Regressor for tyre degradation."""
    X, y = build_feature_matrix(df)

    # Remove extreme outliers (degradation > 15s is unrealistic)
    mask = y.between(-2, 15)
    X, y = X[mask], y[mask]

    logger.info("Training on %d samples with %d features", len(X), X.shape[1])
    logger.info("Feature columns: %s", list(X.columns))
    logger.info("Target range: %.2f – %.2f s", y.min(), y.max())

    # Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.15, random_state=42
    )

    # Pipeline: scale + GBR
    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("model", GradientBoostingRegressor(
            n_estimators=300,
            max_depth=5,
            learning_rate=0.05,
            subsample=0.8,
            min_samples_leaf=20,
            random_state=42,
            verbose=0,
        )),
    ])

    logger.info("Training Gradient Boosting Regressor...")
    pipeline.fit(X_train, y_train)

    # Evaluate
    y_pred = pipeline.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)
    logger.info("Test MAE: %.3f s | R²: %.3f", mae, r2)

    return pipeline


def save_model(pipeline: Pipeline, output_name: str, seasons: list[int]) -> Path:
    """Save the trained model with metadata."""
    output_path = MODELS_DIR / output_name

    payload = {
        "model": pipeline,
        "seasons": seasons,
        "feature_columns": [
            "tyre_age", "track_temp", "air_temp",
            "compound_SOFT", "compound_MEDIUM", "compound_HARD",
            "compound_INTER", "compound_WET",
        ],
    }

    joblib.dump(payload, output_path)
    logger.info("Model saved to %s", output_path)
    return output_path


def main():
    parser = argparse.ArgumentParser(description="Train tyre degradation model")
    parser.add_argument(
        "--seasons",
        nargs="+",
        type=int,
        default=DEFAULT_SEASONS,
        help="Season years to train on (default: 2022 2023 2024)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output model filename (default: degradation_v1_{year_range}.pkl)",
    )
    parser.add_argument(
        "--max-gps",
        type=int,
        default=24,
        help="Maximum GPs per season to process (default: 24 = all)",
    )
    args = parser.parse_args()

    seasons = sorted(args.seasons)
    output_name = args.output or f"degradation_v1_{seasons[0]}_{seasons[-1]}.pkl"

    logger.info("Training on seasons: %s", seasons)
    logger.info("Output: %s", output_name)

    # Collect data
    df = collect_training_data(seasons, max_gps_per_season=args.max_gps)

    # Train
    pipeline = train_model(df)

    # Save
    path = save_model(pipeline, output_name, seasons)
    print(f"\nModel saved: {path}")
    print("To use: POST /api/v1/predict/degradation")


if __name__ == "__main__":
    main()
