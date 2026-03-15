"""
Live session data via OpenF1 API.
  GET /api/v1/live/status  — is a session currently active?
  GET /api/v1/live/race    — full timing tower for the live session
"""
import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter

router = APIRouter()
logger = logging.getLogger(__name__)

OPENF1 = "https://api.openf1.org/v1"

COUNTRY_CODES: Dict[str, str] = {
    "Australia": "au", "China": "cn", "Japan": "jp", "Bahrain": "bh",
    "Saudi Arabia": "sa", "United States": "us", "Italy": "it",
    "Monaco": "mc", "Spain": "es", "Canada": "ca", "Austria": "at",
    "United Kingdom": "gb", "Hungary": "hu", "Belgium": "be",
    "Netherlands": "nl", "Singapore": "sg", "Mexico": "mx",
    "Brazil": "br", "Qatar": "qa", "Abu Dhabi": "ae", "Azerbaijan": "az",
    "United Arab Emirates": "ae", "USA": "us", "Great Britain": "gb",
}
TIMEOUT = 6.0

_API_KEY = os.getenv("OPENF1_API_KEY", "")
_HEADERS = {"Authorization": f"Bearer {_API_KEY}"} if _API_KEY else {}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _latest_per_driver(rows: List[Dict], key: str = "driver_number") -> Dict[int, Dict]:
    """Keep the most-recent row per driver (OpenF1 returns rows oldest-first)."""
    out: Dict[int, Dict] = {}
    for row in rows:
        drv = row.get(key)
        if drv is not None:
            out[drv] = row  # later rows overwrite earlier ones
    return out


def _parse_gap(raw) -> Optional[float]:
    """Convert OpenF1 gap strings like '+1.234' or '1 LAP' to float seconds."""
    if raw is None:
        return None
    s = str(raw).strip().lstrip("+")
    if "LAP" in s.upper():
        return None  # lapped cars — caller decides how to display
    try:
        return float(s)
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# /v1/live/status
# ---------------------------------------------------------------------------

def _next_session_from_schedule() -> Optional[Dict]:
    """Return next upcoming individual session (FP1/Q/Race etc.) from FastF1 schedule."""
    try:
        import pandas as pd
        import fastf1
        now = datetime.now(timezone.utc)

        SESSION_COLS = [
            ("Session1DateUtc", "Session1"),
            ("Session2DateUtc", "Session2"),
            ("Session3DateUtc", "Session3"),
            ("Session4DateUtc", "Session4"),
            ("Session5DateUtc", "Session5"),
        ]

        for year in [now.year, now.year + 1]:
            try:
                schedule = fastf1.get_event_schedule(year, include_testing=False)
            except Exception:
                continue
            for _, row in schedule.iterrows():
                for date_col, name_col in SESSION_COLS:
                    raw_dt = row.get(date_col)
                    if raw_dt is None:
                        continue
                    try:
                        dt = pd.to_datetime(raw_dt, utc=True)
                        if pd.isna(dt):
                            continue
                    except Exception:
                        continue
                    if dt > now:
                        hours = (dt - now).total_seconds() / 3600
                        gp_name = str(row.get("EventName", ""))
                        country = str(row.get("Country", ""))
                        try:
                            from config.circuit_data import get_circuit_data
                            cd = get_circuit_data(gp_name)
                            total_laps = cd["total_laps"] if cd else None
                        except Exception:
                            total_laps = None
                        return {
                            "gp": gp_name,
                            "name": gp_name,
                            "circuit": str(row.get("Location", "")),
                            "country": country,
                            "country_code": COUNTRY_CODES.get(country, ""),
                            "date": str(row.get("EventDate", ""))[:10],
                            "session_name": str(row.get(name_col, "")),
                            "start_time": dt.isoformat(),
                            "hours_until": round(hours, 1),
                            "round": int(row.get("RoundNumber", 0)),
                            "total_laps": total_laps,
                        }
    except Exception as exc:
        logger.debug("next_session lookup failed: %s", exc)
    return None


@router.get("/v1/live/status")
async def live_status():
    """
    Returns one of three states:
      {live: True,  session: {...}, next_session_in_hours: 0}
      {live: False, next: {...},    next_session_in_hours: N}   (N < 24 → show countdown)
      {live: False, next: None,     next_session_in_hours: 999} (show analysis)
    """
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, headers=_HEADERS) as client:
            resp = await client.get(f"{OPENF1}/sessions?session_key=latest")
        sessions = resp.json()

        is_live = False
        live_session_data = None

        if sessions:
            latest = sessions[-1]
            end_time = latest.get("date_end")
            if not end_time:
                is_live = True
            else:
                try:
                    end_dt = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
                    is_live = end_dt > datetime.now(timezone.utc)
                except ValueError:
                    is_live = False

            if is_live:
                live_session_data = {
                    "name": latest.get("session_name", ""),
                    "gp": latest.get("meeting_name", ""),
                    "type": latest.get("session_type", ""),
                    "circuit": latest.get("circuit_short_name", ""),
                }

        if is_live:
            return {"live": True, "session": live_session_data, "next_session_in_hours": 0, "next": None}

    except Exception as exc:
        logger.debug("live_status OpenF1 check failed: %s", exc)

    # Not live — find next session
    next_sess = _next_session_from_schedule()
    hours = next_sess["hours_until"] if next_sess else 999.0
    return {"live": False, "session": None, "next": next_sess, "next_session_in_hours": hours}


