"""
Mathematical Model for the 'What-If' Race Strategy Simulator.
Calculates tyre degradation, fuel burn, pit loss, and traffic (dirty air) effects.
"""

import json
import math
import logging
import unicodedata
import pandas as pd
from pathlib import Path


def _normalize_key(s: str) -> str:
    nfkd = unicodedata.normalize("NFKD", s)
    return nfkd.encode("ascii", "ignore").decode("ascii").lower().replace(" ", "_").replace("-", "_")
from typing import Optional

from services.fastf1_loader import load_session, get_drivers_for_session
from models.schemas import PitStopSimulation, SimulatedLap
from ml.model_registry import predict_degradation_curve

logger = logging.getLogger(__name__)

# Constants for the physics model
FUEL_BURN_PER_LAP = 0.06  # Cars get 0.06s faster per lap as fuel burns

DATA_DIR = Path(__file__).parent.parent / "data"


def _load_json(filename, default=None):
    path = DATA_DIR / filename
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return default or {}


_pit_loss_data = _load_json("pit_loss_by_circuit.json")
_baselines_data = _load_json("compound_baselines.json")


def _get_pit_loss(circuit_key: str, condition: str = "green") -> float:
    """Get pit loss for a circuit. Falls back to 22.0 if unknown."""
    key = _normalize_key(circuit_key)
    # Normalize all stored keys too for matching
    for stored_key, data in _pit_loss_data.items():
        nk = _normalize_key(stored_key)
        if nk == key or key in nk or nk in key:
            if isinstance(data, dict):
                return data.get(condition, data.get("green", 22.0))
            return float(data)
    return 22.0


def _build_deg_curves(
    compounds: list,
    circuit_id: str,
    track_temp: float,
    air_temp: float,
    year: int,
    total_laps: int,
) -> dict:
    """
    Pre-compute degradation curves for all compounds used in a simulation.
    Returns dict: compound → list of predicted deltas indexed by tyre_age (1-based).
    Uses the full AR-chain feature set via model_registry.
    """
    curves = {}
    for compound in set(c.upper() for c in compounds):
        try:
            result = predict_degradation_curve(
                compound=compound,
                circuit_id=circuit_id,
                track_temp=track_temp,
                air_temp=air_temp,
                max_laps=min(total_laps + 5, 60),
                year=year,
            )
            # Index 0 = tyre_age 1
            curves[compound] = [r["predicted_delta"] for r in result]
        except Exception:
            rate = {"SOFT": 0.12, "MEDIUM": 0.08, "HARD": 0.05, "INTER": 0.15, "WET": 0.20}.get(compound, 0.08)
            curves[compound] = [rate * age for age in range(total_laps + 6)]
    return curves


def _lookup_deg(curves: dict, compound: str, tyre_age: int) -> float:
    c = compound.upper()
    if c not in curves:
        return 0.0
    arr = curves[c]
    idx = max(0, min(tyre_age - 1, len(arr) - 1))
    return max(0.0, float(arr[idx]))


