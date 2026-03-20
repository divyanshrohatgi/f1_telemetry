"""
Feature engineering for the tyre degradation ML model.

Target: lap_time_delta — how many seconds slower this lap is vs lap 1 on the same compound.
Features: tyre_age, compound (one-hot), track_temp, air_temp, fuel_corrected_time, circuit_id.

Excluded from training: safety car laps, VSC laps, deleted laps, pit in/out laps.
"""

import logging
import pandas as pd
import numpy as np
from typing import Optional
from sklearn.preprocessing import LabelEncoder

from services.fastf1_loader import load_session, timedelta_to_seconds
from services.lap_processor import _normalize_compound

logger = logging.getLogger(__name__)

VALID_COMPOUNDS = ['SOFT', 'MEDIUM', 'HARD', 'INTER', 'WET']
SC_TRACK_STATUSES = {'4', '6'}   # Safety car / VSC codes
FUEL_BURN_PER_LAP = 0.035        # seconds per lap (approximate fuel correction)


def extract_race_features(
    year: int,
    gp: str,
    session_type: str = 'R',
) -> Optional[pd.DataFrame]:
    """
    Extract features for one race session for ML training.

    Returns a DataFrame with columns:
      circuit_id, compound, tyre_age, track_temp, air_temp,
      fuel_corrected_lap_time, lap_time_delta, year
    Or None if the session cannot be loaded.
    """
    try:
        session = load_session(year, gp, session_type, load_laps=True, load_weather=True)
    except Exception as exc:
        logger.warning("Could not load %s %s %s for ML: %s", year, gp, session_type, exc)
        return None

    if session.laps is None or session.laps.empty:
        return None

    # Sanitize circuit ID from event name
    circuit_id = str(session.event.get("Location", gp)).lower().replace(" ", "_")

    # Weather: average per session
    avg_track_temp = 30.0
    avg_air_temp = 25.0
    avg_humidity = 50.0
    avg_rainfall = 0.0
    try:
        if session.weather_data is not None and not session.weather_data.empty:
            avg_track_temp = float(session.weather_data["TrackTemp"].mean())
            avg_air_temp = float(session.weather_data["AirTemp"].mean())
            if "Humidity" in session.weather_data.columns:
                avg_humidity = float(session.weather_data["Humidity"].mean())
            if "Rainfall" in session.weather_data.columns:
                avg_rainfall = float(session.weather_data["Rainfall"].mean())
    except Exception:
        pass

    records = []

    # Process each driver's laps
    all_drivers = session.laps["Driver"].unique()

    for driver in all_drivers:
        driver_laps = session.laps[session.laps["Driver"] == driver].copy()
        driver_laps = driver_laps.sort_values("LapNumber")

        # Filter out invalid laps
        driver_laps = driver_laps[
            driver_laps["LapTime"].notna() &
            driver_laps["IsAccurate"].fillna(True) &
            ~driver_laps["Deleted"].fillna(False) &
            driver_laps["PitInTime"].isna() &
            driver_laps["PitOutTime"].isna()
        ]

        # Filter out SC/VSC laps
        driver_laps = driver_laps[
            ~driver_laps["TrackStatus"].fillna("1").apply(
                lambda ts: any(code in str(ts) for code in SC_TRACK_STATUSES)
            )
        ]

        if len(driver_laps) < 3:
            continue

        # Normalize compound
        driver_laps = driver_laps.copy()
        driver_laps["compound_norm"] = driver_laps["Compound"].apply(_normalize_compound)
        driver_laps = driver_laps[driver_laps["compound_norm"].isin(VALID_COMPOUNDS)]

        # Convert lap times to seconds
        driver_laps["lap_time_sec"] = driver_laps["LapTime"].apply(timedelta_to_seconds)
        driver_laps = driver_laps[driver_laps["lap_time_sec"].notna()]
        driver_laps = driver_laps[driver_laps["lap_time_sec"].between(60, 200)]

        if len(driver_laps) < 3:
            continue

        total_laps = int(driver_laps["LapNumber"].max())

        # Per stint: compute delta vs lap 3 of that stint (tyres up to temp by then)
        for stint_num in driver_laps["Stint"].dropna().unique():
            stint_laps = driver_laps[driver_laps["Stint"] == stint_num].copy()

            if len(stint_laps) < 4:  # Need enough laps after skipping warm-up
                continue

            compound = stint_laps["compound_norm"].iloc[0]
            # Skip first 2 laps (out-lap has cold tyres, lap 2 may have pit traffic)
            # Use lap 3 as baseline — tyres are up to temperature by then
            base_time = stint_laps["lap_time_sec"].iloc[2]

            # Only process from lap 3 onwards
            for i, (_, row) in enumerate(stint_laps.iloc[2:].iterrows()):
                tyre_life = row.get("TyreLife", None)
                tyre_age = int(tyre_life) if tyre_life is not None and not pd.isna(tyre_life) else i + 3
                lap_number = int(row["LapNumber"])
                lap_time = row["lap_time_sec"]

                # Fuel correction: earlier laps have more fuel → slower
                # By lap N: lap is lighter, subtract correction
                fuel_correction = (total_laps - lap_number) * FUEL_BURN_PER_LAP
                fuel_corrected_time = lap_time - fuel_correction

                # Fuel-correct both times to remove fuel weight effect
                # Add time back proportional to laps driven (later laps are artificially fast from light fuel)
                base_lap_number = int(stint_laps["LapNumber"].iloc[2])
                base_fc = base_time + (base_lap_number - 1) * FUEL_BURN_PER_LAP
                current_fc = lap_time + (lap_number - 1) * FUEL_BURN_PER_LAP
                lap_time_delta = current_fc - base_fc

                # Skip obvious outliers at extraction time
                if abs(lap_time_delta) > 8.0:
                    continue

                records.append({
                    "circuit_id": circuit_id,
                    "year": year,
                    "compound": compound,
                    "tyre_age": tyre_age,
                    "track_temp": avg_track_temp,
                    "air_temp": avg_air_temp,
                    "fuel_corrected_lap_time": fuel_corrected_time,
                    "lap_time_delta": lap_time_delta,
                    # Extra fields saved for future model iterations
                    "lap_number": lap_number,
                    "driver": str(row.get("Driver", "")),
                    "team": str(row.get("Team", "")),
                    "position": float(row["Position"]) if pd.notna(row.get("Position")) else float("nan"),
                    "stint": int(row["Stint"]) if pd.notna(row.get("Stint")) else None,
                    "speed_i1": float(row["SpeedI1"]) if pd.notna(row.get("SpeedI1")) else float("nan"),
                    "speed_i2": float(row["SpeedI2"]) if pd.notna(row.get("SpeedI2")) else float("nan"),
                    "speed_st": float(row["SpeedST"]) if pd.notna(row.get("SpeedST")) else float("nan"),
                    "humidity": avg_humidity,
                    "rainfall": avg_rainfall,
                    "is_fresh_tyre": tyre_age <= 3,
                })

    if not records:
        return None

    return pd.DataFrame(records)


