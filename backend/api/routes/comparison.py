"""
Driver vs driver comparison routes.
v2: includes circuit_points, sector_times, sector_distances.
"""

import logging
from fastapi import APIRouter, HTTPException, Query

from models.schemas import ComparisonResponse, ComparisonLapPoint, MiniSector
from services.fastf1_loader import load_session, get_drivers_for_session
from services.telemetry_processor import get_comparison_telemetry

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/v1/comparison/{year}/{gp}/{session_type}/{driver1}/{driver2}", response_model=ComparisonResponse)
async def get_comparison(
    year: int,
    gp: str,
    session_type: str,
    driver1: str,
    driver2: str,
    n_points: int = Query(default=750, ge=100, le=4000),
    lap1: int = Query(default=None, description="Specific lap number for driver1 (omit for fastest)"),
    lap2: int = Query(default=None, description="Specific lap number for driver2 (omit for fastest)"),
):
    """
    Head-to-head lap comparison between two drivers.
    By default compares fastest laps. Pass lap1/lap2 query params for specific laps.
    """
    session_type_upper = session_type.upper()
    d1 = driver1.upper()
    d2 = driver2.upper()

    try:
        session = load_session(year, gp, session_type_upper, load_laps=True, load_telemetry=True)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Failed to load session: {exc}")

    raw_drivers = get_drivers_for_session(session, year)

    for d in [d1, d2]:
        if d not in raw_drivers:
            raise HTTPException(status_code=404, detail=f"Driver '{d}' not in session")

    result = get_comparison_telemetry(session, d1, d2, n_points=n_points, lap1_number=lap1, lap2_number=lap2)

    points = [ComparisonLapPoint(**p) for p in result["points"]]
    mini_sectors = [MiniSector(**ms) for ms in result["mini_sectors"]]

    from models.schemas import CircuitPoint
    circuit_points = [CircuitPoint(**cp) for cp in result.get("circuit_points", [])]

    return ComparisonResponse(
        session_key=_make_session_key(year, gp, session_type_upper),
        driver1_code=d1,
        driver2_code=d2,
        driver1_team_color=raw_drivers[d1]["team_color"],
        driver2_team_color=raw_drivers[d2]["team_color"],
        driver1_lap_time=result["driver1_lap_time"],
        driver2_lap_time=result["driver2_lap_time"],
        driver1_sector_times=result.get("driver1_sector_times", []),
        driver2_sector_times=result.get("driver2_sector_times", []),
        sector_distances=result.get("sector_distances", []),
        lap_distance=result["lap_distance"],
        points=points,
        mini_sectors=mini_sectors,
        circuit_points=circuit_points,
        circuit_rotation=result.get("circuit_rotation", 0.0),
    )


def _make_session_key(year: int, gp: str, session_type: str) -> str:
    sanitized = gp.lower().replace(" ", "_").replace("-", "_")
    return f"{year}_{sanitized}_{session_type.lower()}"
