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

    # 1. Build actual lap-by-lap data for this driver
    driver_laps = laps.pick_drivers(driver_code)
    if len(driver_laps) == 0:
        raise ValueError(f"No laps found for driver {driver_code}")

    total_laps = int(laps['LapNumber'].max())
    valid_actual_laps = driver_laps.dropna(subset=['LapTime'])

    actual_lap_times = {}
    for _, row in valid_actual_laps.iterrows():
        actual_lap_times[int(row['LapNumber'])] = row['LapTime'].total_seconds()

    actual_race_time_total = sum(actual_lap_times.values())

    # 2. Base pace = MEDIAN of clean laps
    clean_laps = driver_laps.pick_quicklaps()
    if len(clean_laps) == 0:
        clean_laps = valid_actual_laps

    clean_times = clean_laps['LapTime'].dt.total_seconds() if len(clean_laps) > 0 else pd.Series(dtype=float)
    if len(clean_times) > 0:
        median_pace = float(clean_times.median())
        compound_mode = clean_laps['Compound'].mode()
        best_compound = str(compound_mode.iloc[0]).upper() if len(compound_mode) > 0 else 'MEDIUM'
    else:
        median_pace = 90.0
        best_compound = 'MEDIUM'

    # 3. Per-circuit pit loss
    circuit_key = str(session.event.get("Location", gp)).lower().strip()
    pit_time_loss = _get_pit_loss(circuit_key, "green")

    # 4. Pre-compute ML degradation curves
    all_compounds = [starting_compound or str(driver_laps.iloc[0]['Compound'])] + [p.compound for p in pit_stops]
    deg_curves = _build_deg_curves(all_compounds, circuit_key, track_temp, air_temp, year, total_laps)

    # 5. Compound pace offsets relative to best_compound median
    compound_offsets = {"SOFT": -0.8, "MEDIUM": 0.0, "HARD": 0.5, "INTER": 3.0, "WET": 5.0, "UNKNOWN": 0.0}
    base_offset = compound_offsets.get(best_compound, 0.0)
    base_paces = {comp: median_pace + (offset - base_offset) for comp, offset in compound_offsets.items()}

    # 6. Find divergence lap — first lap where simulated pit schedule differs from actual
    actual_pit_laps = set()
    for _, row in valid_actual_laps.iterrows():
        if pd.notna(row.get('PitInTime')):
            actual_pit_laps.add(int(row['LapNumber']))

    simulated_pit_laps = sorted(set(p.lap for p in pit_stops))

    diverge_lap = total_laps + 1
    all_pit_laps = actual_pit_laps | set(simulated_pit_laps)
    for pl in sorted(all_pit_laps):
        if pl not in actual_pit_laps or pl not in set(simulated_pit_laps):
            diverge_lap = pl
            break
        # Same lap in both — check if the fitted compound differs.
        # The compound the driver switched TO is recorded on the lap AFTER the
        # stop (the out-lap); the in-lap still carries the old stint's tyre.
        sim_compound = next((p.compound.upper() for p in pit_stops if p.lap == pl), None)
        act_compound_row = valid_actual_laps[valid_actual_laps['LapNumber'] == pl + 1]
        act_compound = None
        if len(act_compound_row) > 0:
            nc = act_compound_row.iloc[0].get('Compound')
            if pd.notna(nc):
                act_compound = str(nc).upper()
        if sim_compound and act_compound and sim_compound != act_compound:
            diverge_lap = pl
            break

    # 7. Build traffic data from other drivers' actual cumulative times
    other_drivers = [d for d in laps['Driver'].unique() if str(d) != driver_code]
    traffic_data = {lap_idx: [] for lap_idx in range(1, total_laps + 1)}
    for other in other_drivers:
        olaps = laps.pick_drivers(str(other))
        cumul = 0.0
        for _, row in olaps.iterrows():
            lap_num = int(row['LapNumber'])
            lt = row['LapTime']
            if pd.notnull(lt):
                cumul += lt.total_seconds()
                if lap_num in traffic_data:
                    traffic_data[lap_num].append(cumul)

    # 8. RUN SIMULATION LOOP
    current_compound = starting_compound.upper() if starting_compound else str(driver_laps.iloc[0]['Compound']).upper()
    if pd.isnull(current_compound) or current_compound == "NAN":
        current_compound = "MEDIUM"

    current_tyre_age = 1
    cumulative_time = 0.0
    simulated_laps = []

    pit_stops_sorted = sorted(pit_stops, key=lambda x: x.lap)
    pit_idx = 0
    next_compound = current_compound
    mid_lap = total_laps / 2.0  # fuel reference: median pace ≈ mid-race fuel load

    for lap in range(1, total_laps + 1):
        is_pit_in = False
        is_pit_out = False

        if pit_idx < len(pit_stops_sorted) and pit_stops_sorted[pit_idx].lap == lap:
            is_pit_in = True
            next_compound = pit_stops_sorted[pit_idx].compound.upper()
            pit_idx += 1

        if lap > 1 and len(simulated_laps) > 0 and simulated_laps[-1].is_pit_in_lap:
            is_pit_out = True

        # Before the strategy diverges from reality, replay the driver's real lap
        # times — these already embed the actual pit loss and traffic, so an
        # unchanged strategy reproduces the real race exactly.
        use_actual = lap < diverge_lap and lap in actual_lap_times
        traffic_penalty = 0.0

        if use_actual:
            raw_lap_time = actual_lap_times[lap]
        else:
            base_pace = base_paces.get(current_compound, base_paces["MEDIUM"])
            # Fuel correction relative to mid-race: heavy early (slower),
            # light late (faster). Zero at mid-distance where median pace sits.
            fuel_adj = (mid_lap - lap) * FUEL_BURN_PER_LAP
            tyre_penalty = _lookup_deg(deg_curves, current_compound, current_tyre_age)
            # Deterministic noise ±0.15s based on lap number parity
            noise = 0.15 if lap % 3 == 0 else (-0.15 if lap % 3 == 1 else 0.0)
            raw_lap_time = base_pace + fuel_adj + tyre_penalty + noise

            # Pit loss is recorded on the out-lap (as in the timing data), along
            # with the cold-tyre warm-up penalty.
            if is_pit_out:
                raw_lap_time += pit_time_loss + 1.5

            # Traffic simulation (dirty air) — only on modelled laps; real laps
            # already reflect the traffic the driver was actually in.
            if lap > 1 and lap in traffic_data and len(traffic_data[lap]) > 0:
                others_sorted = sorted(traffic_data[lap])
                for other_time in others_sorted:
                    delta = cumulative_time - other_time  # positive = we are behind
                    if 0.2 < delta <= 2.0:
                        traffic_penalty = 1.0
                        break
                    elif 2.0 < delta <= 4.0:
                        traffic_penalty = 0.3
                        break
                raw_lap_time += traffic_penalty

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
            traffic_penalty=round(traffic_penalty, 3),
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