DRY_FEATURE_COLS = [
    "tyre_age", "track_temp", "air_temp", "humidity", "circuit_encoded",
    "position", "speed_i1", "speed_i2", "speed_st", "is_fresh_tyre",
    "compound_SOFT", "compound_MEDIUM", "compound_HARD", "compound_INTER", "compound_WET",
]

WET_FEATURE_COLS = [
    "tyre_age", "track_temp", "air_temp", "humidity", "circuit_encoded",
    "position", "speed_i1", "speed_i2", "speed_st", "is_fresh_tyre",
    "compound_SOFT", "compound_MEDIUM", "compound_HARD", "compound_INTER", "compound_WET",
]


def build_feature_matrix(
    df: pd.DataFrame, mode: str = "dry"
) -> tuple[pd.DataFrame, pd.Series, LabelEncoder]:
    """
    Transform raw features into the ML-ready feature matrix.

    mode: "dry" (rainfall==0) or "wet" (rainfall>0)

    Returns (X, y, circuit_encoder)
    """
    df = df.copy()

    # ── Recompute lap_time_delta from raw data at training time ──────────
    # Parquet files are never modified. Formula tweaks only require retraining.
    # fuel_corrected_lap_time was saved with old constant 0.035 — recover raw time first.
    FUEL_CORRECTION = 0.065  # Real F1 fuel effect ~0.065s/lap

    if "fuel_corrected_lap_time" in df.columns and "lap_number" in df.columns:
        total_per_race = df.groupby(["circuit_id", "year"])["lap_number"].transform("max")
        raw_time = df["fuel_corrected_lap_time"] + (total_per_race - df["lap_number"]) * 0.035
        df["_fc"] = raw_time + (df["lap_number"] - 1) * FUEL_CORRECTION
        df["lap_time_delta"] = df.groupby(
            ["driver", "circuit_id", "year", "stint"]
        )["_fc"].transform(lambda g: g - g.iloc[0])
        df.drop(columns=["_fc"], inplace=True)

    # Split by rainfall
    if mode == "dry":
        df = df[df["rainfall"].fillna(0) == 0]
    else:
        df = df[df["rainfall"].fillna(0) > 0]

    if len(df) == 0:
        raise ValueError(f"No laps for mode='{mode}' after rainfall split")

    # Label-encode circuit
    circuit_encoder = LabelEncoder()
    df["circuit_encoded"] = circuit_encoder.fit_transform(df["circuit_id"].astype(str))

    # Fill missing numeric fields
    for col in ["position", "speed_i1", "speed_i2", "speed_st"]:
        if col in df.columns:
            df[col] = df[col].fillna(df[col].median())
        else:
            df[col] = 0.0

    df["is_fresh_tyre"] = df["is_fresh_tyre"].fillna(False).astype(int)
    df["humidity"] = df["humidity"].fillna(50.0)

    # One-hot encode compound
    compound_dummies = pd.get_dummies(df["compound"], prefix="compound")
    for c in VALID_COMPOUNDS:
        col = f"compound_{c}"
        if col not in compound_dummies.columns:
            compound_dummies[col] = 0

    feature_cols = DRY_FEATURE_COLS if mode == "dry" else WET_FEATURE_COLS
    base_cols = [c for c in feature_cols if not c.startswith("compound_")]
    compound_cols = [c for c in feature_cols if c.startswith("compound_")]

    X = pd.concat([
        df[base_cols],
        compound_dummies[compound_cols],
    ], axis=1)

    y = df["lap_time_delta"]

    return X, y, circuit_encoder
