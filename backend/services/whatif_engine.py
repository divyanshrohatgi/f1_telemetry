"""
What-If Race Strategy Engine.

Modifies one driver's pit stop decision and recalculates race positions
for the entire field using actual FastF1 lap data.
"""

import json
import logging
import os
from typing import Dict, List, Optional

import pandas as pd

from services.fastf1_loader import load_session

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

COMPOUND_OFFSET: Dict[str, float] = {
    "SOFT": 0.0, "MEDIUM": 0.6, "HARD": 1.2,
    "INTERMEDIATE": 5.0, "WET": 8.0, "UNKNOWN": 0.6,
}

DEG_RATES: Dict[str, float] = {
    "SOFT": 0.12, "MEDIUM": 0.08, "HARD": 0.05,
    "INTERMEDIATE": 0.04, "WET": 0.03, "UNKNOWN": 0.08,
}

STREET_CIRCUITS = {
    "Monaco Grand Prix", "Azerbaijan Grand Prix",
    "Singapore Grand Prix", "Las Vegas Grand Prix",
}

DEFAULT_PIT_LOSS = 23.0
STREET_PIT_LOSS = 20.0

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _pit_loss(gp_name: str) -> float:
    try:
        with open(os.path.join(_DATA_DIR, "pit_loss.json")) as f:
            data = json.load(f)
        if gp_name in data:
            return float(data[gp_name])
    except Exception:
        pass
    return STREET_PIT_LOSS if gp_name in STREET_CIRCUITS else DEFAULT_PIT_LOSS


def _build_timeline(laps_df: pd.DataFrame, driver: str) -> Dict[int, Dict]:
    """lap_number → {time, compound, tyre_age}"""
    rows = laps_df[laps_df["Driver"] == driver].sort_values("LapNumber")
    tl: Dict[int, Dict] = {}
    for _, row in rows.iterrows():
        lt = row["LapTime"]
        lt_sec: Optional[float] = None
        if hasattr(lt, "total_seconds") and pd.notna(lt):
            lt_sec = float(lt.total_seconds())
        compound = str(row.get("Compound") or "UNKNOWN").upper()
        if compound in ("NAN", "NONE", "NA", ""):
            compound = "UNKNOWN"
        tyre_age = int(row.get("TyreLife") or 0)
        tl[int(row["LapNumber"])] = {
            "time": lt_sec,
            "compound": compound,
            "tyre_age": tyre_age,
        }
    return tl


