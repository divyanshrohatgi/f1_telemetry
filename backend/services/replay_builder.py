"""
Builds replay frames from a loaded FastF1 session at 0.5-second intervals.

Each frame captures every driver's position, telemetry, tyre state, pit status,
race gaps, flags, and weather — everything the frontend replay player needs.
"""
import asyncio
import logging
from typing import Optional, List, Dict, Tuple

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

FRAME_INTERVAL = 0.5  # seconds between frames

TEAM_ABBR: Dict[str, str] = {
    'Red Bull Racing': 'RBR', 'McLaren': 'MCL', 'Ferrari': 'FER',
    'Mercedes': 'MER', 'Aston Martin': 'AMR', 'Alpine': 'ALP',
    'Williams': 'WIL', 'Haas F1 Team': 'HAS', 'Kick Sauber': 'SAU',
    'Visa Cash App RB': 'RBU', 'AlphaTauri': 'RBU', 'Alpha Tauri': 'RBU',
    'Alfa Romeo': 'ARF', 'Racing Point': 'RPT', 'Renault': 'REN',
    'Toro Rosso': 'STR', 'Force India': 'FIN', 'Sauber': 'SAU',
}

# Track status code → label
_TRACK_STATUS_MAP: Dict[str, str] = {
    '1': 'green', '2': 'yellow', '4': 'sc', '5': 'red', '6': 'vsc', '7': 'green',
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_float(val, default: float = 0.0) -> float:
    try:
        if pd.isna(val):
            return default
        return float(val)
    except Exception:
        return default


def _safe_int(val, default: int = 0) -> int:
    try:
        if pd.isna(val):
            return default
        return int(val)
    except Exception:
        return default


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


# ---------------------------------------------------------------------------
# Coord normalisation
# ---------------------------------------------------------------------------

def _compute_norm_bounds(driver_tel: Dict[str, pd.DataFrame]) -> Tuple[float, float, float]:
    """Return (x_min, y_min, scale) using fastest-lap telemetry if available."""
    xs, ys = [], []
    for tel in driver_tel.values():
        if 'X' in tel.columns:
            xs.append(tel['X'].dropna())
            ys.append(tel['Y'].dropna())
    if not xs:
        return 0.0, 0.0, 1.0
    all_x = pd.concat(xs)
    all_y = pd.concat(ys)
    x_min = float(all_x.min())
    y_min = float(all_y.min())
    scale = max(float(all_x.max()) - x_min, float(all_y.max()) - y_min, 1.0)
    return x_min, y_min, scale


# ---------------------------------------------------------------------------
# Driver metadata from session.results
# ---------------------------------------------------------------------------

def _build_driver_meta(session) -> Dict[str, dict]:
    """Return dict[abbr] → {color, team_name, team_abbr, grid_position, driver_number}"""
    meta: Dict[str, dict] = {}
    if session.results is None or session.results.empty:
        return meta
    for _, row in session.results.iterrows():
        abbr = str(row.get('Abbreviation', '') or '')
        if not abbr:
            continue
        color = str(row.get('TeamColor', '') or '')
        if not color or color in ('nan', 'None'):
            color = 'FFFFFF'
        if not color.startswith('#'):
            color = f'#{color}'
        team_name = str(row.get('TeamName', '') or '')
        team_ab = TEAM_ABBR.get(team_name, team_name[:3].upper() if team_name else 'UNK')
        grid_pos_raw = row.get('GridPosition', None)
        grid_pos = _safe_int(grid_pos_raw, 0) if grid_pos_raw is not None else 0
        driver_num = str(row.get('DriverNumber', '') or '')
        meta[abbr] = {
            'color': color,
            'team_name': team_name,
            'team_abbr': team_ab,
            'grid_position': grid_pos,
            'driver_number': driver_num,
        }
    return meta


# ---------------------------------------------------------------------------
# Pit intervals: list of (in_sec, out_sec) per driver
# ---------------------------------------------------------------------------

def _build_pit_intervals(laps: pd.DataFrame, drivers: List[str],
                         t_offset: float) -> Dict[str, List[Tuple[float, float]]]:
    """Build pit intervals in session-time seconds for each driver."""
    intervals: Dict[str, List[Tuple[float, float]]] = {d: [] for d in drivers}
    for drv in drivers:
        drv_laps = laps[laps['Driver'] == drv]
        for _, lap in drv_laps.iterrows():
            pit_in = _td_seconds(lap.get('PitInTime'))
            pit_out = _td_seconds(lap.get('PitOutTime'))
            if pit_in is not None:
                # PitInTime is relative to session start in FastF1
                in_sec = pit_in - t_offset
                out_sec = (pit_out - t_offset) if pit_out is not None else in_sec + 30.0
                intervals[drv].append((in_sec, out_sec))
    return intervals


def _in_pit(intervals: List[Tuple[float, float]], session_t: float) -> bool:
    for in_s, out_s in intervals:
        if in_s <= session_t <= out_s:
            return True
    return False


# ---------------------------------------------------------------------------
# Tyre stint tracking per driver
# ---------------------------------------------------------------------------

def _build_tyre_stints(laps: pd.DataFrame, drivers: List[str]) -> Dict[str, list]:
    """
    Return dict[driver] = list of stint dicts sorted by lap:
      { start_lap, compound, tyre_life_start }
    """
    stints: Dict[str, list] = {}
    for drv in drivers:
        drv_laps = laps[laps['Driver'] == drv].sort_values('LapNumber')
        driver_stints = []
        prev_stint = None
        for _, lap in drv_laps.iterrows():
            stint_num = _safe_int(lap.get('Stint'), 0)
            compound = str(lap.get('Compound') or '') if pd.notna(lap.get('Compound')) else None
            lap_num = _safe_int(lap.get('LapNumber'), 0)
            tyre_life = _safe_int(lap.get('TyreLife'), 0)
            if stint_num != prev_stint:
                driver_stints.append({
                    'stint': stint_num,
                    'compound': compound,
                    'start_lap': lap_num,
                    'tyre_life_at_start': tyre_life,
                })
                prev_stint = stint_num
        stints[drv] = driver_stints
    return stints


# ---------------------------------------------------------------------------
# Track status timeline
# ---------------------------------------------------------------------------

def _build_track_status_timeline(session) -> List[Tuple[float, str]]:
    """Return list of (session_time_sec, status_label) sorted by time."""
    timeline: List[Tuple[float, str]] = []
    try:
        ts_df = session.track_status
        if ts_df is None or ts_df.empty:
            return timeline
        for _, row in ts_df.iterrows():
            t = _td_seconds(row.get('Time'))
            code = str(row.get('Status', '1'))
            label = _TRACK_STATUS_MAP.get(code, 'green')
            if t is not None:
                timeline.append((t, label))
        timeline.sort(key=lambda x: x[0])
    except Exception as exc:
        logger.debug('track_status unavailable: %s', exc)
    return timeline


def _get_track_status(timeline: List[Tuple[float, str]], t: float) -> str:
    status = 'green'
    for ts, label in timeline:
        if ts <= t:
            status = label
        else:
            break
    return status


# ---------------------------------------------------------------------------
# Weather timeline
# ---------------------------------------------------------------------------

def _build_weather_timeline(session) -> List[dict]:
    """Return list of weather dicts sorted by session time."""
    rows = []
    try:
        wd = session.weather_data
        if wd is None or wd.empty:
            return rows
        for _, row in wd.iterrows():
            t = _td_seconds(row.get('Time'))
            if t is None:
                continue
            rows.append({
                '_t': t,
                'air_temp': _safe_float(row.get('AirTemp')),
                'track_temp': _safe_float(row.get('TrackTemp')),
                'humidity': _safe_float(row.get('Humidity')),
                'rainfall': bool(row.get('Rainfall', False)),
                'wind_speed': _safe_float(row.get('WindSpeed')),
                'wind_direction': _safe_float(row.get('WindDirection')),
            })
        rows.sort(key=lambda r: r['_t'])
    except Exception as exc:
        logger.debug('weather_data unavailable: %s', exc)
    return rows


def _get_weather(rows: List[dict], t: float) -> dict:
    default = {
        'air_temp': None, 'track_temp': None, 'humidity': None,
        'rainfall': False, 'wind_speed': None, 'wind_direction': None,
    }
    if not rows:
        return default
    result = rows[0]
    for r in rows:
        if r['_t'] <= t:
            result = r
        else:
            break
    return {k: v for k, v in result.items() if k != '_t'}


# ---------------------------------------------------------------------------
# Race control messages → per-driver flags
# ---------------------------------------------------------------------------

def _build_race_control_flags(session,
                               driver_num_to_abbr: Dict[str, str]) -> List[dict]:
    """
    Return sorted list of {t, driver (abbr or None), action} where action is
    'investigation', 'penalty', or 'clear'.
    """
    events: List[dict] = []
    try:
        rcm = session.race_control_messages
        if rcm is None or rcm.empty:
            return events
        for _, row in rcm.iterrows():
            t = _td_seconds(row.get('Time'))
            if t is None:
                continue
            msg = str(row.get('Message', '') or '').lower()
            raw_num = str(row.get('RacingNumber', '') or '')
            abbr = driver_num_to_abbr.get(raw_num)

            if 'under investigation' in msg:
                action = 'investigation'
            elif 'time penalty' in msg or 'drive through' in msg or 'stop and go' in msg:
                action = 'penalty'
            elif 'no further action' in msg or 'deleted' in msg:
                action = 'clear'
            else:
                continue

            events.append({'t': t, 'driver': abbr, 'action': action})
        events.sort(key=lambda e: e['t'])
    except Exception as exc:
        logger.debug('race_control_messages unavailable: %s', exc)
    return events


def _compute_driver_flags_at_t(events: List[dict], abbr: str, t: float) -> Optional[str]:
    """Walk events up to time t and return the driver's current flag."""
    flag: Optional[str] = None
    for ev in events:
        if ev['t'] > t:
            break
        if ev['driver'] is None or ev['driver'] == abbr:
            if ev['action'] == 'clear':
                flag = None
            else:
                flag = ev['action']
    return flag


# ---------------------------------------------------------------------------
# Retired drivers detection
# ---------------------------------------------------------------------------

def _build_retired_set(session, laps: pd.DataFrame) -> set:
    """Drivers with Status 'Retired' or 'Disqualified' in session.results."""
    retired: set = set()
    try:
        if session.results is not None and not session.results.empty:
            for _, row in session.results.iterrows():
                status = str(row.get('Status', '') or '')
                if 'retired' in status.lower() or 'disqualified' in status.lower() or 'excluded' in status.lower():
                    abbr = str(row.get('Abbreviation', '') or '')
                    if abbr:
                        retired.add(abbr)
    except Exception:
        pass
    return retired


# ---------------------------------------------------------------------------
# Leader's fastest lap detection
# ---------------------------------------------------------------------------

def _find_fastest_lap_driver(laps: pd.DataFrame) -> Optional[str]:
    """Return abbreviation of driver with fastest lap."""
    try:
        fl_col = 'IsPersonalBest' if 'IsPersonalBest' in laps.columns else None
        best_times = laps[laps['LapTime'].notna()].copy()
        if best_times.empty:
            return None
        best_times['_lt_s'] = best_times['LapTime'].apply(_td_seconds)
        best_times = best_times.dropna(subset=['_lt_s'])
        if best_times.empty:
            return None
        idx = best_times['_lt_s'].idxmin()
        return str(best_times.loc[idx, 'Driver'])
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Lap-level timeline per driver: compound, position, tyre_life, lap_start_t
# ---------------------------------------------------------------------------

def _build_lap_timeline(laps: pd.DataFrame,
                        drivers: List[str]) -> Dict[str, List[dict]]:
    """
    Per driver: sorted list of lap dicts with session-time anchor.
    """
    timeline: Dict[str, List[dict]] = {}
    for drv in drivers:
        drv_laps = laps[laps['Driver'] == drv].sort_values('LapNumber')
        entries = []
        for _, lap in drv_laps.iterrows():
            lst = _td_seconds(lap.get('LapStartTime'))
            if lst is None:
                continue
            entries.append({
                't': lst,
                'lap_number': _safe_int(lap.get('LapNumber'), 0),
                'compound': str(lap.get('Compound') or '') if pd.notna(lap.get('Compound')) else None,
                'position': _safe_int(lap.get('Position'), 0) or None,
                'tyre_life': _safe_int(lap.get('TyreLife'), 0),
                'stint': _safe_int(lap.get('Stint'), 0),
                'lap_start_distance': 0.0,  # distance at start of lap is 0
            })
        timeline[drv] = entries
    return timeline


def _lookup_lap_state(timeline: List[dict], t: float) -> dict:
    """Return the most recent lap entry at or before time t."""
    result: dict = {}
    for entry in timeline:
        if entry['t'] <= t:
            result = entry
        else:
            break
    return result


# ---------------------------------------------------------------------------
# Gap computation
# ---------------------------------------------------------------------------

_TYPICAL_SPEED_MS = 50.0  # ~180 km/h as m/s approximation


def _compute_gap(leader_t: float, driver_t: float, lap_state: dict,
                 tel_row: Optional[pd.Series]) -> Optional[float]:
    """
    Approximate gap in seconds between leader and driver.
    session_time ≈ LapStartTime + distance / typical_speed
    """
    dist = 0.0
    if tel_row is not None:
        dist = _safe_float(tel_row.get('Distance', 0.0))

    drv_session_t = lap_state.get('t', 0.0) + dist / _TYPICAL_SPEED_MS
    gap = leader_t - drv_session_t
    return round(max(gap, 0.0), 2)


# ---------------------------------------------------------------------------
# Main builder
# ---------------------------------------------------------------------------

def build_replay_frames(session) -> List[dict]:  # noqa: C901
    laps = session.laps
    if laps is None or len(laps) == 0:
        logger.warning('No laps data in session')
        return []

    is_race = str(getattr(session, 'name', '') or '').upper() in ('R', 'RACE', 'SPRINT')
    # Also check session.event if available
    try:
        event_name = str(session.session_info.get('Name', '') if hasattr(session, 'session_info') else '')
        if 'race' in event_name.lower():
            is_race = True
    except Exception:
        pass

    total_laps = int(laps['LapNumber'].max())
    drivers_list: List[str] = sorted(laps['Driver'].unique().tolist())

    # ── Telemetry ─────────────────────────────────────────────────────────
    driver_tel: Dict[str, pd.DataFrame] = {}
    for drv in drivers_list:
        try:
            tel = laps[laps['Driver'] == drv].get_telemetry()
            if tel is not None and len(tel) > 0 and 'X' in tel.columns and 'Date' in tel.columns:
                tel = tel.sort_values('Date').reset_index(drop=True)
                driver_tel[drv] = tel
        except Exception as exc:
            logger.debug('No telemetry for %s: %s', drv, exc)

    if not driver_tel:
        logger.error('No telemetry found for any driver')
        return []

    # ── Time reference ────────────────────────────────────────────────────
    # Compute t_offset: maps SessionTime to "elapsed since first telemetry"
    # t_offset = first_row.SessionTime.total_seconds() - (first_row.Date - min_date).total_seconds()
    all_dates = pd.concat([t['Date'] for t in driver_tel.values()])
    min_date = all_dates.min()

    sample_offsets: List[float] = []
    for tel in driver_tel.values():
        if 'SessionTime' in tel.columns:
            row0 = tel.iloc[0]
            st = _td_seconds(row0.get('SessionTime'))
            date_elapsed = (row0['Date'] - min_date).total_seconds()
            if st is not None:
                sample_offsets.append(st - date_elapsed)
                break
    t_offset = sample_offsets[0] if sample_offsets else 0.0

    # Pre-compute elapsed time (relative to min_date) for fast lookup
    for tel in driver_tel.values():
        tel['_t'] = (tel['Date'] - min_date).dt.total_seconds()

    max_t = float(max(t['_t'].max() for t in driver_tel.values()))

    # ── Coord normalisation ───────────────────────────────────────────────
    x_min, y_min, scale = _compute_norm_bounds(driver_tel)

    # ── Driver metadata ───────────────────────────────────────────────────
    driver_meta = _build_driver_meta(session)

    # ── Pit intervals ─────────────────────────────────────────────────────
    pit_intervals = _build_pit_intervals(laps, drivers_list, t_offset)

    # ── Tyre stints ───────────────────────────────────────────────────────
    tyre_stints = _build_tyre_stints(laps, drivers_list)

    # ── Lap timeline ──────────────────────────────────────────────────────
    lap_timelines = _build_lap_timeline(laps, drivers_list)

    # ── Track status ──────────────────────────────────────────────────────
    track_status_tl = _build_track_status_timeline(session)

    # ── Weather ───────────────────────────────────────────────────────────
    weather_tl = _build_weather_timeline(session)

    # ── Race control flags ────────────────────────────────────────────────
    num_to_abbr: Dict[str, str] = {}
    if session.results is not None and not session.results.empty:
        for _, row in session.results.iterrows():
            num = str(row.get('DriverNumber', '') or '')
            abbr = str(row.get('Abbreviation', '') or '')
            if num and abbr:
                num_to_abbr[num] = abbr

    rc_events = _build_race_control_flags(session, num_to_abbr)

    # ── Retired drivers ───────────────────────────────────────────────────
    retired_set = _build_retired_set(session, laps)

    # ── Fastest lap driver ────────────────────────────────────────────────
    fastest_lap_drv = _find_fastest_lap_driver(laps)

    # ── Per-driver pit stop count ─────────────────────────────────────────
    pit_stop_counts: Dict[str, int] = {}
    for drv in drivers_list:
        drv_laps = laps[laps['Driver'] == drv]
        pit_stop_counts[drv] = int(drv_laps['PitInTime'].notna().sum())

    # ── Build nearest-telemetry lookup arrays ─────────────────────────────
    # Pre-convert _t to numpy for fast searchsorted lookups
    tel_t_arrays: Dict[str, np.ndarray] = {}
    for drv, tel in driver_tel.items():
        tel_t_arrays[drv] = tel['_t'].values

    # ── Frame construction ────────────────────────────────────────────────
    num_frames = int(max_t / FRAME_INTERVAL) + 1
    frames: List[dict] = []

    logger.info('Building %d replay frames for %d drivers (%.1fs @ %.2fs intervals)…',
                num_frames, len(driver_tel), max_t, FRAME_INTERVAL)

    # Session-time value of the last known position for leader gap computation
    # Maps driver → latest session_time_sec seen in telemetry
    for frame_i in range(num_frames):
        t_sec = round(frame_i * FRAME_INTERVAL, 3)  # elapsed since min_date

        track_status = _get_track_status(track_status_tl, t_sec + t_offset)
        weather = _get_weather(weather_tl, t_sec + t_offset)

        frame_drivers: List[dict] = []
        leader_lap_t: Optional[float] = None  # lap start time of P1 driver

        # First pass: collect per-driver state
        driver_states: List[dict] = []

        for drv in driver_tel:
            t_arr = tel_t_arrays[drv]
            idx = int(np.searchsorted(t_arr, t_sec, side='right')) - 1
            if idx < 0:
                idx = 0
            if idx >= len(t_arr):
                idx = len(t_arr) - 1

            # Skip if too far from target time
            if abs(float(t_arr[idx]) - t_sec) > 10.0:
                continue

            tel = driver_tel[drv]
            row = tel.iloc[idx]

            x_norm = round((_safe_float(row.get('X')) - x_min) / scale, 4)
            y_norm = round((_safe_float(row.get('Y')) - y_min) / scale, 4)

            # Lap state
            lap_tl = lap_timelines.get(drv, [])
            lap_state = _lookup_lap_state(lap_tl, t_sec + t_offset)

            compound = lap_state.get('compound')
            position = lap_state.get('position')
            lap_number = lap_state.get('lap_number', 0)
            tyre_life = lap_state.get('tyre_life', 0)
            stint_num = lap_state.get('stint', 0)

            # Tyre history: compound letters of all completed stints before current
            tyre_history: List[str] = []
            for stint in tyre_stints.get(drv, []):
                if stint['stint'] < stint_num and stint['compound']:
                    tyre_history.append(stint['compound'][0] if len(stint['compound']) > 0 else '?')

            # Pit state
            session_t_drv = t_sec + t_offset
            drv_in_pit = _in_pit(pit_intervals.get(drv, []), session_t_drv)

            # Retired
            drv_retired = drv in retired_set and lap_number >= total_laps * 0.8

            # Flag
            driver_flag = _compute_driver_flags_at_t(rc_events, drv, session_t_drv)

            # Speed / throttle / brake / gear / rpm / drs
            speed = round(_safe_float(row.get('Speed')), 1)
            throttle = round(_safe_float(row.get('Throttle')), 1)
            brake_raw = row.get('Brake', 0)
            brake = bool(brake_raw) if not pd.isna(brake_raw) else False
            gear = _safe_int(row.get('nGear'))
            rpm = _safe_int(row.get('RPM'))
            drs_raw = row.get('DRS', 0)
            drs = 1 if (pd.notna(drs_raw) and int(drs_raw) > 9) else 0

            meta = driver_meta.get(drv, {})

            # Track leader for gap computation
            if position == 1:
                leader_lap_t = lap_state.get('t')

            driver_states.append({
                'abbr': drv,
                'x': x_norm,
                'y': y_norm,
                'color': meta.get('color', '#FFFFFF'),
                'team_abbr': meta.get('team_abbr', 'UNK'),
                'position': position,
                'compound': compound,
                'tyre_life': tyre_life,
                'tyre_history': tyre_history,
                'pit_stops': pit_stop_counts.get(drv, 0),
                'in_pit': drv_in_pit,
                'has_fastest_lap': drv == fastest_lap_drv,
                'retired': drv_retired,
                'flag': driver_flag,
                'speed': speed,
                'throttle': throttle,
                'brake': brake,
                'gear': gear,
                'rpm': rpm,
                'drs': drs,
                'grid_position': meta.get('grid_position', 0),
                # Internal fields for gap computation, stripped later
                '_lap_state': lap_state,
                '_row': row,
                '_session_t': session_t_drv,
            })

        # Second pass: compute gaps now that we know the leader
        for ds in driver_states:
            pos = ds['position']
            lap_state = ds.pop('_lap_state')
            row = ds.pop('_row')
            ds.pop('_session_t')

            if pos == 1 or leader_lap_t is None:
                ds['gap'] = None
            elif ds['retired']:
                ds['gap'] = 'OUT'
            elif ds['in_pit']:
                ds['gap'] = 'PIT'
            else:
                dist = _safe_float(row.get('Distance', 0.0))
                drv_session_t = lap_state.get('t', 0.0) + dist / _TYPICAL_SPEED_MS
                leader_session_t = leader_lap_t  # leader's lap start time is their session ref
                gap = round(max(leader_session_t - drv_session_t + (t_sec + t_offset - leader_session_t), 0.0), 2)
                ds['gap'] = gap

            frame_drivers.append(ds)

        # Sort by position (None last)
        frame_drivers.sort(key=lambda d: (d['position'] is None, d['position'] or 9999))

        # Leader's current lap
        leader_lap = 0
        for fd in frame_drivers:
            if fd['position'] == 1:
                state = _lookup_lap_state(lap_timelines.get(fd['abbr'], []), t_sec + t_offset)
                leader_lap = state.get('lap_number', 0)
                break

        frames.append({
            'timestamp': round(t_sec, 2),
            'lap': leader_lap,
            'total_laps': total_laps,
            'is_race': is_race,
            'status': track_status,
            'weather': weather,
            'drivers': frame_drivers,
        })

    logger.info('Done — %d frames built.', len(frames))
    return frames


async def build_replay_frames_async(session) -> List[dict]:
    return await asyncio.to_thread(build_replay_frames, session)


def build_circuit_outline(session, n_points: int = 300) -> Tuple[List[dict], float]:
    """
    Build a normalised circuit outline (track map) from session position data.
    Returns (points, rotation_deg) where points = [{"x": float, "y": float}].
    Uses the same normalisation as build_replay_frames so coordinates align.
    """
    try:
        # Try to get rotation from FastF1 circuit info
        rotation_deg = 0.0
        try:
            ci = session.get_circuit_info()
            rotation_deg = float(getattr(ci, 'rotation', 0.0))
        except Exception:
            pass

        # Collect X/Y from all drivers' fastest laps, preferring the race leader
        xs, ys = [], []
        try:
            laps = session.laps
            if laps is not None and not laps.empty:
                for drv_code in laps['Driver'].dropna().unique():
                    drv_laps = laps.pick_drivers(drv_code)
                    if drv_laps.empty:
                        continue
                    fastest = drv_laps.pick_fastest()
                    if fastest is None:
                        continue
                    try:
                        tel = fastest.get_telemetry()
                        if tel is not None and not tel.empty and 'X' in tel.columns and 'Y' in tel.columns:
                            x_v = pd.to_numeric(tel['X'], errors='coerce').dropna().to_numpy(dtype=np.float64)
                            y_v = pd.to_numeric(tel['Y'], errors='coerce').dropna().to_numpy(dtype=np.float64)
                            if x_v.size > 50 and (x_v.max() - x_v.min()) > 10:
                                xs.append(x_v)
                                ys.append(y_v)
                                break  # one driver's fastest lap is enough for the outline
                    except Exception:
                        continue
        except Exception:
            pass

        if not xs:
            return [], rotation_deg

        x = xs[0]
        y = ys[0]
        x_min_v = float(x.min())
        y_min_v = float(y.min())
        max_range = max(float(x.max()) - x_min_v, float(y.max()) - y_min_v, 1.0)

        step = max(1, len(x) // n_points)
        points = [
            {'x': round((float(x[i]) - x_min_v) / max_range, 4),
             'y': round((float(y[i]) - y_min_v) / max_range, 4)}
            for i in range(0, len(x), step)
        ]
        return points, rotation_deg

    except Exception as exc:
        logger.warning('build_circuit_outline failed: %s', exc)
        return [], 0.0


async def build_circuit_outline_async(session) -> Tuple[List[dict], float]:
    return await asyncio.to_thread(build_circuit_outline, session)


def extract_rc_messages(session) -> List[dict]:
    """Extract race control messages with session timestamps (seconds from session start)."""
    try:
        rc = session.race_control_messages
        if rc is None or rc.empty:
            return []
        msgs = []
        for _, row in rc.iterrows():
            t = row.get('Time')
            if t is None:
                continue
            try:
                if pd.isna(t):
                    continue
            except Exception:
                pass
            try:
                t_sec = float(t.total_seconds())
            except Exception:
                continue
            racing_number = row.get('RacingNumber')
            try:
                rn = str(int(racing_number)) if pd.notna(racing_number) else None
            except Exception:
                rn = None
            msgs.append({
                't': round(t_sec, 2),
                'message': str(row.get('Message', '')),
                'category': str(row.get('Category', 'Other')),
                'racing_number': rn,
            })
        return msgs
    except Exception as exc:
        logger.debug('RC messages extraction failed: %s', exc)
        return []


async def extract_rc_messages_async(session) -> List[dict]:
    return await asyncio.to_thread(extract_rc_messages, session)
