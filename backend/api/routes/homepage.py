import datetime
import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException
import pandas as pd

from models.schemas import (
    HomepageData, HeroRaceResult, HeroDriver, RaceInsight,
    DriverStanding, ConstructorStanding, SeasonNode,
)
from config.seasons import get_team_color
from config.circuit_data import get_circuit_data
from services.fastf1_loader import load_session, get_drivers_for_session, get_season_schedule
from services.results_processor import get_session_results

logger = logging.getLogger(__name__)
router = APIRouter()


def _detect_latest_race() -> tuple[int, str, int]:
    """Return (year, gp_name, round_number) for the most recently completed race."""
    today = datetime.date.today()
    for year in [today.year, today.year - 1]:
        try:
            schedule = get_season_schedule(year)
        except Exception:
            continue
        try:
            dates = pd.to_datetime(schedule["EventDate"], errors="coerce").dt.date
            past = schedule[dates <= today]
        except Exception:
            past = schedule
        if not past.empty:
            row = past.iloc[-1]
            return (
                year,
                str(row.get("EventName", "Unknown")),
                int(row.get("RoundNumber", 1)),
            )
    raise HTTPException(status_code=404, detail="No completed races found")


def _safety_car_count(laps_df: pd.DataFrame) -> int:
    """Count distinct safety car deployments (not individual SC laps)."""
    try:
        sc_mask = laps_df["TrackStatus"].str.contains("4", na=False)
        # Count rising edges (False→True transitions)
        transitions = sc_mask.astype(int).diff()
        return int((transitions == 1).sum())
    except Exception:
        return 0


