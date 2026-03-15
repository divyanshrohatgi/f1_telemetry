"""
Standalone script to compute pit loss times per track condition from a FastF1 session.

Usage as script:
    python compute_pit_loss.py <year> <gp> <session_type>
    e.g.: python compute_pit_loss.py 2024 "Monza" R

Importable as a function:
    from compute_pit_loss import compute_pit_loss
    result = compute_pit_loss(session)
    # → {"green": 22.3, "sc": 10.1, "vsc": 14.2}
"""
import logging
import sys
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# Fallback values when not enough data
_DEFAULT_GREEN = 22.0
_DEFAULT_SC = 10.0
_DEFAULT_VSC = 14.0


def _td_seconds(td) -> Optional[float]:
    if td is None:
        return None
    try:
        if pd.isna(td):
            return None
    except Exception:
        pass
    try:
        return float(td.total_seconds())
    except Exception:
        return None


def compute_pit_loss(session) -> dict:
    """
    Compute pit stop time loss for green-flag, SC, and VSC conditions.

    Algorithm:
    1. Find all pit-stop laps (PitInTime notna).
    2. For each driver compute their median clean lap time (no pit in/out, green flag).
    3. Pit loss = pit_in_lap_time + pit_out_lap_time - 2 × median_clean_lap.
    4. Filter outliers (< 10s or > 40s).
    5. Split by track status during the pit lap (SC/VSC/green).
    6. Return medians, falling back to defaults when insufficient samples.

    Returns:
        {
            "green": float,   # seconds lost under green flag pit stop
            "sc":    float,   # seconds lost under safety car
            "vsc":   float,   # seconds lost under virtual safety car
        }
    """
    try:
        laps = session.laps.copy()
    except Exception as exc:
        logger.warning('compute_pit_loss: cannot access session.laps: %s', exc)
        return _defaults()

    try:
        return _compute(laps)
    except Exception as exc:
        logger.warning('compute_pit_loss failed: %s — returning defaults', exc, exc_info=True)
        return _defaults()


def _compute(laps: pd.DataFrame) -> dict:
    # ── Per-driver median clean lap time ──────────────────────────────────
    driver_median_lap: dict = {}

    for drv, drv_laps in laps.groupby('Driver'):
        clean = drv_laps[
            drv_laps['PitInTime'].isna() &
            drv_laps['PitOutTime'].isna()
        ]
        # Prefer green-flag laps only for the baseline
        track_status_col = 'TrackStatus' if 'TrackStatus' in clean.columns else None
        if track_status_col:
            green_clean = clean[clean[track_status_col].astype(str).str.strip() == '1']
            if len(green_clean) >= 3:
                clean = green_clean

        lap_times_s = clean['LapTime'].dropna().apply(_td_seconds).dropna()
        if len(lap_times_s) >= 3:
            driver_median_lap[str(drv)] = float(np.median(lap_times_s.values))

    # ── Pit stop laps ─────────────────────────────────────────────────────
    pit_in_laps = laps[laps['PitInTime'].notna()].copy()
    if pit_in_laps.empty:
        logger.debug('compute_pit_loss: no pit-in laps found')
        return _defaults()

    green_losses: list = []
    sc_losses: list = []
    vsc_losses: list = []

    for _, pit_lap in pit_in_laps.iterrows():
        drv = str(pit_lap.get('Driver', ''))
        median_lap = driver_median_lap.get(drv)
        if median_lap is None:
            continue

        pit_in_lap_time = _td_seconds(pit_lap.get('LapTime'))
        if pit_in_lap_time is None:
            continue

        # Find the pit-out lap (next lap for this driver)
        drv_laps = laps[laps['Driver'] == drv].sort_values('LapNumber')
        pit_lap_num = pit_lap.get('LapNumber', -1)
        out_lap_rows = drv_laps[drv_laps['LapNumber'] == pit_lap_num + 1]

        if out_lap_rows.empty:
            continue

        out_lap_row = out_lap_rows.iloc[0]
        pit_out_lap_time = _td_seconds(out_lap_row.get('LapTime'))
        if pit_out_lap_time is None:
            continue

        # Time lost = (pit_in + pit_out) - 2 × median clean lap
        loss = (pit_in_lap_time + pit_out_lap_time) - 2.0 * median_lap

        # Filter outliers
        if loss < 10.0 or loss > 40.0:
            continue

        # Classify by track status during the pit-in lap
        status_raw = str(pit_lap.get('TrackStatus', '1') or '1').strip()
        if '4' in status_raw:
            sc_losses.append(loss)
        elif '6' in status_raw:
            vsc_losses.append(loss)
        else:
            green_losses.append(loss)

    green = float(np.median(green_losses)) if len(green_losses) >= 3 else _DEFAULT_GREEN
    sc = float(np.median(sc_losses)) if len(sc_losses) >= 2 else _DEFAULT_SC
    vsc = float(np.median(vsc_losses)) if len(vsc_losses) >= 2 else _DEFAULT_VSC

    # Sanity: SC < VSC < green (pit stops under SC cost less)
    sc = max(min(sc, green - 4.0), 5.0)
    vsc = max(min(vsc, green - 2.0), 8.0)

    result = {
        'green': round(green, 1),
        'sc': round(sc, 1),
        'vsc': round(vsc, 1),
    }
    logger.info(
        'Pit loss computed — green=%.1fs (%d samples), sc=%.1fs (%d), vsc=%.1fs (%d)',
        result['green'], len(green_losses),
        result['sc'], len(sc_losses),
        result['vsc'], len(vsc_losses),
    )
    return result


def _defaults() -> dict:
    return {'green': _DEFAULT_GREEN, 'sc': _DEFAULT_SC, 'vsc': _DEFAULT_VSC}


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    import sys
    import os

    logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')

    if len(sys.argv) < 4:
        print('Usage: python compute_pit_loss.py <year> <gp> <session_type>')
        print('  e.g: python compute_pit_loss.py 2024 "Monza" R')
        sys.exit(1)

    year_arg = int(sys.argv[1])
    gp_arg = sys.argv[2]
    session_type_arg = sys.argv[3]

    # Add backend to path so imports work when run directly
    sys.path.insert(0, os.path.dirname(__file__))

    from services.fastf1_loader import load_session  # noqa: E402

    print(f'Loading session {year_arg} {gp_arg} {session_type_arg}…')
    sess = load_session(year_arg, gp_arg, session_type_arg, load_laps=True)

    losses = compute_pit_loss(sess)
    print(f'Pit loss results:')
    for condition, secs in losses.items():
        print(f'  {condition:6s}: {secs:.1f}s')
