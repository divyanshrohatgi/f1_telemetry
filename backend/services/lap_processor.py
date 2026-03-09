"""
Lap data processing: cleaning, outlier flagging, pit stop detection.
"""

import logging
from typing import Optional
import pandas as pd
import fastf1

from services.fastf1_loader import timedelta_to_seconds

logger = logging.getLogger(__name__)

# Track status codes from FastF1
TRACK_STATUS_MAP = {
    "1": "green",
    "2": "yellow",
    "3": "red",
    "4": "SC",       # Safety car
    "5": "red",      # Red flag
    "6": "VSC",      # Virtual safety car
    "7": "VSC_end",
}

COMPOUND_ORDER = ["SOFT", "MEDIUM", "HARD", "INTER", "WET", "UNKNOWN"]


def process_driver_laps(
    session: fastf1.core.Session,
    driver_code: str,
) -> dict:
    """
    Process all laps for a driver in a session.

    Returns a dict with:
      - laps: list of processed lap dicts
      - fastest_lap_number: int or None
    """
    try:
        driver_laps: pd.DataFrame = session.laps.pick_drivers(driver_code)
    except Exception as exc:
        logger.error("Could not get laps for driver %s: %s", driver_code, exc)
        return {"laps": [], "fastest_lap_number": None}

    if driver_laps.empty:
        return {"laps": [], "fastest_lap_number": None}

    processed_laps = []
    fastest_time: Optional[float] = None
    fastest_lap_number: Optional[int] = None

    # Build a stint → pit_duration map
    pit_durations = _calculate_pit_durations(driver_laps)

    # Build a lap_number → LapStartTime (seconds) map for estimating missing lap times
    lap_start_times: dict[int, float] = {}
    for _, row in driver_laps.iterrows():
        lst = timedelta_to_seconds(row.get("LapStartTime"))
        if lst is not None:
            lap_start_times[int(row.get("LapNumber", 0))] = lst

    for _, row in driver_laps.iterrows():
        lap_time = timedelta_to_seconds(row.get("LapTime"))
        s1 = timedelta_to_seconds(row.get("Sector1Time"))
        s2 = timedelta_to_seconds(row.get("Sector2Time"))
        s3 = timedelta_to_seconds(row.get("Sector3Time"))

        lap_number = int(row.get("LapNumber", 0))
        compound = _normalize_compound(row.get("Compound", "UNKNOWN"))
        tyre_life = _safe_int(row.get("TyreLife"))
        stint = _safe_int(row.get("Stint"))

        # Pit flags
        is_pit_in = bool(row.get("PitInTime") is not None and not pd.isna(row.get("PitInTime")))
        is_pit_out = bool(row.get("PitOutTime") is not None and not pd.isna(row.get("PitOutTime")))

        pit_in_time = timedelta_to_seconds(row.get("PitInTime"))
        pit_out_time = timedelta_to_seconds(row.get("PitOutTime"))

        pit_duration = pit_durations.get(lap_number)

        # Track status
        track_status = str(row.get("TrackStatus", "1"))

        # Deleted lap detection (time set but later deleted due to track limits)
        is_deleted = bool(row.get("Deleted", False))
        is_accurate = bool(row.get("IsAccurate", True))

        # Estimate missing lap time from consecutive LapStartTime deltas
        is_estimated = False
        if lap_time is None and not is_deleted:
            cur_start = lap_start_times.get(lap_number)
            next_start = lap_start_times.get(lap_number + 1)
            if cur_start is not None and next_start is not None:
                estimated = next_start - cur_start
                if 20 < estimated < 600:  # sanity: 20s–10min
                    lap_time = estimated
                    is_estimated = True

        # Speed trap
        speed_trap = row.get("SpeedI2") or row.get("SpeedST")
        if pd.isna(speed_trap) if speed_trap is not None else True:
            speed_trap = None

        lap_dict = {
            "lap_number": lap_number,
            "lap_time": lap_time,
            "sector1_time": s1,
            "sector2_time": s2,
            "sector3_time": s3,
            "compound": compound,
            "tyre_life": tyre_life,
            "stint": stint,
            "is_pit_out_lap": is_pit_out,
            "is_pit_in_lap": is_pit_in,
            "is_deleted": is_deleted,
            "is_accurate": is_accurate,
            "is_estimated": is_estimated,
            "track_status": track_status,
            "pit_in_time": pit_in_time,
            "pit_out_time": pit_out_time,
            "pit_duration": pit_duration,
            "speed_trap": float(speed_trap) if speed_trap is not None else None,
        }

        processed_laps.append(lap_dict)

        # Track fastest lap (only accurate, non-deleted laps)
        if lap_time and is_accurate and not is_deleted:
            if fastest_time is None or lap_time < fastest_time:
                fastest_time = lap_time
                fastest_lap_number = lap_number

    return {
        "laps": processed_laps,
        "fastest_lap_number": fastest_lap_number,
    }


def _calculate_pit_durations(driver_laps: pd.DataFrame) -> dict[int, float]:
    """
    Calculate pit stop duration for each pit-in lap.
    Pit duration = pit-out time of next lap - pit-in time of current lap.
    """
    durations: dict[int, float] = {}

    pit_in_laps = driver_laps[
        driver_laps["PitInTime"].notna() & (driver_laps["PitInTime"] != pd.NaT)
    ]

    for _, row in pit_in_laps.iterrows():
        lap_number = int(row["LapNumber"])
        pit_in = row["PitInTime"]

        # Find the next lap with a pit-out time
        next_laps = driver_laps[
            (driver_laps["LapNumber"] > lap_number) &
            driver_laps["PitOutTime"].notna()
        ]

        if not next_laps.empty:
            pit_out = next_laps.iloc[0]["PitOutTime"]
            try:
                duration = (pit_out - pit_in).total_seconds()
                if 0 < duration < 120:  # sanity check: 0–120 seconds
                    durations[lap_number] = duration
            except Exception:
                pass

    return durations


def _normalize_compound(compound: str) -> str:
    """Normalize compound strings to canonical F1 compound names."""
    if not compound or pd.isna(compound):
        return "UNKNOWN"

    compound = str(compound).upper().strip()
    compound_map = {
        "S": "SOFT",
        "SOFT": "SOFT",
        "M": "MEDIUM",
        "MEDIUM": "MEDIUM",
        "H": "HARD",
        "HARD": "HARD",
        "I": "INTER",
        "INTER": "INTER",
        "INTERMEDIATE": "INTER",
        "W": "WET",
        "WET": "WET",
        "HYPERSOFT": "SOFT",
        "ULTRASOFT": "SOFT",
        "SUPERSOFT": "SOFT",
        "TEST_UNKNOWN": "UNKNOWN",
        "UNKNOWN": "UNKNOWN",
        "NA": "UNKNOWN",
    }
    return compound_map.get(compound, compound)


def _safe_int(val) -> Optional[int]:
    """Safely convert to int, returning None on failure."""
    try:
        if val is None or (isinstance(val, float) and pd.isna(val)):
            return None
        return int(val)
    except (ValueError, TypeError):
        return None


def get_safety_car_laps(session: fastf1.core.Session) -> list[int]:
    """Return list of lap numbers where a safety car or VSC was deployed."""
    if session.laps is None or session.laps.empty:
        return []

    sc_laps = []
    all_laps = session.laps

    for _, row in all_laps.iterrows():
        status = str(row.get("TrackStatus", "1"))
        if "4" in status or "6" in status:  # SC or VSC
            lap_num = int(row.get("LapNumber", 0))
            if lap_num not in sc_laps:
                sc_laps.append(lap_num)

    return sorted(sc_laps)