@router.get("/homepage", response_model=HomepageData)
async def get_homepage_data():
    """Aggregated data for the homepage: hero, insights, standings, season timeline."""
    try:
        year, gp_name, round_number = _detect_latest_race()

        # Load session — NO full telemetry pre-load (expensive)
        session = load_session(
            year, str(round_number), "R",
            load_laps=True, load_telemetry=False, load_weather=False,
        )
        res_data = get_session_results(session, year)
        all_drivers = res_data.get("drivers", [])

        # ── Hero top 5 ──────────────────────────────────────────────────────
        top5 = []
        for i, d in enumerate(all_drivers[:5]):
            top5.append(HeroDriver(
                position=d.get("position", i + 1),
                driver_code=d["driver_code"],
                full_name=d["full_name"],
                team_color=d.get("team_color") or get_team_color(d.get("team_name", ""), year),
                gap_to_leader="LEADER" if i == 0 else d.get("gap_to_leader"),
                headshot_url=d.get("headshot_url"),
            ))

        # ── Fastest lap ──────────────────────────────────────────────────────
        fastest_lap_driver = None
        fastest_lap_time = None
        fastest_lap_number = None
        best_lap_driver = next((d for d in all_drivers if d.get("is_best_lap")), None)
        if best_lap_driver:
            fastest_lap_driver = best_lap_driver["driver_code"]
            fastest_lap_time = best_lap_driver.get("best_lap_time")
            fastest_lap_number = best_lap_driver.get("best_lap_number")

        # ── Circuit map (load telemetry for winner's fastest lap only) ───────
        circuit_pts: list = []
        circuit_rot: float = 0.0
        circuit_length_km: Optional[float] = None
        try:
            from services.telemetry_processor import _build_single_driver_circuit
            winner_code = all_drivers[0]["driver_code"] if all_drivers else None
            if winner_code and session.laps is not None and not session.laps.empty:
                winner_laps = session.laps.pick_drivers(winner_code)
                fastest = winner_laps.pick_fastest()
                if fastest is not None:
                    tel = fastest.get_telemetry()
                    if tel is not None and not tel.empty:
                        circuit_pts, circuit_rot = _build_single_driver_circuit(
                            tel, n_map_points=300, session=session, driver_code=winner_code
                        )
                        if "Distance" in tel.columns:
                            dist_m = tel["Distance"].max()
                            if pd.notna(dist_m) and dist_m > 0:
                                circuit_length_km = round(float(dist_m) / 1000, 3)
        except Exception as exc:
            logger.debug("Circuit map extraction failed: %s", exc)

        # Fallback: use static circuit data for length
        if circuit_length_km is None:
            cd = get_circuit_data(gp_name)
            if cd:
                circuit_length_km = cd["circuit_length_km"]

        # ── Stat: total laps ─────────────────────────────────────────────────
        total_laps = max((d.get("laps_completed", 0) for d in all_drivers), default=0)
        sc_count = _safety_car_count(session.laps) if session.laps is not None else 0

        hero = HeroRaceResult(
            year=year,
            gp_name=gp_name,
            country=str(session.event.get("Country", "Unknown")),
            circuit_name=str(session.event.get("Location", "Unknown")),
            date=str(session.event.get("EventDate", ""))[:10],
            round_number=round_number,
            total_laps=total_laps,
            top5=top5,
            fastest_lap_time=fastest_lap_time,
            fastest_lap_driver=fastest_lap_driver,
            fastest_lap_number=fastest_lap_number,
            laps_led_driver=top5[0].driver_code if top5 else None,
            laps_led_count=None,
            safety_car_count=sc_count,
            circuit_points=circuit_pts if circuit_pts else None,
            circuit_rotation=circuit_rot,
            circuit_length_km=circuit_length_km,
            race_distance_km=round(circuit_length_km * total_laps, 3) if circuit_length_km and total_laps else None,
        )

        # ── Insights ─────────────────────────────────────────────────────────
        insights: list = []

        # Biggest mover
        biggest_mover = None
        biggest_gain = -999
        for d in all_drivers:
            grid = d.get("grid_position")
            finish = d.get("position")
            if grid is not None and finish is not None:
                gain = grid - finish
                if gain > biggest_gain:
                    biggest_gain = gain
                    biggest_mover = d
        if biggest_mover and biggest_gain > 0:
            sign = f"+{biggest_gain}" if biggest_gain > 0 else str(biggest_gain)
            insights.append(RaceInsight(
                type="biggest_mover",
                title="BIGGEST MOVER",
                emoji="🔥",
                driver_code=biggest_mover["driver_code"],
                team_color=biggest_mover["team_color"],
                headline=f"P{biggest_mover['grid_position']} → P{biggest_mover['position']}",
                detail=f"{sign} positions gained",
                headshot_url=biggest_mover.get("headshot_url"),
            ))

        # Speed king — max speed trap across all laps
        if session.laps is not None and not session.laps.empty and "SpeedST" in session.laps.columns:
            try:
                speed_trap = session.laps["SpeedST"].max()
                idx = session.laps["SpeedST"].idxmax()
                if pd.notna(speed_trap) and pd.notna(idx):
                    driver_code = session.laps.loc[idx, "Driver"]
                    drv_info = next((d for d in all_drivers if d["driver_code"] == driver_code), None)
                    if drv_info:
                        insights.append(RaceInsight(
                            type="speed_king",
                            title="SPEED KING",
                            emoji="⚡",
                            driver_code=driver_code,
                            team_color=drv_info["team_color"],
                            headline=f"{speed_trap:.1f} km/h",
                            detail="Highest speed trap of the race",
                            headshot_url=drv_info.get("headshot_url"),
                        ))
            except Exception as exc:
                logger.debug("Speed trap insight failed: %s", exc)

        # Best strategy — winner's tyre info
        if top5 and all_drivers:
            winner = all_drivers[0]
            compound = winner.get("compound") or "UNKNOWN"
            pits = winner.get("pit_stops", 0)
            stop_str = "1 stop" if pits == 1 else f"{pits} stops"
            insights.append(RaceInsight(
                type="best_strategy",
                title="WINNING STRATEGY",
                emoji="🎯",
                driver_code=winner["driver_code"],
                team_color=winner["team_color"],
                headline=f"{compound[0] if compound else '?'} · {stop_str}",
                detail=f"{winner['driver_code']} won on {compound.capitalize()} tyres",
                headshot_url=winner.get("headshot_url"),
            ))

        # ── Next race ────────────────────────────────────────────────────────
        schedule = get_season_schedule(year)
        today_ts = pd.Timestamp.now()
        future = schedule[pd.to_datetime(schedule["EventDate"], errors="coerce") > today_ts]
        next_race_name, next_race_date, next_race_country = None, None, None
        if not future.empty:
            nr = future.iloc[0]
            next_race_name = str(nr.get("EventName", ""))
            next_race_date = str(nr.get("EventDate", ""))[:10]
            next_race_country = str(nr.get("Country", ""))

        # ── Standings via Ergast ─────────────────────────────────────────────
        drivers_standings: List[DriverStanding] = []
        constructors_standings: List[ConstructorStanding] = []
        try:
            import fastf1.ergast
            ergast = fastf1.ergast.Ergast()
            st = ergast.get_driver_standings(season=year, round=round_number)
            if st is not None and hasattr(st, "content") and st.content:
                df = st.content[0]
                for _, row in df.head(10).iterrows():
                    code = str(row.get("driverCode", ""))
                    team_name = ""
                    con_list = row.get("constructorNames")
                    if isinstance(con_list, list) and con_list:
                        team_name = con_list[0]
                    drivers_standings.append(DriverStanding(
                        position=int(row["position"]),
                        driver_code=code,
                        full_name=f"{row.get('givenName', '')} {row.get('familyName', '')}".strip(),
                        team_name=team_name,
                        team_color=get_team_color(team_name, year),
                        points=float(row.get("points", 0)),
                        wins=int(row.get("wins", 0)),
                    ))
        except Exception as exc:
            logger.debug("Driver standings fetch failed: %s", exc)

        try:
            import fastf1.ergast
            ergast = fastf1.ergast.Ergast()
            cst = ergast.get_constructor_standings(season=year, round=round_number)
            if cst is not None and hasattr(cst, "content") and cst.content:
                df = cst.content[0]
                for _, row in df.head(5).iterrows():
                    team_name = str(row.get("constructorName", ""))
                    constructors_standings.append(ConstructorStanding(
                        position=int(row["position"]),
                        team_name=team_name,
                        team_color=get_team_color(team_name, year),
                        points=float(row.get("points", 0)),
                        wins=int(row.get("wins", 0)),
                    ))
        except Exception as exc:
            logger.debug("Constructor standings fetch failed: %s", exc)

        # ── Season nodes ─────────────────────────────────────────────────────
        season_nodes: List[SeasonNode] = []
        completed = 0
        for _, row in schedule.iterrows():
            ev_date = pd.to_datetime(row.get("EventDate"), errors="coerce")
            if pd.isna(ev_date):
                continue
            is_comp = ev_date <= today_ts
            if is_comp:
                completed += 1
            ev_name = str(row.get("EventName", ""))
            cd = get_circuit_data(ev_name)
            cd_laps = cd["total_laps"] if cd else None
            cd_len = cd["circuit_length_km"] if cd else None
            season_nodes.append(SeasonNode(
                round_number=int(row.get("RoundNumber", 0)),
                gp_name=ev_name,
                country=str(row.get("Country", "")),
                date=str(row.get("EventDate", ""))[:10],
                is_completed=is_comp,
                is_next=bool(next_race_name and ev_name == next_race_name),
                winner=None,
                total_laps=cd_laps,
                circuit_length_km=cd_len,
                race_distance_km=round(cd_len * cd_laps, 3) if cd_len and cd_laps else None,
                lap_record_time=cd["lap_record_time"] if cd else None,
                lap_record_driver=cd["lap_record_driver"] if cd else None,
                lap_record_year=cd["lap_record_year"] if cd else None,
            ))

        return HomepageData(
            hero=hero,
            next_race_name=next_race_name,
            next_race_date=next_race_date,
            next_race_country=next_race_country,
            insights=insights,
            drivers_standings=drivers_standings,
            constructors_standings=constructors_standings,
            standings_round=round_number,
            season_year=year,
            season_nodes=season_nodes,
            completed_races=completed,
            total_races=len(season_nodes),
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Homepage API failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))
