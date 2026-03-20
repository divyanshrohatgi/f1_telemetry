"""
Recompute lap_time_delta in all cached parquet files using fuel-corrected times.
No re-download needed — works on existing data/raw/*.parquet files.

Usage:
    cd backend
    python -m scripts.fix_deltas
"""

import os
import glob
import logging
import pandas as pd

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

FUEL_BURN_PER_LAP = 0.065  # seconds per lap
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
RAW_DIR = os.path.join(DATA_DIR, "raw")


def fix_parquet(filepath: str) -> bool:
    try:
        df = pd.read_parquet(filepath)
    except Exception as e:
        logger.warning("Could not read %s: %s", filepath, e)
        return False

    if df.empty or "lap_number" not in df.columns:
        return False

    if "fuel_corrected_lap_time" not in df.columns:
        logger.warning("No fuel_corrected_lap_time in %s — skipping", filepath)
        return False

    # Recover raw lap time (was saved with old constant 0.035)
    df["_total_laps"] = df.groupby(["circuit_id", "year"])["lap_number"].transform("max")
    df["_raw_time"] = df["fuel_corrected_lap_time"] + (df["_total_laps"] - df["lap_number"]) * 0.035

    # Fuel-correct: normalise all laps to "full fuel" equivalent
    df["_fc_time"] = df["_raw_time"] + (df["lap_number"] - 1) * FUEL_BURN_PER_LAP

    # Recompute delta per driver per stint (baseline = first row, already lap 3+)
    new_deltas = pd.Series(dtype=float, index=df.index)
    for (driver, stint), grp in df.groupby(["driver", "stint"]):
        if len(grp) < 2:
            continue
        base_fc = grp["_fc_time"].iloc[0]
        new_deltas.loc[grp.index] = grp["_fc_time"] - base_fc

    df["lap_time_delta"] = new_deltas

    # Update fuel_corrected_lap_time with new constant
    df["fuel_corrected_lap_time"] = df["_raw_time"] - (df["_total_laps"] - df["lap_number"]) * FUEL_BURN_PER_LAP

    df.drop(columns=["_total_laps", "_raw_time", "_fc_time"], inplace=True)
    df = df.dropna(subset=["lap_time_delta"])
    df = df[df["lap_time_delta"].between(-1.5, 8.0)]

    df.to_parquet(filepath, index=False)
    return True


def main():
    parquet_files = glob.glob(os.path.join(RAW_DIR, "*.parquet"))

    if not parquet_files:
        logger.error("No parquet files found in %s", RAW_DIR)
        return

    logger.info("Found %d parquet files", len(parquet_files))

    all_deltas = []
    fixed = 0

    for filepath in sorted(parquet_files):
        if fix_parquet(filepath):
            df = pd.read_parquet(filepath)
            all_deltas.extend(df["lap_time_delta"].tolist())
            logger.info("  %-45s %d rows  mean=+%.3fs", os.path.basename(filepath), len(df), df["lap_time_delta"].mean())
            fixed += 1
        else:
            logger.warning("  %s: skipped", os.path.basename(filepath))

    logger.info("\nFixed %d / %d files", fixed, len(parquet_files))

    if all_deltas:
        s = pd.Series(all_deltas)
        logger.info("Overall delta stats: mean=+%.3fs  std=%.3fs  min=%.3fs  max=+%.3fs",
                    s.mean(), s.std(), s.min(), s.max())

    # Delete combined training cache so it gets rebuilt on next train
    for f in glob.glob(os.path.join(DATA_DIR, "training_data_*.parquet")):
        os.remove(f)
        logger.info("Deleted %s", os.path.basename(f))


if __name__ == "__main__":
    main()
