"""
PitSense pit loss calculator — computes pit stop time loss per track condition.

Three conditions:
  - green:  normal racing pace, standard pit loss (~22s)
  - sc:     Safety Car deployed, field bunched, pit loss drops ~10-15s
  - vsc:    Virtual Safety Car, ~40% speed reduction, pit loss drops ~5-8s

Can be computed from a live FastF1 session or fall back to defaults per compound.
"""

import logging
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# Typical green-flag pit loss per circuit category (seconds)
_DEFAULT_PIT_LOSS = 23.0
_SC_REDUCTION     = 12.0   # approx seconds saved under SC
_VSC_REDUCTION    = 6.0    # approx seconds saved under VSC


def compute_pit_losses(session) -> dict:
    """
    Compute pit loss times for three track conditions from a FastF1 session.

    Returns:
        {
            "green": {"median": float, "samples": int},
            "sc":    {"median": float, "samples": int},
            "vsc":   {"median": float, "samples": int},
        }
    """
    try:
        laps = session.laps.copy()

        # Average clean lap time (green flag, no pit in/out)
        green_clean = laps[
            laps["PitInTime"].isna() &
            laps["PitOutTime"].isna() &
            laps["TrackStatus"].astype(str).str.strip() == "1"
        ]
        lap_time_secs = green_clean["LapTime"].dropna().apply(
            lambda td: td.total_seconds() if hasattr(td, "total_seconds") else None
        ).dropna()
        avg_green_lap = float(lap_time_secs.median()) if len(lap_time_secs) >= 5 else None

        # Pit laps
        pit_laps = laps[laps["PitInTime"].notna()].copy()

        green_losses, sc_losses, vsc_losses = [], [], []

        for _, pit_lap in pit_laps.iterrows():
            td = pit_lap.get("LapTime")
            if td is None or (hasattr(td, "__class__") and "NaT" in str(type(td))):
                continue
            try:
                pit_time = td.total_seconds()
            except AttributeError:
                continue
            if not avg_green_lap or pit_time <= 0:
                continue

            loss = pit_time - avg_green_lap
            if loss < 5 or loss > 60:   # sanity filter
                continue

            status = str(pit_lap.get("TrackStatus", "1"))
            if "4" in status:
                sc_losses.append(loss)
            elif "6" in status:
                vsc_losses.append(loss)
            else:
                green_losses.append(loss)

        green_median = float(np.median(green_losses)) if len(green_losses) >= 3 else _DEFAULT_PIT_LOSS
        sc_median    = float(np.median(sc_losses))    if len(sc_losses)    >= 2 else green_median - _SC_REDUCTION
        vsc_median   = float(np.median(vsc_losses))   if len(vsc_losses)   >= 2 else green_median - _VSC_REDUCTION

        # SC loss should always be < VSC loss < green loss
        sc_median  = min(sc_median,  green_median - 4.0)
        vsc_median = min(vsc_median, green_median - 2.0)
        sc_median  = max(sc_median,  8.0)
        vsc_median = max(vsc_median, 10.0)

        return {
            "green": {"median": round(green_median, 1), "samples": len(green_losses)},
            "sc":    {"median": round(sc_median,    1), "samples": len(sc_losses)},
            "vsc":   {"median": round(vsc_median,   1), "samples": len(vsc_losses)},
        }

    except Exception as exc:
        logger.warning("compute_pit_losses failed: %s — using defaults", exc)
        return _default_pit_losses()


def _default_pit_losses() -> dict:
    """Return sensible default pit losses when no session data is available."""
    return {
        "green": {"median": _DEFAULT_PIT_LOSS,                        "samples": 0},
        "sc":    {"median": _DEFAULT_PIT_LOSS - _SC_REDUCTION,         "samples": 0},
        "vsc":   {"median": _DEFAULT_PIT_LOSS - _VSC_REDUCTION,        "samples": 0},
    }


def get_pit_losses_for_circuit(circuit_id: str) -> dict:
    """
    Try to load precomputed pit losses for a circuit from cache.
    Falls back to defaults if not available.

    In future this could query a precompute store (R2, SQLite, etc.).
    For now returns circuit-specific defaults based on known street/permanent values.
    """
    # Street circuits have shorter pit lanes — slightly lower loss under all conditions
    street_circuits = {"monaco", "baku", "singapore", "jeddah", "las_vegas", "miami"}
    key = circuit_id.lower().replace(" ", "_")

    if key in street_circuits:
        base = 20.0
    else:
        base = _DEFAULT_PIT_LOSS

    return {
        "green": {"median": base,              "samples": 0},
        "sc":    {"median": base - _SC_REDUCTION,  "samples": 0},
        "vsc":   {"median": base - _VSC_REDUCTION, "samples": 0},
    }