# ---------------------------------------------------------------------------
# /v1/live/race  — full timing tower from OpenF1
# ---------------------------------------------------------------------------

@router.get("/v1/live/race")
async def live_race():
    """
    Aggregates OpenF1 endpoints into a timing-tower payload:
    positions + gaps + tyre stints + latest lap times + weather.
    Polled every 5 s by the frontend during live sessions.
    """
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, headers=_HEADERS) as client:
            (
                sessions_resp,
                drivers_resp,
                pos_resp,
                intervals_resp,
                laps_resp,
                stints_resp,
                weather_resp,
            ) = await asyncio.gather(
                client.get(f"{OPENF1}/sessions?session_key=latest"),
                client.get(f"{OPENF1}/drivers?session_key=latest"),
                client.get(f"{OPENF1}/position?session_key=latest"),
                client.get(f"{OPENF1}/intervals?session_key=latest"),
                client.get(f"{OPENF1}/laps?session_key=latest"),
                client.get(f"{OPENF1}/stints?session_key=latest"),
                client.get(f"{OPENF1}/weather?session_key=latest"),
            )

        sessions_data: List[Dict] = sessions_resp.json() or []
        drivers_data: List[Dict] = drivers_resp.json() or []
        pos_data: List[Dict] = pos_resp.json() or []
        intervals_data: List[Dict] = intervals_resp.json() or []
        laps_data: List[Dict] = laps_resp.json() or []
        stints_data: List[Dict] = stints_resp.json() or []
        weather_data: List[Dict] = weather_resp.json() or []

    except Exception as exc:
        logger.warning("live_race fetch failed: %s", exc)
        return {"session": None, "drivers": [], "weather": None}

    # ── Session meta ─────────────────────────────────────────────────────────
    session_meta: Dict[str, Any] = {}
    if sessions_data:
        s = sessions_data[-1]
        session_meta = {
            "name": s.get("session_name", ""),
            "gp": s.get("meeting_name", ""),
            "type": s.get("session_type", ""),
            "circuit": s.get("circuit_short_name", ""),
            "country": s.get("country_name", ""),
        }

    # ── Latest row per driver ─────────────────────────────────────────────────
    driver_info = {d["driver_number"]: d for d in drivers_data if "driver_number" in d}
    latest_pos = _latest_per_driver(pos_data)
    latest_interval = _latest_per_driver(intervals_data)
    latest_lap = _latest_per_driver(laps_data)
    latest_stint = _latest_per_driver(stints_data)

    # Infer current lap from max lap_number seen
    current_lap = 0
    if laps_data:
        try:
            current_lap = max(r.get("lap_number", 0) or 0 for r in laps_data)
        except Exception:
            pass

    # ── Build timing rows ─────────────────────────────────────────────────────
    rows = []
    for drv_num, pos_row in latest_pos.items():
        info = driver_info.get(drv_num, {})
        interval_row = latest_interval.get(drv_num, {})
        lap_row = latest_lap.get(drv_num, {})
        stint_row = latest_stint.get(drv_num, {})

        gap_raw = interval_row.get("gap_to_leader")
        interval_raw = interval_row.get("interval")
        gap = _parse_gap(gap_raw)
        interval = _parse_gap(interval_raw)

        # lap_duration is in seconds (float) from OpenF1
        last_lap = lap_row.get("lap_duration")
        if last_lap is not None:
            try:
                last_lap = float(last_lap)
            except (TypeError, ValueError):
                last_lap = None

        compound = stint_row.get("compound")  # "SOFT", "MEDIUM", "HARD", etc.
        tyre_age_at_start = stint_row.get("tyre_age_at_start", 0) or 0
        stint_start_lap = stint_row.get("lap_start", 1) or 1
        tyre_age = current_lap - stint_start_lap + tyre_age_at_start

        team_color = info.get("team_colour", "333333")
        if team_color and not team_color.startswith("#"):
            team_color = f"#{team_color}"

        rows.append({
            "position": pos_row.get("position", 99),
            "driver_number": drv_num,
            "name_acronym": info.get("name_acronym", str(drv_num)),
            "full_name": info.get("full_name", ""),
            "team_name": info.get("team_name", ""),
            "team_color": team_color,
            "gap_to_leader": gap,
            "gap_to_leader_raw": str(gap_raw) if gap_raw is not None else None,
            "interval": interval,
            "interval_raw": str(interval_raw) if interval_raw is not None else None,
            "last_lap_time": last_lap,
            "compound": compound,
            "tyre_age": max(tyre_age, 0),
            "is_pit_out_lap": bool(lap_row.get("is_pit_out_lap")),
            "st_speed": lap_row.get("st_speed"),
        })

    rows.sort(key=lambda r: r["position"])

    # ── Weather ───────────────────────────────────────────────────────────────
    weather = None
    if weather_data:
        w = weather_data[-1]
        weather = {
            "air_temp": w.get("air_temperature"),
            "track_temp": w.get("track_temperature"),
            "humidity": w.get("humidity"),
            "wind_speed": w.get("wind_speed"),
            "rainfall": w.get("rainfall", 0),
        }

    return {
        "session": {**session_meta, "current_lap": current_lap},
        "drivers": rows,
        "weather": weather,
    }