def _driver_baselines(tl: Dict[int, Dict], primary_compound: str) -> Dict[str, float]:
    """Estimate per-compound baseline pace (25th percentile of actual laps)."""
    by_compound: Dict[str, List[float]] = {}
    for data in tl.values():
        if data["time"] is None:
            continue
        by_compound.setdefault(data["compound"], []).append(data["time"])

    baselines: Dict[str, float] = {}
    for c, times in by_compound.items():
        ts = sorted(times)
        baselines[c] = ts[max(0, len(ts) // 4)]

    primary_base = baselines.get(
        primary_compound,
        baselines.get("MEDIUM", baselines.get("SOFT", baselines.get("HARD", 90.0))),
    )
    primary_off = COMPOUND_OFFSET.get(primary_compound, 0.0)

    for c in ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET", "UNKNOWN"]:
        if c not in baselines:
            baselines[c] = primary_base + COMPOUND_OFFSET.get(c, 0.6) - primary_off
    return baselines


def _predict_lap(
    laps_df: pd.DataFrame,
    driver: str,
    compound: str,
    lap_num: int,
    tyre_age: int,
    baselines: Dict[str, float],
) -> float:
    """Predict lap time via peer laps, falling back to physics model."""
    tyre_age = max(1, tyre_age)
    try:
        mask = (
            (laps_df["Compound"].str.upper() == compound)
            & (laps_df["TyreLife"].between(max(1, tyre_age - 3), tyre_age + 3))
            & (laps_df["LapNumber"].between(max(1, lap_num - 4), lap_num + 4))
            & laps_df["LapTime"].notna()
            & (laps_df["Driver"] != driver)
        )
        peer = laps_df[mask]["LapTime"].dt.total_seconds()
        if len(peer) >= 3:
            return round(float(peer.median()), 3)
    except Exception:
        pass
    # Physics fallback
    base = baselines.get(compound, baselines.get("MEDIUM", 90.0))
    predicted = base + tyre_age * DEG_RATES.get(compound, 0.08) - lap_num * 0.06
    return round(max(predicted, base * 0.97), 3)


def _compute_cumulative(
    timelines: Dict[str, Dict[int, Dict]],
    drivers: List[str],
    total_laps: int,
) -> Dict[str, Dict[int, Optional[float]]]:
    cumul: Dict[str, Dict[int, Optional[float]]] = {}
    for d in drivers:
        tl = timelines.get(d, {})
        running = 0.0
        cumul[d] = {}
        for l in range(1, total_laps + 1):
            data = tl.get(l)
            if data and data.get("time") is not None:
                running += data["time"]
                cumul[d][l] = running
            else:
                cumul[d][l] = None
    return cumul


def _positions_at_lap(
    cumul: Dict[str, Dict[int, Optional[float]]],
    drivers: List[str],
    lap_num: int,
) -> Dict[str, int]:
    progress: Dict[str, tuple] = {}
    for d in drivers:
        last_l, last_t = 0, float("inf")
        for l in range(lap_num, 0, -1):
            t = cumul.get(d, {}).get(l)
            if t is not None:
                last_l, last_t = l, t
                break
        progress[d] = (last_l, last_t)
    ordered = sorted(drivers, key=lambda d: (-progress[d][0], progress[d][1]))
    return {d: i + 1 for i, d in enumerate(ordered)}


def _gap_to_leader(
    cumul: Dict[str, Dict[int, Optional[float]]],
    driver: str,
    lap_num: int,
    positions: Dict[str, int],
) -> float:
    leader = next((d for d, p in positions.items() if p == 1), None)
    if not leader:
        return 0.0
    lt = cumul.get(leader, {}).get(lap_num)
    dt = cumul.get(driver, {}).get(lap_num)
    if lt is None or dt is None:
        return 0.0
    return round(dt - lt, 3)


def _final_standings(
    cumul: Dict[str, Dict[int, Optional[float]]],
    drivers: List[str],
    total_laps: int,
) -> List[Dict]:
    progress: Dict[str, tuple] = {}
    for d in drivers:
        last_l, last_t = 0, float("inf")
        for l in range(total_laps, 0, -1):
            t = cumul.get(d, {}).get(l)
            if t is not None:
                last_l, last_t = l, t
                break
        progress[d] = (last_l, last_t)
    ordered = sorted(drivers, key=lambda d: (-progress[d][0], progress[d][1]))
    if not ordered:
        return []
    leader_t = progress[ordered[0]][1]
    return [
        {
            "driver": d,
            "position": i + 1,
            "gap": round(progress[d][1] - leader_t, 3) if progress[d][1] < float("inf") else None,
        }
        for i, d in enumerate(ordered)
    ]


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_whatif(
    year: int,
    gp_name: str,
    session_type: str,
    driver: str,
    original_pit_lap: int,
    new_pit_lap: int,
    new_compound: str,
) -> Dict:
    """
    Modify one pit stop for `driver` and recalculate the entire race.

    original_pit_lap: first lap on the new compound in the actual race
                      (= stints[i+1].start_lap from the strategy endpoint)
    new_pit_lap:      first lap on the new compound in the simulation
    new_compound:     compound to switch to in the simulation
    """
    session = load_session(year, gp_name, session_type, load_laps=True)
    laps = session.laps
    gp_name = str(session.event.get("EventName", ""))
    total_laps = int(laps["LapNumber"].max())
    pit_loss = _pit_loss(gp_name)
    new_compound = new_compound.upper()

    all_drivers: List[str] = sorted(laps["Driver"].unique().tolist())
    timelines = {d: _build_timeline(laps, d) for d in all_drivers}
    target_tl = timelines.get(driver, {})

    # Compound the driver was on BEFORE original_pit_lap
    compound_before = "SOFT"
    for l in range(original_pit_lap - 1, 0, -1):
        if l in target_tl:
            compound_before = target_tl[l]["compound"]
            break

    # Tyre age just before the original pit
    tyre_age_at_orig = target_tl.get(original_pit_lap - 1, {}).get("tyre_age", original_pit_lap - 1)

    baselines = _driver_baselines(target_tl, compound_before)

    # -----------------------------------------------------------------------
    # Build simulated timeline for target driver
    # -----------------------------------------------------------------------
    sim_tl: Dict[int, Optional[Dict]] = {}

    if new_pit_lap <= original_pit_lap:
        # Pitting EARLIER (or same lap, different compound)
        for l in range(1, total_laps + 1):
            if l < new_pit_lap:
                sim_tl[l] = dict(target_tl[l]) if l in target_tl else None
            elif l == new_pit_lap:
                ta = target_tl.get(l - 1, {}).get("tyre_age", l - 1)
                pred = _predict_lap(laps, driver, compound_before, l, ta, baselines)
                sim_tl[l] = {
                    "time": round(pred + pit_loss, 3),
                    "compound": compound_before,
                    "tyre_age": ta,
                    "is_simulated": True,
                }
            else:
                ta_new = l - new_pit_lap
                pred = _predict_lap(laps, driver, new_compound, l, ta_new, baselines)
                sim_tl[l] = {
                    "time": pred,
                    "compound": new_compound,
                    "tyre_age": ta_new,
                    "is_simulated": True,
                }
    else:
        # Pitting LATER — driver stays out on compound_before past original_pit_lap
        for l in range(1, total_laps + 1):
            if l < original_pit_lap:
                sim_tl[l] = dict(target_tl[l]) if l in target_tl else None
            elif original_pit_lap <= l < new_pit_lap:
                ta_ext = tyre_age_at_orig + (l - original_pit_lap) + 1
                pred = _predict_lap(laps, driver, compound_before, l, ta_ext, baselines)
                sim_tl[l] = {
                    "time": pred,
                    "compound": compound_before,
                    "tyre_age": ta_ext,
                    "is_simulated": True,
                }
            elif l == new_pit_lap:
                ta_ext = tyre_age_at_orig + (l - original_pit_lap) + 1
                pred = _predict_lap(laps, driver, compound_before, l, ta_ext, baselines)
                sim_tl[l] = {
                    "time": round(pred + pit_loss, 3),
                    "compound": compound_before,
                    "tyre_age": ta_ext,
                    "is_simulated": True,
                }
            else:
                ta_new = l - new_pit_lap
                pred = _predict_lap(laps, driver, new_compound, l, ta_new, baselines)
                sim_tl[l] = {
                    "time": pred,
                    "compound": new_compound,
                    "tyre_age": ta_new,
                    "is_simulated": True,
                }

    # Fill any remaining None slots with actual data
    for l in range(1, total_laps + 1):
        if sim_tl.get(l) is None and l in target_tl:
            sim_tl[l] = dict(target_tl[l])

    # -----------------------------------------------------------------------
    # Cumulative times
    # -----------------------------------------------------------------------
    actual_cumul = _compute_cumulative(timelines, all_drivers, total_laps)
    sim_timelines = {
        d: ({k: v for k, v in sim_tl.items() if v is not None} if d == driver else timelines[d])
        for d in all_drivers
    }
    sim_cumul = _compute_cumulative(sim_timelines, all_drivers, total_laps)

    # -----------------------------------------------------------------------
    # Per-lap results for target driver
    # -----------------------------------------------------------------------
    actual_laps_out = []
    sim_laps_out = []

    for l in range(1, total_laps + 1):
        act_pos = _positions_at_lap(actual_cumul, all_drivers, l)
        sim_pos = _positions_at_lap(sim_cumul, all_drivers, l)
        act_data = target_tl.get(l, {})
        s_data = sim_tl.get(l) or {}

        actual_laps_out.append({
            "lap": l,
            "position": act_pos.get(driver, 20),
            "gap": _gap_to_leader(actual_cumul, driver, l, act_pos),
            "time": act_data.get("time") or 0.0,
            "compound": act_data.get("compound", "UNKNOWN"),
            "tyre_age": act_data.get("tyre_age", 0),
            "is_simulated": False,
        })
        sim_laps_out.append({
            "lap": l,
            "position": sim_pos.get(driver, 20),
            "gap": _gap_to_leader(sim_cumul, driver, l, sim_pos),
            "time": s_data.get("time") or 0.0,
            "compound": s_data.get("compound", "UNKNOWN"),
            "tyre_age": s_data.get("tyre_age", 0),
            "is_simulated": bool(s_data.get("is_simulated", False)),
        })

    actual_final = _final_standings(actual_cumul, all_drivers, total_laps)
    sim_final = _final_standings(sim_cumul, all_drivers, total_laps)

    act_pos_final = next((d["position"] for d in actual_final if d["driver"] == driver), 20)
    sim_pos_final = next((d["position"] for d in sim_final if d["driver"] == driver), 20)
    act_total = actual_cumul.get(driver, {}).get(total_laps) or 0.0
    sim_total = sim_cumul.get(driver, {}).get(total_laps) or 0.0

    return {
        "summary": {
            "driver": driver,
            "actual_position": act_pos_final,
            "simulated_position": sim_pos_final,
            "position_change": act_pos_final - sim_pos_final,
            "time_delta": round(sim_total - act_total, 3),
        },
        "actual_laps": actual_laps_out,
        "simulated_laps": sim_laps_out,
        "all_drivers_actual_final": actual_final,
        "all_drivers_simulated_final": sim_final,
    }
