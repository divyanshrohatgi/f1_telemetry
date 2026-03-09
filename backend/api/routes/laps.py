"""
Lap time data routes.
"""

import logging
from fastapi import APIRouter, HTTPException

from models.schemas import DriverLapsResponse, LapData
from services.fastf1_loader import load_session, get_drivers_for_session
from services.lap_processor import process_driver_laps

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/v1/laps/{year}/{gp}/{session_type}/{driver}", response_model=DriverLapsResponse)
async def get_driver_laps(year: int, gp: str, session_type: str, driver: str):
    """
    Return all lap data for a specific driver in a session.

    Driver must be a 3-letter code (VER, NOR, LEC, etc.)
    """
    session_type_upper = session_type.upper()
    driver_upper = driver.upper()

    try:
        session = load_session(year, gp, session_type_upper, load_laps=True)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Failed to load session: {exc}")

    # Verify driver exists in session
    raw_drivers = get_drivers_for_session(session, year)
    if driver_upper not in raw_drivers:
        available = list(raw_drivers.keys())
        raise HTTPException(
            status_code=404,
            detail=f"Driver '{driver_upper}' not found in session. Available: {available}"
        )

    driver_info = raw_drivers[driver_upper]

    # Process laps
    result = process_driver_laps(session, driver_upper)

    # Build Pydantic model list
    laps = []
    for lap_dict in result["laps"]:
        laps.append(LapData(**lap_dict))

    return DriverLapsResponse(
        session_key=_make_session_key(year, gp, session_type_upper),
        driver_code=driver_upper,
        team_name=driver_info["team_name"],
        team_color=driver_info["team_color"],
        laps=laps,
        fastest_lap_number=result["fastest_lap_number"],
    )


def _make_session_key(year: int, gp: str, session_type: str) -> str:
    sanitized = gp.lower().replace(" ", "_").replace("-", "_")
    return f"{year}_{sanitized}_{session_type.lower()}"
