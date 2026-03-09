"""
Telemetry data routes — the flagship feature.

IMPORTANT: /fastest route must be registered BEFORE /{lap_number} — FastAPI matches
routes in order and "fastest" would otherwise be parsed as an integer (causing 422).
"""

import logging
from fastapi import APIRouter, HTTPException, Query

from models.schemas import TelemetryResponse, TelemetryPoint, CircuitPoint
from services.fastf1_loader import load_session, get_drivers_for_session
from services.telemetry_processor import get_lap_telemetry, get_fastest_lap_telemetry

logger = logging.getLogger(__name__)
router = APIRouter()


# /fastest MUST come before /{lap_number} — literal path segments beat wildcards
@router.get("/v1/telemetry/{year}/{gp}/{session_type}/{driver}/fastest", response_model=TelemetryResponse)
async def get_fastest_lap_telemetry_route(
    year: int,
    gp: str,
    session_type: str,
    driver: str,
    n_points: int = Query(default=750, ge=100, le=4000),
):
    """Return telemetry for a driver's fastest lap in the session."""
    session_type_upper = session_type.upper()
    driver_upper = driver.upper()

    try:
        session = load_session(year, gp, session_type_upper, load_laps=True, load_telemetry=True)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Failed to load session: {exc}")

    raw_drivers = get_drivers_for_session(session, year)
    if driver_upper not in raw_drivers:
        raise HTTPException(status_code=404, detail=f"Driver '{driver_upper}' not in session")

    result = get_fastest_lap_telemetry(session, driver_upper, n_points=n_points)

    if not result["points"]:
        raise HTTPException(
            status_code=404,
            detail=f"No fastest lap telemetry for driver {driver_upper}"
        )

    lap_number = result.get("lap_number", 0) or 0
    points = [TelemetryPoint(**p) for p in result["points"]]
    circuit_points = [CircuitPoint(**cp) for cp in result.get("circuit_points", [])]

    return TelemetryResponse(
        session_key=_make_session_key(year, gp, session_type_upper),
        driver_code=driver_upper,
        lap_number=lap_number,
        points=points,
        lap_distance=result["lap_distance"],
        lap_time=result["lap_time"],
        circuit_points=circuit_points,
        circuit_rotation=result.get("circuit_rotation", 0.0),
    )


@router.get("/v1/telemetry/{year}/{gp}/{session_type}/{driver}/{lap_number}", response_model=TelemetryResponse)
async def get_telemetry(
    year: int,
    gp: str,
    session_type: str,
    driver: str,
    lap_number: int,
    n_points: int = Query(default=750, ge=100, le=4000),
):
    """
    Return downsampled telemetry for a specific driver and lap.

    All channels plotted against distance (metres from lap start).
    n_points controls the downsampling level (default 750).
    """
    session_type_upper = session_type.upper()
    driver_upper = driver.upper()

    try:
        session = load_session(year, gp, session_type_upper, load_laps=True, load_telemetry=True)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Failed to load session: {exc}")

    raw_drivers = get_drivers_for_session(session, year)
    if driver_upper not in raw_drivers:
        raise HTTPException(
            status_code=404,
            detail=f"Driver '{driver_upper}' not in session"
        )

    result = get_lap_telemetry(session, driver_upper, lap_number, n_points=n_points)

    if not result["points"]:
        raise HTTPException(
            status_code=404,
            detail=f"No telemetry data for driver {driver_upper} lap {lap_number}"
        )

    points = [TelemetryPoint(**p) for p in result["points"]]
    circuit_points = [CircuitPoint(**cp) for cp in result.get("circuit_points", [])]

    return TelemetryResponse(
        session_key=_make_session_key(year, gp, session_type_upper),
        driver_code=driver_upper,
        lap_number=lap_number,
        points=points,
        lap_distance=result["lap_distance"],
        lap_time=result["lap_time"],
        circuit_points=circuit_points,
        circuit_rotation=result.get("circuit_rotation", 0.0),
    )


def _make_session_key(year: int, gp: str, session_type: str) -> str:
    sanitized = gp.lower().replace(" ", "_").replace("-", "_")
    return f"{year}_{sanitized}_{session_type.lower()}"
