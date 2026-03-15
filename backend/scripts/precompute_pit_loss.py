"""
Precompute circuit-level pit stop time loss.

For every pit stop in the data, computes:
  pit_loss = pit_lap_time - median(driver's recent clean laps on same compound)

Output: data/pit_loss.json
Structure: { "Australian Grand Prix": 22.5, "Monaco Grand Prix": 19.8, ... }

Usage:
    cd backend
    python scripts/precompute_pit_loss.py [--seasons 2022 2023 2024 2025]
"""

import argparse
import json
import os

import fastf1
import numpy as np
import pandas as pd

OUTPUT_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "pit_loss.json")
CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "cache")

fastf1.Cache.enable_cache(CACHE_DIR)


def compute_pit_losses(seasons: list) -> dict:
    """Returns {gp_name: avg_pit_loss_seconds}"""
    # Accumulate losses per GP across seasons
    accum: dict = {}  # gp -> list of median losses (one per race-year)

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

            losses = []
            for driver in laps["Driver"].unique():
                d_laps = laps[laps["Driver"] == driver].sort_values("LapNumber").copy()

                # Find pit-in laps
                pit_in_mask = d_laps["PitInTime"].notna()
                pit_in_laps = d_laps[pit_in_mask]

                if pit_in_laps.empty:
                    continue

                for _, pit_lap in pit_in_laps.iterrows():
                    pit_lap_num = int(pit_lap["LapNumber"])
                    pit_lap_time = pit_lap["LapTime"]
                    if not hasattr(pit_lap_time, "total_seconds") or pd.isna(pit_lap_time):
                        continue
                    pit_lap_sec = float(pit_lap_time.total_seconds())

                    compound = str(pit_lap.get("Compound") or "UNKNOWN").upper()
                    if compound in ("NAN", "NONE", "NA", ""):
                        compound = "UNKNOWN"

                    # Clean laps of same compound in the 10 laps before the pit
                    clean_mask = (
                        (d_laps["LapNumber"] < pit_lap_num)
                        & (d_laps["LapNumber"] >= max(1, pit_lap_num - 10))
                        & (d_laps["Compound"].str.upper() == compound)
                        & d_laps["LapTime"].notna()
                        & d_laps["PitInTime"].isna()
                        & d_laps["PitOutTime"].isna()
                    )
                    if "TrackStatus" in d_laps.columns:
                        clean_mask &= d_laps["TrackStatus"].astype(str).str.strip().isin(["1", "2"])

                    clean_times = d_laps[clean_mask]["LapTime"].dt.total_seconds()
                    if len(clean_times) < 2:
                        continue

                    median_clean = float(np.median(clean_times))
                    loss = pit_lap_sec - median_clean

                    # Sanity: pit loss should be between 10 and 60 seconds
                    if 10.0 <= loss <= 60.0:
                        losses.append(loss)

            if losses:
                median_loss = float(np.median(losses))
                accum.setdefault(gp, []).append(median_loss)
                print(f"OK ({len(losses)} pit stops, median={median_loss:.1f}s)")
            else:
                print("no valid pit data")

    # Final average per circuit
    result = {}
    for gp, season_medians in accum.items():
        result[gp] = round(float(np.mean(season_medians)), 2)

    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seasons", nargs="+", type=int, default=[2022, 2023, 2024, 2025])
    args = parser.parse_args()

    print(f"Computing pit loss for seasons: {args.seasons}")
    losses = compute_pit_losses(args.seasons)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(losses, f, indent=2)

    print(f"\nSaved {len(losses)} circuits to {OUTPUT_PATH}")
    for gp, loss in list(losses.items())[:5]:
        print(f"  {gp}: {loss}s")


if __name__ == "__main__":
    main()
