"""
Precompute compound baseline lap times per circuit.

Runs once. Output: data/compound_baselines.json
Structure: { "Australian Grand Prix": { "SOFT": 79.5, "MEDIUM": 80.2, "HARD": 81.1 }, ... }

Usage:
    cd backend
    python scripts/precompute_baselines.py [--seasons 2022 2023 2024 2025]
"""

import argparse
import json
import os
import sys

import fastf1
import numpy as np
import pandas as pd

OUTPUT_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "compound_baselines.json")
CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "cache")

fastf1.Cache.enable_cache(CACHE_DIR)


def compute_baselines(seasons: list) -> dict:
    baselines: dict = {}

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

            try:
                session = fastf1.get_session(year, round_num, "R")
                session.load(laps=True, telemetry=False, weather=False, messages=False)
                laps = session.laps
            except Exception as exc:
                print(f"SKIP ({exc})")
                continue

            if laps is None or laps.empty:
                print("no laps")
                continue

            if gp not in baselines:
                baselines[gp] = {}

            for compound in ["SOFT", "MEDIUM", "HARD"]:
                mask = (
                    (laps["Compound"].str.upper() == compound)
                    & laps["LapTime"].notna()
                    & (laps["PitInTime"].isna())
                    & (laps["PitOutTime"].isna())
                    & ~laps.get("Deleted", pd.Series(False, index=laps.index))
                )
                # Only green-flag laps
                if "TrackStatus" in laps.columns:
                    mask &= laps["TrackStatus"].astype(str).str.strip().isin(["1", "2"])

                clean = laps[mask]["LapTime"].dt.total_seconds()
                if len(clean) >= 5:
                    p25 = float(np.percentile(clean, 25))
                    existing = baselines[gp].get(compound)
                    if existing is None:
                        baselines[gp][compound] = round(p25, 3)
                    else:
                        # Average across seasons
                        baselines[gp][compound] = round((existing + p25) / 2, 3)

            compounds_found = [c for c in ["SOFT", "MEDIUM", "HARD"] if c in baselines.get(gp, {})]
            print(f"OK ({', '.join(compounds_found)})")

    return baselines


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seasons", nargs="+", type=int, default=[2022, 2023, 2024, 2025])
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
