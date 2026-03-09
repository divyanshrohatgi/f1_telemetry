"""
Weather data routes.
"""

import logging
import pandas as pd
from fastapi import APIRouter, HTTPException

from models.schemas import WeatherResponse, WeatherPoint
from services.fastf1_loader import load_session

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/v1/weather/{year}/{gp}/{session_type}", response_model=WeatherResponse)
async def get_weather(year: int, gp: str, session_type: str):
    """Return weather data sampled per lap."""
    session_type_upper = session_type.upper()

    try:
        session = load_session(year, gp, session_type_upper, load_laps=True, load_weather=True)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Failed to load session: {exc}")

    if session.weather_data is None or session.weather_data.empty:
        raise HTTPException(status_code=404, detail="No weather data for this session")

    weather_df = session.weather_data

    # Join weather data with lap data on time to get per-lap weather
    points = []

    if session.laps is not None and not session.laps.empty:
        # Get unique lap times
        laps_df = session.laps.drop_duplicates(subset=["LapNumber"]).sort_values("LapNumber")

        for _, lap_row in laps_df.iterrows():
            lap_num = int(lap_row["LapNumber"])
            lap_time_in_session = lap_row.get("Time")

            if lap_time_in_session is None or pd.isna(lap_time_in_session):
                continue

            try:
                lap_time_sec = lap_time_in_session.total_seconds()
            except AttributeError:
                lap_time_sec = float(lap_time_in_session)

            # Find weather row closest to this lap time
            weather_times = weather_df["Time"].apply(
                lambda t: t.total_seconds() if hasattr(t, "total_seconds") else float(t)
            )
            idx = (weather_times - lap_time_sec).abs().idxmin()
            w_row = weather_df.loc[idx]

            def safe_float(val):
                try:
                    v = float(val)
                    return None if pd.isna(v) else v
                except (TypeError, ValueError):
                    return None

            rainfall = bool(w_row.get("Rainfall", False))

            points.append(WeatherPoint(
                lap_number=lap_num,
                time=lap_time_sec,
                air_temp=safe_float(w_row.get("AirTemp")),
                track_temp=safe_float(w_row.get("TrackTemp")),
                humidity=safe_float(w_row.get("Humidity")),
                pressure=safe_float(w_row.get("Pressure")),
                wind_speed=safe_float(w_row.get("WindSpeed")),
                rainfall=rainfall,
            ))
    else:
        # No lap data — use weather data directly, approximate lap numbers
        weather_times = weather_df["Time"].apply(
            lambda t: t.total_seconds() if hasattr(t, "total_seconds") else float(t)
        )
        total_time = weather_times.max() if not weather_times.empty else 1
        step = max(1, len(weather_df) // 60)

        for i, (_, w_row) in enumerate(weather_df.iloc[::step].iterrows()):
            def safe_float(val):
                try:
                    v = float(val)
                    return None if pd.isna(v) else v
                except (TypeError, ValueError):
                    return None

            points.append(WeatherPoint(
                lap_number=i + 1,
                air_temp=safe_float(w_row.get("AirTemp")),
                track_temp=safe_float(w_row.get("TrackTemp")),
                humidity=safe_float(w_row.get("Humidity")),
                pressure=safe_float(w_row.get("Pressure")),
                wind_speed=safe_float(w_row.get("WindSpeed")),
                rainfall=bool(w_row.get("Rainfall", False)),
            ))

    return WeatherResponse(
        session_key=_make_session_key(year, gp, session_type_upper),
        points=points,
    )


def _make_session_key(year: int, gp: str, session_type: str) -> str:
    sanitized = gp.lower().replace(" ", "_").replace("-", "_")
    return f"{year}_{sanitized}_{session_type.lower()}"