def simulate_race_strategy(
    year: int, gp: str, session_type: str,
    driver_code: str, starting_compound: Optional[str],
    pit_stops: list[PitStopSimulation]
) -> dict:
    """Run the mathematical strategy simulation."""
    session = load_session(year, gp, session_type, load_laps=True)
    laps = session.laps

    # Extract weather data for ML predictions
    track_temp = 30.0
    air_temp = 25.0
    try:
        if session.weather_data is not None and not session.weather_data.empty:
            track_temp = float(session.weather_data["TrackTemp"].mean())
            air_temp = float(session.weather_data["AirTemp"].mean())
    except Exception:
        pass

    # 1. Establish the historical baseline
    driver_laps = laps.pick_drivers(driver_code)
    if len(driver_laps) == 0:
        raise ValueError(f"No laps found for driver {driver_code}")

    total_laps = int(laps['LapNumber'].max())

    # Historical cumulative times for traffic simulation
    other_drivers = [d for d in get_drivers_for_session(session, year).keys() if d != driver_code]
    traffic_data = {}
    for lap_idx in range(1, total_laps + 1):
        traffic_data[lap_idx] = []

    for other in other_drivers:
        olaps = laps.pick_drivers(other)
        cumul = 0.0
        for _, row in olaps.iterrows():
            lap_num = int(row['LapNumber'])
            lt = row['LapTime']
            if pd.notnull(lt):
                cumul += lt.total_seconds()
                if lap_num in traffic_data:
                    traffic_data[lap_num].append(cumul)

    # Calculate actual race time
    actual_race_time_total = 0.0
    valid_actual_laps = driver_laps.dropna(subset=['LapTime'])
    if len(valid_actual_laps) > 0:
        actual_race_time_total = valid_actual_laps['LapTime'].dt.total_seconds().sum()

    # Determine baseline pace
    clean_laps = driver_laps.pick_quicklaps()
    if len(clean_laps) == 0:
        clean_laps = valid_actual_laps

    best_lap_idx = clean_laps['LapTime'].dt.total_seconds().idxmin()
    best_lap = clean_laps.loc[best_lap_idx]

    best_raw_time = best_lap['LapTime'].total_seconds()
    best_lap_num = best_lap['LapNumber']
    best_compound = str(best_lap['Compound']).upper()
    best_tyre_life = best_lap['TyreLife'] if pd.notnull(best_lap['TyreLife']) else 1.0

    # Per-circuit pit loss
    circuit_key = str(session.event.get("Location", gp)).lower().strip()
    pit_time_loss = _get_pit_loss(circuit_key, "green")

    # Pre-compute degradation curves for all compounds in this strategy
    all_compounds = [starting_compound or str(driver_laps.iloc[0]['Compound'])] + [p.compound for p in pit_stops]
    deg_curves = _build_deg_curves(all_compounds, circuit_key, track_temp, air_temp, year, total_laps)
    deg_at_best = _lookup_deg(deg_curves, best_compound, int(best_tyre_life))
    lap1_heavy_pace = best_raw_time + (best_lap_num * FUEL_BURN_PER_LAP) - deg_at_best

    base_paces = {
        "SOFT": lap1_heavy_pace if best_compound == "SOFT" else lap1_heavy_pace - 0.6,
        "MEDIUM": lap1_heavy_pace if best_compound == "MEDIUM" else lap1_heavy_pace,
        "HARD": lap1_heavy_pace if best_compound == "HARD" else lap1_heavy_pace + 0.6,
    }

    if best_compound == "SOFT":
        base_paces["MEDIUM"] = lap1_heavy_pace + 0.6
        base_paces["HARD"] = lap1_heavy_pace + 1.2
    elif best_compound == "HARD":
        base_paces["MEDIUM"] = lap1_heavy_pace - 0.6
        base_paces["SOFT"] = lap1_heavy_pace - 1.2

    for c in ["INTER", "WET", "UNKNOWN"]:
        if c not in base_paces:
            base_paces[c] = lap1_heavy_pace + 5.0

    # 2. RUN SIMULATION LOOP
    current_compound = starting_compound.upper() if starting_compound else str(driver_laps.iloc[0]['Compound']).upper()
    if pd.isnull(current_compound) or current_compound == "NAN":
        current_compound = "MEDIUM"

    current_tyre_age = 1
    cumulative_time = 0.0
    simulated_laps = []

    pit_stops_sorted = sorted(pit_stops, key=lambda x: x.lap)
    pit_idx = 0

    if len(valid_actual_laps) > 0:
        lap1_time = valid_actual_laps.iloc[0]['LapTime'].total_seconds()
    else:
        lap1_time = base_paces[current_compound] + 5.0

    for lap in range(1, total_laps + 1):
        is_pit_in = False
        is_pit_out = False
        lap_pit_loss = 0.0

        if pit_idx < len(pit_stops_sorted) and pit_stops_sorted[pit_idx].lap == lap:
            is_pit_in = True
            lap_pit_loss = pit_time_loss
            next_compound = pit_stops_sorted[pit_idx].compound.upper()
            pit_idx += 1

        if lap > 1 and len(simulated_laps) > 0 and simulated_laps[-1].is_pit_in_lap:
            is_pit_out = True

        if lap == 1:
            raw_lap_time = lap1_time
        else:
            base_pace = base_paces.get(current_compound, base_paces["MEDIUM"])
            fuel_bonus = lap * FUEL_BURN_PER_LAP
            tyre_penalty = _lookup_deg(deg_curves, current_compound, current_tyre_age)
            raw_lap_time = base_pace - fuel_bonus + tyre_penalty

        # Cold tyre out-lap penalty
        if is_pit_out:
            raw_lap_time += 1.5

        # Apply pit loss
        raw_lap_time += lap_pit_loss

        # Traffic Simulation (Dirty Air)
        traffic_penalty = 0.0
        if lap > 1 and lap in traffic_data and len(traffic_data[lap]) > 0:
            others = sorted(traffic_data[lap])
            for other_time in others:
                delta = cumulative_time - other_time
                if 0.2 < delta < 1.5:
                    traffic_penalty = 0.4
                    raw_lap_time += traffic_penalty
                    break

        lap_time = raw_lap_time
        cumulative_time += lap_time

        sim_lap = SimulatedLap(
            lap_number=lap,
            lap_time=round(lap_time, 3),
            cumulative_time=round(cumulative_time, 3),
            compound=current_compound,
            tyre_age=current_tyre_age,
            is_pit_in_lap=is_pit_in,
            is_pit_out_lap=is_pit_out,
            traffic_penalty=traffic_penalty,
        )
        simulated_laps.append(sim_lap)

        if is_pit_in:
            current_compound = next_compound
            current_tyre_age = 0
        current_tyre_age += 1

    # ── Build cumulative times for ALL drivers ──
    all_driver_codes = [str(d) for d in laps['Driver'].unique()]
    all_cumulative = {}

    for drv_code in all_driver_codes:
        drv_laps_df = laps.pick_drivers(drv_code)
        cumul = 0.0
        cumul_by_lap = {}
        for _, row in drv_laps_df.iterrows():
            lt = row['LapTime']
            if pd.notnull(lt):
                cumul += lt.total_seconds()
                cumul_by_lap[int(row['LapNumber'])] = cumul
        all_cumulative[drv_code] = cumul_by_lap

    # Replace target driver with simulated cumulative times
    sim_cumulative = {slap.lap_number: slap.cumulative_time for slap in simulated_laps}
    all_cumulative[driver_code] = sim_cumulative

    # ── Compute actual positions (before simulation) ──
    actual_cumulative = {}
    for drv_code in all_driver_codes:
        drv_laps_df = laps.pick_drivers(drv_code)
        cumul = 0.0
        cumul_by_lap = {}
        for _, row in drv_laps_df.iterrows():
            lt = row['LapTime']
            if pd.notnull(lt):
                cumul += lt.total_seconds()
                cumul_by_lap[int(row['LapNumber'])] = cumul
        actual_cumulative[drv_code] = cumul_by_lap

    # ── Calculate positions at each lap ──
    for lap_num in range(1, total_laps + 1):
        sim_lap_times = [(drv, all_cumulative[drv].get(lap_num))
                         for drv in all_driver_codes
                         if all_cumulative[drv].get(lap_num) is not None]
        sim_lap_times.sort(key=lambda x: x[1])
        sim_leader = sim_lap_times[0][1] if sim_lap_times else 0

        act_lap_times = [(drv, actual_cumulative[drv].get(lap_num))
                         for drv in all_driver_codes
                         if actual_cumulative[drv].get(lap_num) is not None]
        act_lap_times.sort(key=lambda x: x[1])
        act_leader = act_lap_times[0][1] if act_lap_times else 0

        sim_pos = None
        sim_gap = None
        for pos, (drv, ct) in enumerate(sim_lap_times, 1):
            if drv == driver_code:
                sim_pos = pos
                sim_gap = round(ct - sim_leader, 3)
                break

        act_pos = None
        act_gap = None
        for pos, (drv, ct) in enumerate(act_lap_times, 1):
            if drv == driver_code:
                act_pos = pos
                act_gap = round(ct - act_leader, 3)
                break

        for slap in simulated_laps:
            if slap.lap_number == lap_num:
                slap.position = sim_pos
                slap.gap_to_leader = sim_gap
                slap.actual_position = act_pos
                slap.actual_gap = act_gap
                break

    # ── Final standings ──
    final_lap_sim = [(drv, all_cumulative[drv].get(total_laps))
                     for drv in all_driver_codes
                     if all_cumulative[drv].get(total_laps) is not None]
    final_lap_sim.sort(key=lambda x: x[1])

    final_lap_act = [(drv, actual_cumulative[drv].get(total_laps))
                     for drv in all_driver_codes
                     if actual_cumulative[drv].get(total_laps) is not None]
    final_lap_act.sort(key=lambda x: x[1])

    act_final_pos = next((pos for pos, (d, _) in enumerate(final_lap_act, 1) if d == driver_code), None)
    sim_final_pos = next((pos for pos, (d, _) in enumerate(final_lap_sim, 1) if d == driver_code), None)

    final_standings = []
    for sim_rank, (drv, _) in enumerate(final_lap_sim, 1):
        act_rank = next((p for p, (d, _) in enumerate(final_lap_act, 1) if d == drv), None)
        final_standings.append({
            "driver_code": drv,
            "actual_position": act_rank,
            "simulated_position": sim_rank,
        })

    position_change = (act_final_pos or 0) - (sim_final_pos or 0)

    return {
        "session_key": f"{year}_{gp.lower()}_{session_type.lower()}",
        "driver_code": driver_code,
        "original_total_time": round(actual_race_time_total, 3),
        "simulated_total_time": round(cumulative_time, 3),
        "time_delta": round(cumulative_time - actual_race_time_total, 3),
        "actual_final_position": act_final_pos,
        "simulated_final_position": sim_final_pos,
        "position_change": position_change,
        "simulated_laps": simulated_laps,
        "final_standings": final_standings,
    }
