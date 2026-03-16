"""
Precompute compound baseline lap times per circuit.

Runs once. Output: data/compound_baselines.json
Structure: { "Australian Grand Prix": { "SOFT": 79.5, "MEDIUM": 80.2, "HARD": 81.1 }, ... }

Usage:
    cd backend
    python scripts/precompute_baselines.py [--seasons 2022 2023 2024]
"""

import argparse
import json
import os
import fastf1
import numpy as np
import pandas as pd

OUTPUT_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "compound_baselines.json")
CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "cache")

fastf1.Cache.enable_cache(CACHE_DIR)

def compute_baselines(seasons: list) -> dict:
    # Use a temporary dictionary to hold lists of times across all years
    raw_baselines = {}

    for year in seasons:
        print(f"\n=== Season {year} ===")
        try:
            schedule = fastf1.get_event_schedule(year, include_testing=False)
        except Exception as exc:
            print(f"  Could not load schedule: {exc}")
            continue

        for _, event in schedule.iterrows():
            gp = str(event.get("EventName", ""))
            round_num = int(event.get("RoundNumber", 0))
            print(f"  {year} R{round_num} {gp} ...", end=" ", flush=True)

            # Look at Free Practice 2 (where low-fuel qualifying sims are done)
            try:
                session = fastf1.get_session(year, round_num, "FP2")
                session.load(laps=True, telemetry=False, weather=False, messages=False)
                laps = session.laps
            except Exception as exc:
                print(f"SKIP ({exc})")
                continue

            if laps is None or laps.empty:
                print("no laps")
                continue

            if gp not in raw_baselines:
                raw_baselines[gp] = {"SOFT": [], "MEDIUM": [], "HARD": []}

            for compound in ["SOFT", "MEDIUM", "HARD"]:
                not_deleted = ~laps["Deleted"].fillna(False) if "Deleted" in laps.columns else pd.Series(True, index=laps.index)
                mask = (
                    (laps["Compound"].str.upper() == compound)
                    & laps["LapTime"].notna()
                    & (laps["PitInTime"].isna())
                    & (laps["PitOutTime"].isna())
                    & not_deleted
                )
                
                # Ensure it's a dry, green-flag lap
                if "TrackStatus" in laps.columns:
                    mask &= laps["TrackStatus"].astype(str).str.strip().isin(["1", "2"])

                clean = laps[mask].copy()
                clean["lap_sec"] = clean["LapTime"].dt.total_seconds()
                clean = clean.dropna(subset=["lap_sec"])
                
                # If we have valid laps, take the average of the 3 ABSOLUTE FASTEST laps 
                # This isolates the low-fuel, clean-air pace of the compound
                if len(clean) >= 3:
                    fastest_laps = clean["lap_sec"].nsmallest(3).mean()
                    raw_baselines[gp][compound].append(fastest_laps)
                elif len(clean) > 0:
                    # Fallback if a compound was barely used
                    fastest_laps = clean["lap_sec"].min()
                    raw_baselines[gp][compound].append(fastest_laps)

            compounds_found = [c for c in ["SOFT", "MEDIUM", "HARD"] if raw_baselines[gp][c]]
            print(f"OK ({', '.join(compounds_found)})")

    # Now calculate the true mathematical average across all the seasons we collected
    final_baselines = {}
    for gp, compounds in raw_baselines.items():
        final_baselines[gp] = {}
        for compound, times in compounds.items():
            if times: # If the list is not empty
                final_baselines[gp][compound] = round(float(np.mean(times)), 3)

    return final_baselines

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seasons", nargs="+", type=int, default=[2022, 2023, 2024])
    args = parser.parse_args()

    print(f"Computing baselines for seasons: {args.seasons}")
    baselines = compute_baselines(args.seasons)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(baselines, f, indent=2)

    print(f"\nSaved {len(baselines)} circuits to {OUTPUT_PATH}")
    for gp, compounds in list(baselines.items())[:5]:
        print(f"  {gp}: {compounds}")

if __name__ == "__main__":
    main()