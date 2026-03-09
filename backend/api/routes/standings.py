"""Championship standings — driver and constructor."""

import datetime
import logging
import pandas as pd
from fastapi import APIRouter, HTTPException
from fastf1.ergast import Ergast

from models.schemas import StandingsResponse, DriverStanding, ConstructorStanding
from services.fastf1_loader import get_season_schedule
from config.seasons import get_team_color

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/v1/standings/{year}", response_model=StandingsResponse)
async def get_standings(year: int):
    """Driver and constructor championship standings for a season."""
    if year < 2018 or year > 2030:
        raise HTTPException(status_code=400, detail=f"Year {year} out of range")

    # Find latest completed round
    try:
        schedule = get_season_schedule(year)
        today = datetime.date.today()
        dates = pd.to_datetime(schedule["EventDate"], errors="coerce").dt.date
        past = schedule[dates <= today]
        latest_round = int(past.iloc[-1].get("RoundNumber", 1)) if not past.empty else 1
    except Exception as exc:
        logger.warning("Could not determine latest round: %s", exc)
        latest_round = 1

    ergast = Ergast()

    # --- Driver standings ---
    try:
        ds_resp = ergast.get_driver_standings(season=year, round=latest_round)
        ds_df = ds_resp.content[0]
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Failed to fetch driver standings: {exc}")

    drivers = []
    for _, row in ds_df.iterrows():
        pos_raw = row.get("position")
        pos = int(pos_raw) if pd.notna(pos_raw) else None
        constructor_names = row.get("constructorNames", [])
        team = str(constructor_names[0]) if constructor_names else "Unknown"
        given = str(row.get("givenName", ""))
        family = str(row.get("familyName", ""))
        drivers.append(DriverStanding(
            position=pos,
            driver_code=str(row.get("driverCode", "")),
            full_name=f"{given} {family}".strip(),
            team_name=team,
            team_color=get_team_color(team, year),
            points=float(row.get("points", 0) or 0),
            wins=int(row.get("wins", 0) or 0),
        ))

    # --- Constructor standings ---
    try:
        cs_resp = ergast.get_constructor_standings(season=year, round=latest_round)
        cs_df = cs_resp.content[0]
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Failed to fetch constructor standings: {exc}")

    constructors = []
    for _, row in cs_df.iterrows():
        pos_raw = row.get("position")
        pos = int(pos_raw) if pd.notna(pos_raw) else None
        team = str(row.get("constructorName", "Unknown"))
        constructors.append(ConstructorStanding(
            position=pos,
            team_name=team,
            team_color=get_team_color(team, year),
            points=float(row.get("points", 0) or 0),
            wins=int(row.get("wins", 0) or 0),
        ))

    return StandingsResponse(
        year=year,
        round=latest_round,
        drivers=drivers,
        constructors=constructors,
    )
