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
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.pipeline import Pipeline
from xgboost import XGBRegressor
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

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

# Seasons to train on by default
DEFAULT_SEASONS = [2022, 2023, 2024]


def collect_training_data(seasons: list[int], max_gps_per_season: int = 24) -> pd.DataFrame:
    """Collect race data from FastF1 for multiple seasons. Saves per-GP parquets."""
    raw_dir = DATA_DIR / "raw"
    raw_dir.mkdir(exist_ok=True)

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

            # Sanitize filename
            gp_slug = gp_name.lower().replace(" ", "_").replace("/", "_")
            gp_file = raw_dir / f"{year}_{gp_slug}.parquet"

            # Load from per-GP cache if already extracted
            if gp_file.exists():
                df = pd.read_parquet(gp_file)
                all_data.append(df)
                logger.info("  [cached] %d %s → %d rows", year, gp_name, len(df))
                continue

            logger.info("  Processing %d %s...", year, gp_name)
            df = extract_race_features(year, gp_name, "R")

            if df is not None and len(df) > 0:
                df.to_parquet(gp_file, index=False)
                all_data.append(df)
                logger.info("    → %d rows saved to %s", len(df), gp_file.name)
            else:
                logger.info("    → No data")

    if not all_data:
        raise ValueError("No training data collected. Check FastF1 cache and network connection.")

    combined = pd.concat(all_data, ignore_index=True)
    logger.info("Total training rows: %d", len(combined))
    return combined


def train_model(df: pd.DataFrame, mode: str = "dry") -> tuple:
    """Train an XGBoost Regressor for tyre degradation. mode: 'dry' or 'wet'."""
    X, y, circuit_encoder = build_feature_matrix(df, mode=mode)

    # Remove extreme outliers (degradation > 15s is unrealistic)
    mask = y.between(-1.5, 6.0)
    X, y = X[mask], y[mask]

    logger.info("[%s] Training on %d samples with %d features", mode.upper(), len(X), X.shape[1])
    logger.info("Feature columns: %s", list(X.columns))
    logger.info("Target range: %.2f – %.2f s", y.min(), y.max())

    # Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.15, random_state=42
    )

    # Pipeline: XGBoost with early stopping
    pipeline = Pipeline([
        ("model", XGBRegressor(
            n_estimators=1000,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            min_child_weight=20,
            random_state=42,
            early_stopping_rounds=50,
            eval_metric="mae",
            verbosity=0,
        )),
    ])

    logger.info("Training XGBoost Regressor (early stopping on val MAE)...")
    pipeline.fit(
        X_train, y_train,
        model__eval_set=[(X_test, y_test)],
        model__verbose=False,
    )

    # Evaluate
    y_pred = pipeline.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)
    logger.info("Test MAE: %.3f s | R²: %.3f", mae, r2)

    return pipeline, circuit_encoder, list(X.columns)


def save_model(pipeline: Pipeline, circuit_encoder, feature_columns: list, output_name: str, seasons: list[int]) -> Path:
    """Save the trained model with metadata."""
    output_path = MODELS_DIR / output_name

    payload = {
        "model": pipeline,
        "seasons": seasons,
        "circuit_encoder": circuit_encoder,
        "feature_columns": feature_columns,
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
    cache_path = DATA_DIR / f"training_data_{seasons[0]}_{seasons[-1]}.parquet"

    logger.info("Training on seasons: %s", seasons)

    # Load from parquet cache if available, otherwise extract and save
    if cache_path.exists():
        logger.info("Loading cached training data from %s", cache_path)
        df = pd.read_parquet(cache_path)
        logger.info("Loaded %d rows from cache", len(df))
    else:
        df = collect_training_data(seasons, max_gps_per_season=args.max_gps)
        df.to_parquet(cache_path, index=False)
        logger.info("Saved training data to %s (%d rows)", cache_path, len(df))

    # Train dry model
    try:
        pipeline_dry, enc_dry, cols_dry = train_model(df, mode="dry")
        dry_name = f"degradation_dry_{seasons[0]}_{seasons[-1]}.pkl"
        save_model(pipeline_dry, enc_dry, cols_dry, dry_name, seasons)
        print(f"\nDry model saved: {MODELS_DIR / dry_name}")
    except Exception as e:
        logger.error("Dry model training failed: %s", e)

    # Train wet model
    try:
        pipeline_wet, enc_wet, cols_wet = train_model(df, mode="wet")
        wet_name = f"degradation_wet_{seasons[0]}_{seasons[-1]}.pkl"
        save_model(pipeline_wet, enc_wet, cols_wet, wet_name, seasons)
        print(f"Wet model saved: {MODELS_DIR / wet_name}")
    except Exception as e:
        logger.warning("Wet model training failed (not enough wet laps?): %s", e)


if __name__ == "__main__":
    main()
