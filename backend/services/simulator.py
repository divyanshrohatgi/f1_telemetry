"""
Mathematical Model for the 'What-If' Race Strategy Simulator.
Calculates tyre degradation, fuel burn, pit loss, and traffic (dirty air) effects.
"""

import math
import logging
import pandas as pd
from typing import Optional

from services.fastf1_loader import load_session, get_drivers_for_session
from models.schemas import PitStopSimulation, SimulatedLap

logger = logging.getLogger(__name__)

# Constants for the physics model
FUEL_BURN_PER_LAP = 0.06  # Cars get 0.06s faster per lap as fuel burns
BASE_PIT_LOSS = 22.0      # Average pit loss time in seconds

# Tyre Degradation slope (seconds off pace per lap of age)
TYRE_DEG_RATES = {
    "SOFT": 0.12,
    "MEDIUM": 0.08,
    "HARD": 0.05,
    "INTER": 0.15,
    "WET": 0.20,
    "UNKNOWN": 0.08
}

def simulate_race_strategy(
    year: int, gp: str, session_type: str, 
    driver_code: str, starting_compound: Optional[str],
    pit_stops: list[PitStopSimulation]
) -> dict:
    """Run the mathematical strategy simulation."""
    session = load_session(year, gp, session_type, load_laps=True)
    laps = session.laps

    # Filter out deleted/inaccurate laps if possible, but we need all laps for cumulative times
    
    # 1. Establish the historical baseline
    driver_laps = laps.pick_driver(driver_code)
    if len(driver_laps) == 0:
        raise ValueError(f"No laps found for driver {driver_code}")

    total_laps = int(laps['LapNumber'].max())
    
    # Historical cumulative times for traffic simulation
    # We build a dict: lap_number -> list of cumulative times of all OTHER drivers
    other_drivers = [d for d in get_drivers_for_session(session, year).keys() if d != driver_code]
    traffic_data = {}
    for lap_idx in range(1, total_laps + 1):
        traffic_data[lap_idx] = []
        
    for other in other_drivers:
        olaps = laps.pick_driver(other)
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

    # Determine baseline pace (raw generic pace for the driver on lap 1 fuel level, 0 tyre age)
    # This is a simplification. We find their fastest clean lap, reverse out the fuel and tyre age.
    clean_laps = driver_laps.pick_quicklaps()
    if len(clean_laps) == 0:
        clean_laps = valid_actual_laps
        
    best_lap_idx = clean_laps['LapTime'].dt.total_seconds().idxmin()
    best_lap = clean_laps.loc[best_lap_idx]
    
    best_raw_time = best_lap['LapTime'].total_seconds()
    best_lap_num = best_lap['LapNumber']
    best_compound = str(best_lap['Compound']).upper()
    best_tyre_life = best_lap['TyreLife'] if pd.notnull(best_lap['TyreLife']) else 1.0

    # Reverse engineer the base pace for soft tyre on lap 1
    # Base Pace = Lap Time + Fuel Weight Penalty - Tyre Age Degradation
    # Example: If lap 40 is 1:20.0s, fuel weight on lap 40 is (total-40)*0.06. 
    # Pace at lap 1 (heavier) = 1:20.0 + (40 * 0.06) 
    deg_rate_best = TYRE_DEG_RATES.get(best_compound, 0.08)
    lap1_heavy_pace = best_raw_time + (best_lap_num * FUEL_BURN_PER_LAP) - (best_tyre_life * deg_rate_best)

    # Generate synthetic baseline paces for other compounds by adding compound offsets
    # roughly: Soft is 0.6s faster than Medium, Medium is 0.6s faster than Hard
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
            base_paces[c] = lap1_heavy_pace + 5.0 # arbitrary slow fallback

    # 2. RUN SIMULATION LOOP
    current_compound = starting_compound.upper() if starting_compound else str(driver_laps.iloc[0]['Compound']).upper()
    if pd.isnull(current_compound) or current_compound == "NAN":
        current_compound = "MEDIUM"
        
    current_tyre_age = 1
    cumulative_time = 0.0
    simulated_laps = []
    
    # Sort pit stops by lap
    pit_stops_sorted = sorted(pit_stops, key=lambda x: x.lap)
    pit_idx = 0

    # Use actual Lap 1 time to account for the standing start / grid position traffic
    if len(valid_actual_laps) > 0:
        lap1_time = valid_actual_laps.iloc[0]['LapTime'].total_seconds()
    else:
        lap1_time = base_paces[current_compound] + 5.0 # Standing start penalty

    for lap in range(1, total_laps + 1):
        is_pit_in = False
        is_pit_out = False
        pit_time_loss = 0.0

        # Check if we are pitting on this lap
        if pit_idx < len(pit_stops_sorted) and pit_stops_sorted[pit_idx].lap == lap:
            is_pit_in = True
            pit_time_loss = BASE_PIT_LOSS
            next_compound = pit_stops_sorted[pit_idx].compound.upper()
            pit_idx += 1
        
        # Check if previous lap was a pit in
        if lap > 1 and len(simulated_laps) > 0 and simulated_laps[-1].is_pit_in_lap:
            is_pit_out = True

        if lap == 1:
            raw_lap_time = lap1_time
        else:
            # Physics Calculation
            # 1. Base pace
            base_pace = base_paces.get(current_compound, base_paces["MEDIUM"])
            
            # 2. Fuel burn bonus (-0.06s per lap driven)
            fuel_bonus = lap * FUEL_BURN_PER_LAP
            
            # 3. Tyre degradation penalty
            deg_rate = TYRE_DEG_RATES.get(current_compound, 0.08)
            tyre_penalty = current_tyre_age * deg_rate
            
            raw_lap_time = base_pace - fuel_bonus + tyre_penalty

        # Apply pit loss
        raw_lap_time += pit_time_loss

        # Traffic Simulation (Dirty Air)
        traffic_penalty = 0.0
        if lap > 1 and lap in traffic_data and len(traffic_data[lap]) > 0:
            # Sort the other cumulative times
            others = sorted(traffic_data[lap])
            for other_time in others:
                # If we are slightly behind a car (time delta is between 0.2 and +1.5s)
                delta = cumulative_time - other_time
                if 0.2 < delta < 1.5:
                    traffic_penalty = 0.4  # Lose 0.4s battling dirty air
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
            traffic_penalty=traffic_penalty
        )
        simulated_laps.append(sim_lap)

        # Update tyre age and compound for next lap
        if is_pit_in:
            current_compound = next_compound
            current_tyre_age = 0  # will be 1 on out-lap
        current_tyre_age += 1

    return {
        "session_key": f"{year}_{gp.lower()}_{session_type.lower()}",
        "driver_code": driver_code,
        "original_total_time": round(actual_race_time_total, 3),
        "simulated_total_time": round(cumulative_time, 3),
        "time_delta": round(cumulative_time - actual_race_time_total, 3),
        "simulated_laps": simulated_laps
    }
