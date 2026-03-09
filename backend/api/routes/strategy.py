"""
Tyre strategy routes — stint timeline data for all drivers.
"""

import logging
from typing import Optional
import pandas as pd
from fastapi import APIRouter, HTTPException

from models.schemas import StrategyResponse, DriverStrategy, Stint
from services.fastf1_loader import load_session, get_drivers_for_session, timedelta_to_seconds
from services.lap_processor import process_driver_laps, _normalize_compound

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/v1/strategy/{year}/{gp}/{session_type}", response_model=StrategyResponse)
async def get_strategy(year: int, gp: str, session_type: str):
    """
    Return tyre strategy (stints) for all drivers in a session.

    Sorted by finishing position for race sessions, otherwise by driver code.
    """
    session_type_upper = session_type.upper()

    try:
        session = load_session(year, gp, session_type_upper, load_laps=True)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Failed to load session: {exc}")

    raw_drivers = get_drivers_for_session(session, year)
    if not raw_drivers:
        raise HTTPException(status_code=404, detail="No driver data in session")

    # Get finishing positions from results
    position_map: dict[str, Optional[int]] = {}
    if session.results is not None and not session.results.empty:
        for _, row in session.results.iterrows():
            code = row.get("Abbreviation", "???")
            pos = row.get("Position")
            try:
                position_map[code] = int(pos) if pos is not None and not pd.isna(pos) else None
            except (ValueError, TypeError):
                position_map[code] = None

    driver_strategies = []

    for driver_code, driver_info in raw_drivers.items():
        # Process laps to get stint data
        laps_result = process_driver_laps(session, driver_code)
        laps = laps_result["laps"]

        if not laps:
            continue

        stints = _build_stints(laps, driver_code)
        if not stints:
            continue

        total_pit_time = sum(
            s["pit_duration"] for s in stints if s.get("pit_duration") is not None
        )

        driver_strategies.append(DriverStrategy(
            driver_code=driver_code,
            full_name=driver_info["full_name"],
            team_name=driver_info["team_name"],
            team_color=driver_info["team_color"],
            finishing_position=position_map.get(driver_code),
            stints=[Stint(**s) for s in stints],
            total_pit_stops=len(stints) - 1,
            total_pit_time=total_pit_time,
        ))

    # Sort by finishing position, then alphabetically
    def sort_key(ds: DriverStrategy):
        pos = ds.finishing_position
        return (pos if pos is not None else 99, ds.driver_code)

    driver_strategies.sort(key=sort_key)

    return StrategyResponse(
        session_key=_make_session_key(year, gp, session_type_upper),
        drivers=driver_strategies,
    )


def _build_stints(laps: list[dict], driver_code: str) -> list[dict]:
    """Build stint list from processed lap data."""
    if not laps:
        return []

    stints: list[dict] = []
    current_stint_num = None
    current_compound = None
    current_start_lap = None
    lap_times_in_stint: list[float] = []

    for lap in laps:
        stint_num = lap.get("stint") or 1
        compound = lap.get("compound", "UNKNOWN")
        lap_number = lap["lap_number"]
        lap_time = lap.get("lap_time")

        if stint_num != current_stint_num:
            # Save previous stint
            if current_stint_num is not None and current_start_lap is not None:
                prev_lap = laps[laps.index(lap) - 1] if lap in laps else laps[-1]
                avg_pace = (
                    sum(lap_times_in_stint) / len(lap_times_in_stint)
                    if lap_times_in_stint else None
                )
                stints.append(_make_stint(
                    current_stint_num,
                    current_compound,
                    current_start_lap,
                    prev_lap["lap_number"],
                    prev_lap.get("tyre_life") or 0,
                    prev_lap.get("pit_in_time"),
                    prev_lap.get("pit_duration"),
                    avg_pace,
                ))

            current_stint_num = stint_num
            current_compound = compound
            current_start_lap = lap_number
            lap_times_in_stint = []

        if lap_time and lap.get("is_accurate", True) and not lap.get("is_deleted", False):
            lap_times_in_stint.append(lap_time)

    # Add final stint
    if current_stint_num is not None and laps:
        last_lap = laps[-1]
        avg_pace = (
            sum(lap_times_in_stint) / len(lap_times_in_stint)
            if lap_times_in_stint else None
        )
        stints.append(_make_stint(
            current_stint_num,
            current_compound,
            current_start_lap,
            last_lap["lap_number"],
            last_lap.get("tyre_life") or 0,
            last_lap.get("pit_in_time"),
            last_lap.get("pit_duration"),
            avg_pace,
        ))

    return stints


def _make_stint(
    stint_num: int,
    compound: str,
    start_lap: int,
    end_lap: int,
    tyre_life: int,
    pit_in_time: Optional[float],
    pit_duration: Optional[float],
    avg_pace: Optional[float],
) -> dict:
    return {
        "stint_number": stint_num,
        "compound": _normalize_compound(compound),
        "start_lap": start_lap,
        "end_lap": end_lap,
        "tyre_life": tyre_life,
        "fresh": True,  # FastF1 doesn't reliably track this; assume fresh
        "pit_in_time": pit_in_time,
        "pit_duration": pit_duration,
        "avg_pace": avg_pace,
    }


def _make_session_key(year: int, gp: str, session_type: str) -> str:
    sanitized = gp.lower().replace(" ", "_").replace("-", "_")
    return f"{year}_{sanitized}_{session_type.lower()}"
