"""
FastF1 data ingestion and session loading service.

FastF1 is slow on first load (downloads from F1 servers) — cache is critical.
All timedelta values are converted to seconds (float) here before returning.
"""

import os
import logging
from pathlib import Path
from typing import Optional
import pandas as pd
import fastf1
import fastf1.plotting

from config.seasons import get_team_color, normalize_team_name, SEASON_CONFIG

logger = logging.getLogger(__name__)

# Enable FastF1 cache — keeps downloaded data between restarts
CACHE_DIR = Path(__file__).parent.parent / "cache"
CACHE_DIR.mkdir(exist_ok=True)
fastf1.Cache.enable_cache(str(CACHE_DIR))

# In-memory session cache — keyed by (session_key, has_telemetry)
# A session loaded WITH telemetry supersedes one loaded without.
_session_cache: dict[str, fastf1.core.Session] = {}
_session_cache_has_telemetry: dict[str, bool] = {}


def _session_key(year: int, gp: str, session_type: str) -> str:
    """Build a stable session key string."""
    sanitized = gp.lower().replace(" ", "_").replace("-", "_")
    return f"{year}_{sanitized}_{session_type.lower()}"


def get_season_schedule(year: int) -> pd.DataFrame:
    """Return the event schedule for a given year as a DataFrame."""
    try:
        schedule = fastf1.get_event_schedule(year, include_testing=False)
        return schedule
    except Exception as exc:
        logger.error("Failed to load schedule for %d: %s", year, exc)
        raise


def load_session(
    year: int,
    gp: str,
    session_type: str,
    load_laps: bool = True,
    load_telemetry: bool = False,
    load_weather: bool = True,
) -> fastf1.core.Session:
    """
    Load a FastF1 session with caching.

    Args:
        year: Season year (2018–2025)
        gp: GP name or round number as string (e.g. "Monza", "Italian Grand Prix", "16")
        session_type: "FP1", "FP2", "FP3", "Q", "SQ", "R", "SS"
        load_laps: Whether to load lap data (required for most endpoints)
        load_telemetry: Whether to pre-load all telemetry (expensive — avoid unless needed)
        load_weather: Whether to load weather data

    Returns:
        fastf1.core.Session fully loaded per the flags
    """
    key = _session_key(year, gp, session_type)

    # Return cached session if it satisfies the telemetry requirement.
    # A session cached WITH telemetry always satisfies both requests.
    # A session cached WITHOUT telemetry only satisfies non-telemetry requests.
    if key in _session_cache:
        cached_has_tel = _session_cache_has_telemetry.get(key, False)
        if not load_telemetry or cached_has_tel:
            logger.debug("Session cache hit: %s (has_telemetry=%s)", key, cached_has_tel)
            return _session_cache[key]
        # Need to reload with telemetry
        logger.info("Reloading session %s with telemetry data...", key)

    logger.info("Loading session %s (this may take a moment on first run)...", key)

    try:
        session = fastf1.get_session(year, gp, session_type)
        session.load(
            laps=load_laps,
            telemetry=load_telemetry,
            weather=load_weather,
            messages=False,
        )
        _session_cache[key] = session
        _session_cache_has_telemetry[key] = load_telemetry
        logger.info("Session loaded and cached: %s (telemetry=%s)", key, load_telemetry)
        return session
    except Exception as exc:
        logger.error("Failed to load session %s: %s", key, exc)
        raise


def get_drivers_for_session(session: fastf1.core.Session, year: int) -> dict:
    """
    Extract driver → team mapping from session results.

    Returns a dict keyed by team name with driver info.
    Always accurate for mid-season swaps and reserve drivers.
    """
    drivers: dict[str, dict] = {}

    if session.results is None or session.results.empty:
        logger.warning("Session results empty — driver data unavailable")
        return drivers

    for _, row in session.results.iterrows():
        driver_code = row.get("Abbreviation", "???")
        full_name = f"{row.get('FirstName', '')} {row.get('LastName', '')}".strip()
        team_name = row.get("TeamName", "Unknown")
        driver_number = str(row.get("DriverNumber", ""))

        # Attempt to get team color from FastF1 first, then our config
        try:
            team_color = fastf1.plotting.get_team_color(team_name, session=session)
        except Exception:
            team_color = get_team_color(team_name, year)

        headshot_url = None
        try:
            raw_url = row.get("HeadshotUrl")
            if raw_url and str(raw_url) not in ("nan", "None", ""):
                headshot_url = str(raw_url)
        except Exception:
            pass

        drivers[driver_code] = {
            "code": driver_code,
            "full_name": full_name,
            "team_name": team_name,
            "team_color": team_color,
            "driver_number": driver_number,
            "headshot_url": headshot_url,
        }

    return drivers


def timedelta_to_seconds(td) -> Optional[float]:
    """Safely convert a pandas Timedelta / timedelta to float seconds."""
    if td is None or pd.isna(td):
        return None
    try:
        return td.total_seconds()
    except AttributeError:
        return None
