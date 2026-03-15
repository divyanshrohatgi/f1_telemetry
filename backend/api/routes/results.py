"""
Session results routes — full timing sheet and latest-race detection.
"""

import datetime
import logging
import pandas as pd
from fastapi import APIRouter, HTTPException

from models.schemas import SessionResultsResponse, DriverResult, LatestRaceInfo
from services.fastf1_loader import load_session, get_season_schedule
from services.results_processor import get_session_results

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/v1/latest-race", response_model=LatestRaceInfo)
async def get_latest_race():
    """
    Auto-detect the most recently completed Grand Prix.

    Looks at the current year first, then falls back to the previous year.
    Returns enough info for the frontend to call the results endpoint.
    """
    today = datetime.date.today()

    for year in [today.year, today.year - 1]:
        if year < 2018:
            continue
        try:
            schedule = get_season_schedule(year)
        except Exception as exc:
            logger.warning("Failed to load %d schedule: %s", year, exc)
            continue

        try:
            dates = pd.to_datetime(schedule["EventDate"], errors="coerce").dt.date
            past = schedule[dates <= today]
        except Exception:
            past = schedule  # fall back to all events

        if past.empty:
            continue

        latest = past.iloc[-1]
        logger.info("Latest race candidate: %s %s (EventDate=%s)", year, latest.get("EventName"), latest.get("EventDate"))
        gp_name = str(latest.get("EventName", latest.get("OfficialEventName", "Unknown")))
        country  = str(latest.get("Country", "Unknown"))
        date_str = str(latest.get("EventDate", ""))[:10]

        try:
            round_num = int(latest.get("RoundNumber", 0))
        except (TypeError, ValueError):
            round_num = 0

        return LatestRaceInfo(
            year=year,
            gp_name=gp_name,
            round_number=round_num,
            country=country,
            date=date_str,
        )

    raise HTTPException(status_code=404, detail="No completed races found")


@router.get("/v1/debug/schedule/{year}")
async def debug_schedule(year: int):
    """Debug: return raw schedule EventName + EventDate for a year."""
    try:
        schedule = get_season_schedule(year)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    today = datetime.date.today()
    rows = []
    for _, ev in schedule.iterrows():
        rows.append({
            "round": int(ev.get("RoundNumber", 0)),
            "name": str(ev.get("EventName", "")),
            "date": str(ev.get("EventDate", ""))[:10],
            "is_past": str(pd.to_datetime(ev.get("EventDate"), errors="coerce").date()) <= str(today),
        })
    return {"today": str(today), "events": rows}


@router.get(
    "/v1/results/{year}/{gp}/{session_type}",
    response_model=SessionResultsResponse,
)
async def get_results(year: int, gp: str, session_type: str):
    """
    Full timing sheet for a session — all drivers, positions, sector times, tyres.

    Expensive on first call (downloads from F1 servers).
    """
    session_type_upper = session_type.upper()

    try:
        session = load_session(
            year, gp, session_type_upper,
            load_laps=True, load_telemetry=False, load_weather=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Failed to load session: {exc}")

    # Build timing sheet
    result = get_session_results(session, year)

    # Session metadata
    event = session.event
    gp_display    = str(event.get("EventName", gp))
    circuit_name  = str(event.get("Location", event.get("EventName", "Unknown")))
    country       = str(event.get("Country", "Unknown"))
    date_str      = str(event.get("EventDate", ""))[:10]

    sanitized = gp.lower().replace(" ", "_").replace("-", "_")
    session_key = f"{year}_{sanitized}_{session_type_upper.lower()}"

    total_laps = 0
    if session.laps is not None and not session.laps.empty:
        try:
            total_laps = int(session.laps["LapNumber"].max())
        except Exception:
            pass

    weather_summary = None
    try:
        if session.weather_data is not None and not session.weather_data.empty:
            avg_air   = session.weather_data["AirTemp"].mean()
            avg_track = session.weather_data["TrackTemp"].mean()
            rainfall  = bool(session.weather_data["Rainfall"].any())
            weather_summary = f"{avg_air:.0f}°C air / {avg_track:.0f}°C track"
            if rainfall:
                weather_summary += " · rainfall"
    except Exception:
        pass

    drivers_out = [DriverResult(**d) for d in result["drivers"]]

    return SessionResultsResponse(
        session_key=session_key,
        year=year,
        gp_name=gp_display,
        session_type=session_type_upper,
        circuit_name=circuit_name,
        country=country,
        date=date_str,
        total_laps=total_laps,
        drivers=drivers_out,
        overall_best_lap=result["overall_best_lap"],
        overall_best_s1=result["overall_best_s1"],
        overall_best_s2=result["overall_best_s2"],
        overall_best_s3=result["overall_best_s3"],
        weather_summary=weather_summary,
    )
