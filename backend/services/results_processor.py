"""
Session results processor — builds a full timing sheet (all drivers) for a session.

Extracts: final positions, time gaps, best lap + best sector times per driver,
tyre info from last stint, pit stop count, and purple (overall best) flags.
"""

import logging
from typing import Optional
import numpy as np
import pandas as pd
import fastf1

from services.fastf1_loader import get_drivers_for_session, timedelta_to_seconds

logger = logging.getLogger(__name__)


def get_session_results(
    session: fastf1.core.Session,
    year: int,
) -> dict:
    """
    Build a full timing sheet for all drivers.

    Returns a dict with:
      - drivers: list of driver result dicts, sorted by position
      - overall_best_lap / overall_best_s1 / s2 / s3 : float seconds
    """
    drivers_info = get_drivers_for_session(session, year)

    # -------------------------------------------------------------------------
    # Pass 1 — collect best sector / lap times per driver from session.laps
    # -------------------------------------------------------------------------
    best_times: dict[str, dict] = {}

    for driver_code in drivers_info:
        try:
            driver_laps = session.laps.pick_drivers(driver_code)
            if driver_laps is None or driver_laps.empty:
                continue

            # Best lap
            fastest = driver_laps.pick_fastest()
            lap_time, s1, s2, s3, lap_num = None, None, None, None, None
            if fastest is not None and not (hasattr(fastest, "empty") and fastest.empty):
                lap_time = timedelta_to_seconds(fastest.get("LapTime"))
                s1 = timedelta_to_seconds(fastest.get("Sector1Time"))
                s2 = timedelta_to_seconds(fastest.get("Sector2Time"))
                s3 = timedelta_to_seconds(fastest.get("Sector3Time"))
                try:
                    lap_num = int(fastest.get("LapNumber", 0))
                except (TypeError, ValueError):
                    lap_num = None

            # Also search per-sector bests (driver might have best S1 on a
            # different lap than best S2/S3)
            for col, attr in [("Sector1Time", "s1"), ("Sector2Time", "s2"), ("Sector3Time", "s3")]:
                if col in driver_laps.columns:
                    vals = driver_laps[col].dropna()
                    if len(vals) > 0:
                        sector_best = min(
                            (timedelta_to_seconds(v) for v in vals if timedelta_to_seconds(v) is not None),
                            default=None,
                        )
                        # Use per-sector best if it's better than what came from fastest lap
                        current = best_times.get(driver_code, {}).get(attr)
                        if sector_best is not None and (current is None or sector_best < current):
                            if driver_code not in best_times:
                                best_times[driver_code] = {}
                            best_times[driver_code][attr] = sector_best

            # Last lap time
            last_lap_time = None
            try:
                sorted_laps = driver_laps.sort_values("LapNumber")
                last_lap_td = sorted_laps.iloc[-1].get("LapTime")
                last_lap_time = timedelta_to_seconds(last_lap_td)
            except Exception:
                pass

            # Tyre info (last lap of session)
            compound, tyre_age, pit_stops, laps_completed = None, 0, 0, 0
            total_race_time = None
            try:
                sorted_laps = driver_laps.sort_values("LapNumber")
                last = sorted_laps.iloc[-1]
                raw_compound = last.get("Compound", "")
                compound = str(raw_compound).upper() if raw_compound and str(raw_compound) not in ("nan", "None", "") else None
                raw_age = last.get("TyreLife", 0)
                tyre_age = int(raw_age) if raw_age and not pd.isna(raw_age) else 0
                # Pit stops ≈ number of rows with non-null PitOutTime (first lap out of pits)
                pit_stops = int(driver_laps["PitOutTime"].notna().sum())
                laps_completed = int(driver_laps["LapNumber"].max())
                
                # Fallback for broken/missing gap to leader
                total_td = driver_laps['LapTime'].sum()
                if pd.notna(total_td):
                    total_race_time = timedelta_to_seconds(total_td)
            except Exception:
                pass

            if driver_code not in best_times:
                best_times[driver_code] = {}
            best_times[driver_code].update({
                "lap_time": lap_time,
                "lap_number": lap_num,
                "s1": best_times[driver_code].get("s1", s1),
                "s2": best_times[driver_code].get("s2", s2),
                "s3": best_times[driver_code].get("s3", s3),
                "last_lap_time": last_lap_time,
                "compound": compound,
                "tyre_age": tyre_age,
                "pit_stops": pit_stops,
                "laps_completed": laps_completed,
                "total_race_time": total_race_time,
            })

        except Exception as exc:
            logger.warning("Error processing laps for %s: %s", driver_code, exc)

    # -------------------------------------------------------------------------
    # Compute overall session bests (for purple flag)
    # -------------------------------------------------------------------------
    all_laps = [v["lap_time"] for v in best_times.values() if v.get("lap_time") is not None]
    all_s1   = [v["s1"]       for v in best_times.values() if v.get("s1")       is not None]
    all_s2   = [v["s2"]       for v in best_times.values() if v.get("s2")       is not None]
    all_s3   = [v["s3"]       for v in best_times.values() if v.get("s3")       is not None]

    overall_best_lap = min(all_laps) if all_laps else None
    overall_best_s1  = min(all_s1)   if all_s1   else None
    overall_best_s2  = min(all_s2)   if all_s2   else None
    overall_best_s3  = min(all_s3)   if all_s3   else None

    EPS = 0.001  # tolerance for float comparison

    def is_best(val: Optional[float], ref: Optional[float]) -> bool:
        return val is not None and ref is not None and abs(val - ref) < EPS

    # -------------------------------------------------------------------------
    # Pass 2 — build result rows from session.results (positions / gaps)
    # -------------------------------------------------------------------------
    drivers: list[dict] = []

    # Build a synthetic ranking based on our custom lap metrics
    def sort_key(d_code):
        bt = best_times.get(d_code, {})
        laps = bt.get("laps_completed", 0)
        time = bt.get("total_race_time") or 999999.0
        return (-laps, time)
    
    ranked_codes = sorted(list(drivers_info.keys()), key=sort_key)
    synthetic_ranks = {code: rank + 1 for rank, code in enumerate(ranked_codes)}
    synthetic_winner_code = ranked_codes[0] if ranked_codes else None
    synthetic_winner_time = best_times.get(synthetic_winner_code, {}).get("total_race_time") if synthetic_winner_code else None
    synthetic_winner_laps = best_times.get(synthetic_winner_code, {}).get("laps_completed", 0) if synthetic_winner_code else 0

    winner_fallback_time = None
    if session.results is not None and not session.results.empty:
        try:
            winner_row = session.results[session.results['Position'] == 1].iloc[0]
            winner_code = winner_row.get("Abbreviation", "???")
            winner_fallback_time = best_times.get(winner_code, {}).get("total_race_time")
        except Exception:
            pass

        for _, row in session.results.iterrows():
            driver_code = row.get("Abbreviation", "???")
            if driver_code not in drivers_info:
                continue

            info = drivers_info[driver_code]
            bt = best_times.get(driver_code, {})

            # Position
            position = None
            try:
                pos_raw = row.get("Position")
                if pos_raw is not None and not (isinstance(pos_raw, float) and np.isnan(pos_raw)):
                    position = int(pos_raw)
            except (TypeError, ValueError):
                pass
            
            if position is None:
                position = synthetic_ranks.get(driver_code)

            # Grid position
            grid = None
            try:
                grid_raw = row.get("GridPosition")
                if grid_raw is not None and not (isinstance(grid_raw, float) and np.isnan(grid_raw)):
                    grid = int(grid_raw)
            except (TypeError, ValueError):
                pass

            # Gap to leader
            status_raw = str(row.get("Status", "")).strip()

            # Synthesize Status if empty
            if not status_raw:
                laps_completed = bt.get("laps_completed", 0)
                if laps_completed > 0:
                    laps_down = synthetic_winner_laps - laps_completed
                    if laps_down > 0:
                        status_raw = f"+{laps_down} Lap" + ("s" if laps_down > 1 else "")
                    else:
                        status_raw = "Finished"
            
            winner_time_to_use = winner_fallback_time if winner_fallback_time else synthetic_winner_time
            
            time_val = None
            if hasattr(row, 'Time') or "Time" in row:
                time_val = row.get("Time")

            gap_str = _format_gap(time_val, position, status_raw)
            
            if gap_str is None and position is not None and position > 1 and status_raw == "Finished":
                this_time = bt.get("total_race_time")
                if this_time and winner_time_to_use:
                    gap_secs = this_time - winner_time_to_use
                    if gap_secs > 0:
                        gap_str = f"+{gap_secs:.3f}s"

            bl = bt.get("lap_time")
            s1 = bt.get("s1")
            s2 = bt.get("s2")
            s3 = bt.get("s3")

            # Points
            points = 0.0
            try:
                pts_raw = row.get("Points", 0)
                points = float(pts_raw) if pts_raw is not None and not pd.isna(pts_raw) else 0.0
            except (TypeError, ValueError):
                pass

            drivers.append({
                "position": position,
                "grid_position": grid,
                "driver_code": driver_code,
                "full_name": info["full_name"],
                "team_name": info["team_name"],
                "team_color": info["team_color"],
                "driver_number": info["driver_number"],
                "gap_to_leader": gap_str,
                "best_lap_time": bl,
                "best_lap_number": bt.get("lap_number"),
                "best_s1": s1,
                "best_s2": s2,
                "best_s3": s3,
                "last_lap_time": bt.get("last_lap_time"),
                "laps_completed": bt.get("laps_completed", 0),
                "compound": bt.get("compound"),
                "tyre_age": bt.get("tyre_age", 0),
                "pit_stops": bt.get("pit_stops", 0),
                "status": status_raw,
                "points": points,
                "is_best_lap": is_best(bl, overall_best_lap),
                "is_best_s1":  is_best(s1, overall_best_s1),
                "is_best_s2":  is_best(s2, overall_best_s2),
                "is_best_s3":  is_best(s3, overall_best_s3),
                "headshot_url": info.get("headshot_url"),
            })
    else:
        # Fallback: build from drivers_info alone (no position ordering)
        for driver_code, info in drivers_info.items():
            bt = best_times.get(driver_code, {})
            bl = bt.get("lap_time")
            s1, s2, s3 = bt.get("s1"), bt.get("s2"), bt.get("s3")
            position = synthetic_ranks.get(driver_code)
            this_time = bt.get("total_race_time")
            laps_completed = bt.get("laps_completed", 0)
            
            status_raw = ""
            gap_str = None
            
            if laps_completed > 0:
                laps_down = synthetic_winner_laps - laps_completed
                if laps_down > 0:
                    status_raw = f"+{laps_down} Lap" + ("s" if laps_down > 1 else "")
                    gap_str = status_raw
                else:
                    status_raw = "Finished"
                    if position == 1:
                        gap_str = "LEADER"
                    elif this_time and synthetic_winner_time:
                        gap_secs = this_time - synthetic_winner_time
                        if gap_secs > 0:
                            gap_str = f"+{gap_secs:.3f}s"

            drivers.append({
                "position": position,
                "grid_position": None,
                "driver_code": driver_code,
                "full_name": info["full_name"],
                "team_name": info["team_name"],
                "team_color": info["team_color"],
                "driver_number": info["driver_number"],
                "gap_to_leader": gap_str,
                "best_lap_time": bl,
                "best_lap_number": bt.get("lap_number"),
                "best_s1": s1,
                "best_s2": s2,
                "best_s3": s3,
                "last_lap_time": bt.get("last_lap_time"),
                "laps_completed": laps_completed,
                "compound": bt.get("compound"),
                "tyre_age": bt.get("tyre_age", 0),
                "pit_stops": bt.get("pit_stops", 0),
                "status": status_raw,
                "points": 0.0,
                "is_best_lap": is_best(bl, overall_best_lap),
                "is_best_s1": is_best(s1, overall_best_s1),
                "is_best_s2": is_best(s2, overall_best_s2),
                "is_best_s3": is_best(s3, overall_best_s3),
            })

    # Sort: classified drivers first (ascending position), then unclassified
    drivers.sort(key=lambda r: (r["position"] is None, r["position"] or 999))

    return {
        "drivers": drivers,
        "overall_best_lap": overall_best_lap,
        "overall_best_s1":  overall_best_s1,
        "overall_best_s2":  overall_best_s2,
        "overall_best_s3":  overall_best_s3,
    }


def _format_gap(time_val, position: Optional[int], status: str) -> Optional[str]:
    """Format the gap-to-leader field from FastF1 results."""
    if position == 1:
        return "LEADER"

    # Try Timedelta
    if time_val is not None:
        try:
            if not pd.isna(time_val):
                secs = time_val.total_seconds()
                return f"+{secs:.3f}s"
        except (AttributeError, TypeError, ValueError):
            pass

    # Fall back to status string (+1 Lap, DNF, etc.)
    if status and status not in ("Finished", ""):
        return status

    return None
