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
    try:
        if session.weather_data is not None and not session.weather_data.empty:
            avg_track_temp = float(session.weather_data["TrackTemp"].mean())
            avg_air_temp = float(session.weather_data["AirTemp"].mean())
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

        # Per stint: compute delta vs lap 1 of that stint
        for stint_num in driver_laps["Stint"].dropna().unique():
            stint_laps = driver_laps[driver_laps["Stint"] == stint_num].copy()

            if len(stint_laps) < 2:
                continue

            compound = stint_laps["compound_norm"].iloc[0]
            base_time = stint_laps["lap_time_sec"].iloc[0]  # Reference: lap 1 of stint

            for i, (_, row) in enumerate(stint_laps.iterrows()):
                tyre_age = int(row.get("TyreLife", i + 1))
                lap_number = int(row["LapNumber"])
                lap_time = row["lap_time_sec"]

                # Fuel correction: earlier laps have more fuel → slower
                # By lap N: lap is lighter, subtract correction
                fuel_correction = (total_laps - lap_number) * FUEL_BURN_PER_LAP
                fuel_corrected_time = lap_time - fuel_correction

                lap_time_delta = lap_time - base_time  # seconds slower vs lap 1 of stint

                records.append({
                    "circuit_id": circuit_id,
                    "year": year,
                    "compound": compound,
                    "tyre_age": tyre_age,
                    "track_temp": avg_track_temp,
                    "air_temp": avg_air_temp,
                    "fuel_corrected_lap_time": fuel_corrected_time,
                    "lap_time_delta": lap_time_delta,
                })

    if not records:
        return None

    return pd.DataFrame(records)


def build_feature_matrix(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    """
    Transform raw features into the ML-ready feature matrix.

    Returns (X, y) where:
      X: DataFrame with encoded features
      y: Series of lap_time_delta (seconds)
    """
    # One-hot encode compound
    compound_dummies = pd.get_dummies(df["compound"], prefix="compound")

    # Ensure all compounds are represented (for consistent feature columns)
    for c in VALID_COMPOUNDS:
        col = f"compound_{c}"
        if col not in compound_dummies.columns:
            compound_dummies[col] = 0

    X = pd.concat([
        df[["tyre_age", "track_temp", "air_temp"]],
        compound_dummies[[f"compound_{c}" for c in VALID_COMPOUNDS]],
    ], axis=1)

    y = df["lap_time_delta"]

    return X, y
