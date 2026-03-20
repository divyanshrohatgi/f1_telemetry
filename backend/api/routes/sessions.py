"""
Session and GP listing routes.
"""

import logging
import unicodedata
from fastapi import APIRouter, HTTPException


def _normalize_str(s: str) -> str:
    """Lowercase, strip accents, replace spaces/hyphens with underscores."""
    nfkd = unicodedata.normalize("NFKD", s)
    ascii_str = nfkd.encode("ascii", "ignore").decode("ascii")
    return ascii_str.lower().replace(" ", "_").replace("-", "_")

from models.schemas import SeasonResponse, GrandPrixInfo, SessionMetadata, DriverSessionInfo
from services.fastf1_loader import get_season_schedule, load_session, get_drivers_for_session
from config.seasons import get_team_color

logger = logging.getLogger(__name__)
router = APIRouter()

SESSION_TYPE_MAP = {
    "FP1": "Practice 1",
    "FP2": "Practice 2",
    "FP3": "Practice 3",
    "Q": "Qualifying",
    "SQ": "Sprint Qualifying",
    "SS": "Sprint Shootout",
    "R": "Race",
    "S": "Sprint",
}

AVAILABLE_SESSION_TYPES = ["FP1", "FP2", "FP3", "Q", "SQ", "SS", "R", "S"]


@router.get("/v1/sessions/{year}", response_model=SeasonResponse)
async def get_season(year: int):
    """List all Grands Prix in a season with available sessions."""
    if year < 2018 or year > 2030:
        raise HTTPException(
            status_code=400,
            detail=f"Year {year} is out of supported range (2018–2030)"
        )

    try:
        schedule = get_season_schedule(year)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Failed to load schedule: {exc}")

    grands_prix = []

    schedule = schedule.sort_values("RoundNumber").reset_index(drop=True)

    for _, event in schedule.iterrows():
        # Determine available session types for this event
        available_sessions = []
        for st in AVAILABLE_SESSION_TYPES:
            session_col = f"Session{_session_type_to_col(st)}"
            # Check if the session column exists and has a valid date
            try:
                if hasattr(event, session_col) and event[session_col] is not None:
                    available_sessions.append(st)
            except (KeyError, AttributeError):
                pass

        # FastF1 event names
        gp_name = str(event.get("EventName", event.get("OfficialEventName", "Unknown")))
        country = str(event.get("Country", "Unknown"))
        location = str(event.get("Location", "Unknown"))

        # Event date
        event_date = event.get("EventDate", event.get("Session5Date", None))
        date_str = str(event_date)[:10] if event_date is not None else ""

        # Fallback: always include standard sessions if we can't detect
        if not available_sessions:
            available_sessions = ["FP1", "FP2", "FP3", "Q", "R"]

        grands_prix.append(GrandPrixInfo(
            round_number=int(event.get("RoundNumber", 0)),
            name=gp_name,
            country=country,
            location=location,
            date=date_str,
            sessions=available_sessions,
        ))

    return SeasonResponse(year=year, grands_prix=grands_prix)


@router.get("/v1/sessions/{year}/{gp}/{session_type}", response_model=SessionMetadata)
async def get_session_metadata(year: int, gp: str, session_type: str):
    """
    Load a session and return its metadata including driver roster.

    This is the primary endpoint called when a user selects a session.
    It triggers FastF1 data loading — can be slow on first call (downloads data).
    """
    session_type_upper = session_type.upper()

    try:
        session = load_session(year, gp, session_type_upper, load_laps=True, load_weather=True)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Failed to load session {year}/{gp}/{session_type}: {exc}"
        )

    # Get session event info first so we can use the real GP name in the key
    event = session.event
    circuit_name = str(event.get("Location", event.get("EventName", "Unknown")))
    gp_name = str(event.get("EventName", gp))

    # Build session key from actual GP name (not raw param — handles round numbers)
    sanitized_gp = _normalize_str(gp_name)
    session_key = f"{year}_{sanitized_gp}_{session_type_upper.lower()}"
    country = str(event.get("Country", "Unknown"))
    session_date = str(event.get("EventDate", ""))[:10]

    # Get driver roster from session data (handles mid-season swaps automatically)
    raw_drivers = get_drivers_for_session(session, year)

    drivers_response: dict[str, DriverSessionInfo] = {}
    for code, info in raw_drivers.items():
        drivers_response[code] = DriverSessionInfo(
            code=info["code"],
            full_name=info["full_name"],
            team_name=info["team_name"],
            team_color=info["team_color"],
            driver_number=info["driver_number"],
        )

    # Total laps
    total_laps = 0
    if session.laps is not None and not session.laps.empty:
        max_lap = session.laps["LapNumber"].max()
        total_laps = int(max_lap) if not hasattr(max_lap, 'item') else max_lap.item()

    # Simple weather summary
    weather_summary = None
    try:
        if session.weather_data is not None and not session.weather_data.empty:
            avg_temp = session.weather_data["AirTemp"].mean()
            rainfall = session.weather_data["Rainfall"].any()
            weather_summary = f"{avg_temp:.0f}°C air temp"
            if rainfall:
                weather_summary += ", rainfall"
    except Exception:
        pass

    return SessionMetadata(
        session_key=session_key,
        year=year,
        gp_name=gp_name,
        session_type=session_type_upper,
        circuit_name=circuit_name,
        country=country,
        date=session_date,
        weather_summary=weather_summary,
        total_laps=total_laps,
        drivers=drivers_response,
    )


def _session_type_to_col(session_type: str) -> str:
    """Map session type abbreviation to FastF1 schedule column suffix."""
    mapping = {
        "FP1": "1", "FP2": "2", "FP3": "3",
        "Q": "4", "SQ": "4", "SS": "4",
        "R": "5", "S": "5",
    }
    return mapping.get(session_type, "5")
