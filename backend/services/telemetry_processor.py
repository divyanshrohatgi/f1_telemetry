"""
Telemetry data processing: downsampling, channel extraction, lap alignment.

FastF1 returns ~4000+ telemetry points per lap. We downsample to ~500–1000
using the LTTB (Largest Triangle Three Buckets) algorithm to preserve shape
fidelity while dramatically reducing payload size.
"""

import logging
from typing import Optional
import numpy as np
import pandas as pd
import fastf1

logger = logging.getLogger(__name__)

TARGET_POINTS = 750  # default downsampled points per lap


def get_lap_telemetry(
    session: fastf1.core.Session,
    driver_code: str,
    lap_number: int,
    n_points: int = TARGET_POINTS,
    include_circuit: bool = True,
) -> dict:
    """
    Extract and downsample telemetry for a specific lap.

    Returns a dict with:
      - points: list of telemetry point dicts
      - lap_distance: total lap distance in metres
      - lap_time: lap time in seconds or None
    """
    try:
        driver_laps = session.laps.pick_drivers(driver_code)
        lap = driver_laps[driver_laps["LapNumber"] == lap_number]

        if lap.empty:
            logger.warning("Lap %d not found for driver %s", lap_number, driver_code)
            return {"points": [], "lap_distance": 0.0, "lap_time": None}

        lap_row = lap.iloc[0]
        tel = lap_row.get_telemetry()

        if tel is None or tel.empty:
            logger.warning("No telemetry for lap %d, driver %s", lap_number, driver_code)
            return {"points": [], "lap_distance": 0.0, "lap_time": None}

        # Lap time from the lap row
        lap_time_td = lap_row.get("LapTime")
        lap_time = lap_time_td.total_seconds() if pd.notna(lap_time_td) else None

        # Total lap distance
        lap_distance = float(tel["Distance"].max()) if "Distance" in tel.columns else 0.0

        # Downsample using LTTB or stride fallback
        tel_downsampled = _downsample_telemetry(tel, n_points)

        # Convert to list of point dicts
        points = _telemetry_to_points(tel_downsampled)

        circuit_points: list = []
        circuit_rotation: float = 0.0
        if include_circuit:
            circuit_points, circuit_rotation = _build_single_driver_circuit(
                tel, session=session, driver_code=driver_code
            )

        return {
            "points": points,
            "lap_distance": lap_distance,
            "lap_time": lap_time,
            "circuit_points": circuit_points,
            "circuit_rotation": circuit_rotation,
        }

    except Exception as exc:
        logger.error(
            "Error getting telemetry for driver %s lap %d: %s",
            driver_code, lap_number, exc
        )
        return {"points": [], "lap_distance": 0.0, "lap_time": None, "circuit_points": [], "circuit_rotation": 0.0}


def get_fastest_lap_telemetry(
    session: fastf1.core.Session,
    driver_code: str,
    n_points: int = TARGET_POINTS,
) -> dict:
    """Get telemetry for a driver's fastest lap in the session."""
    try:
        driver_laps = session.laps.pick_drivers(driver_code)
        fastest = driver_laps.pick_fastest()

        if fastest is None or fastest.empty:
            return {"points": [], "lap_distance": 0.0, "lap_time": None, "lap_number": None}

        lap_number = int(fastest["LapNumber"])
        result = get_lap_telemetry(session, driver_code, lap_number, n_points)
        result["lap_number"] = lap_number
        return result

    except Exception as exc:
        logger.error("Error getting fastest lap telemetry for %s: %s", driver_code, exc)
        return {"points": [], "lap_distance": 0.0, "lap_time": None, "lap_number": None}


def get_comparison_telemetry(
    session: fastf1.core.Session,
    driver1: str,
    driver2: str,
    n_points: int = TARGET_POINTS,
    lap1_number: "Optional[int]" = None,
    lap2_number: "Optional[int]" = None,
) -> dict:
    """
    Full multi-channel comparison for two drivers.

    By default compares fastest laps. If lap1_number / lap2_number are given,
    compares those specific laps instead.

    Returns aligned telemetry for Speed, Throttle, Brake, Gear, RPM + cumulative delta,
    circuit position data for the track map, sector times, and mini-sector breakdown.
    """
    # Fetch raw laps — specific or fastest
    lap1_raw = _get_lap_raw(session, driver1, lap1_number) if lap1_number else _get_fastest_lap_raw(session, driver1)
    lap2_raw = _get_lap_raw(session, driver2, lap2_number) if lap2_number else _get_fastest_lap_raw(session, driver2)

    empty = {
        "points": [], "lap_distance": 0.0, "mini_sectors": [],
        "circuit_points": [], "sector_distances": [],
        "driver1_lap_time": None, "driver2_lap_time": None,
        "driver1_sector_times": [None, None, None],
        "driver2_sector_times": [None, None, None],
    }

    if lap1_raw is None or lap2_raw is None:
        return empty

    tel1, lap_row1 = lap1_raw
    tel2, lap_row2 = lap2_raw

    if tel1 is None or tel1.empty or tel2 is None or tel2.empty:
        return empty

    import pandas as pd
    from services.fastf1_loader import timedelta_to_seconds

    def _get_fallback_lap_time(lap_row):
        lt = lap_row.get("LapTime")
        if pd.isnull(lt):
            t1 = lap_row.get("LapStartTime")
            t2 = lap_row.get("Time")
            if not pd.isnull(t1) and not pd.isnull(t2):
                lt = t2 - t1
        return timedelta_to_seconds(lt)

    d1_lap_time = _get_fallback_lap_time(lap_row1)
    d2_lap_time = _get_fallback_lap_time(lap_row2)

    def _sector_times_healed(lap_row, lap_time_sec):
        s1 = timedelta_to_seconds(lap_row.get("Sector1Time"))
        s2 = timedelta_to_seconds(lap_row.get("Sector2Time"))
        s3 = timedelta_to_seconds(lap_row.get("Sector3Time"))

        # Reconstruct missing sectors if LapTime is available
        if lap_time_sec is not None:
            if s1 is None and s2 is not None and s3 is not None:
                s1 = lap_time_sec - (s2 + s3)
            elif s2 is None and s1 is not None and s3 is not None:
                s2 = lap_time_sec - (s1 + s3)
            elif s3 is None and s1 is not None and s2 is not None:
                s3 = lap_time_sec - (s1 + s2)
            
        # Ensure we don't return negative times from bad timing data
        return [
            s1 if (s1 and s1 > 0) else None,
            s2 if (s2 and s2 > 0) else None,
            s3 if (s3 and s3 > 0) else None,
        ]

    d1_sectors = _sector_times_healed(lap_row1, d1_lap_time)
    d2_sectors = _sector_times_healed(lap_row2, d2_lap_time)

    # Healing telemetry distance gaps 
    if "Distance" not in tel1.columns or tel1["Distance"].isnull().any():
        tel1 = lap1_raw[0].add_distance()
    if "Distance" not in tel2.columns or tel2["Distance"].isnull().any():
        tel2 = lap2_raw[0].add_distance()

    # Build distance arrays
    dist1 = tel1["Distance"].to_numpy(dtype=np.float64)
    dist2 = tel2["Distance"].to_numpy(dtype=np.float64)
    max_dist = float(min(dist1[-1], dist2[-1]))

    common_dist = np.linspace(0, max_dist, n_points)

    def interp_channel(tel: pd.DataFrame, col: str, fill: float = 0.0) -> np.ndarray:
        dist = tel["Distance"].to_numpy(dtype=np.float64)
        if col not in tel.columns:
            return np.full(n_points, fill)
        vals = pd.to_numeric(tel[col], errors="coerce").fillna(fill).to_numpy(dtype=np.float64)
        return np.interp(common_dist, dist, vals)

    spd1 = interp_channel(tel1, "Speed")
    spd2 = interp_channel(tel2, "Speed")
    thr1 = interp_channel(tel1, "Throttle")
    thr2 = interp_channel(tel2, "Throttle")
    brk1 = interp_channel(tel1, "Brake").astype(float)
    brk2 = interp_channel(tel2, "Brake").astype(float)
    gear1 = interp_channel(tel1, "nGear")
    gear2 = interp_channel(tel2, "nGear")
    rpm1 = interp_channel(tel1, "RPM")
    rpm2 = interp_channel(tel2, "RPM")

    # Cumulative delta (positive = d1 is ahead/faster)
    eps = 1e-6
    v1_ms = spd1 / 3.6 + eps
    v2_ms = spd2 / 3.6 + eps
    dx = np.diff(common_dist, prepend=0)
    delta = np.cumsum((1.0 / v2_ms - 1.0 / v1_ms) * dx)

    # Sector boundary distances (from session lap data, approximated from time)
    sector_distances = _estimate_sector_distances(d1_sectors, d1_lap_time, max_dist)

    # Build combined points list
    points = []
    for i in range(len(common_dist)):
        points.append({
            "distance": float(common_dist[i]),
            "speed_d1": float(spd1[i]),
            "speed_d2": float(spd2[i]),
            "throttle_d1": float(thr1[i]),
            "throttle_d2": float(thr2[i]),
            "brake_d1": float(brk1[i]),
            "brake_d2": float(brk2[i]),
            "gear_d1": float(gear1[i]),
            "gear_d2": float(gear2[i]),
            "rpm_d1": float(rpm1[i]),
            "rpm_d2": float(rpm2[i]),
            "delta": float(delta[i]),
        })

    # Mini sectors (25 segments)
    mini_sectors = _compute_mini_sectors(common_dist, spd1, spd2, driver1, driver2, n=25)

    # Circuit map from position data (with session fallback)
    circuit_points, circuit_angle = _build_circuit_map(tel1, common_dist, delta, driver1, driver2, session=session)

    return {
        "points": points,
        "lap_distance": max_dist,
        "mini_sectors": mini_sectors,
        "circuit_points": circuit_points,
        "circuit_rotation": circuit_angle,
        "sector_distances": sector_distances,
        "driver1_lap_time": d1_lap_time,
        "driver2_lap_time": d2_lap_time,
        "driver1_sector_times": d1_sectors,
        "driver2_sector_times": d2_sectors,
    }


def _get_fastest_lap_raw(
    session: fastf1.core.Session,
    driver_code: str,
) -> "Optional[tuple[pd.DataFrame, pd.Series]]":
    """Return (telemetry_df, lap_row) for the driver's fastest lap, or None on failure."""
    try:
        driver_laps = session.laps.pick_drivers(driver_code)
        fastest = driver_laps.pick_fastest()
        if fastest is None or (hasattr(fastest, "empty") and fastest.empty):
            return None
        tel = fastest.get_telemetry()
        if tel is None or tel.empty:
            return None
        return tel, fastest
    except Exception as exc:
        logger.error("Failed getting raw fastest lap for %s: %s", driver_code, exc)
        return None


def _get_lap_raw(
    session: fastf1.core.Session,
    driver_code: str,
    lap_number: int,
) -> "Optional[tuple[pd.DataFrame, pd.Series]]":
    """Return (telemetry_df, lap_row) for a specific lap, or None on failure."""
    try:
        driver_laps = session.laps.pick_drivers(driver_code)
        lap = driver_laps[driver_laps["LapNumber"] == lap_number]
        if lap.empty:
            logger.warning("Lap %d not found for driver %s", lap_number, driver_code)
            return None
        lap_row = lap.iloc[0]
        tel = lap_row.get_telemetry()
        if tel is None or tel.empty:
            logger.warning("No telemetry for lap %d, driver %s", lap_number, driver_code)
            return None
        return tel, lap_row
    except Exception as exc:
        logger.error("Failed getting lap %d for %s: %s", lap_number, driver_code, exc)
        return None


def _estimate_sector_distances(
    sector_times: list,
    lap_time: "Optional[float]",
    lap_distance: float,
) -> list:
    """
    Approximate the distance at which each sector boundary occurs.
    Uses fraction of lap time completed as proxy (assumes roughly constant speed).
    """
    if not lap_time or lap_time == 0:
        return [lap_distance / 3, 2 * lap_distance / 3]

    s1 = sector_times[0] or 0.0
    s2 = sector_times[1] or 0.0

    s1_frac = s1 / lap_time
    s12_frac = (s1 + s2) / lap_time

    return [
        float(s1_frac * lap_distance),
        float(s12_frac * lap_distance),
    ]


def _build_circuit_map(
    tel: pd.DataFrame,
    common_dist: np.ndarray,
    delta: np.ndarray,
    driver1: str,
    driver2: str,
    n_map_points: int = 300,
    session: "Optional[fastf1.core.Session]" = None,
) -> tuple[list, float]:
    """
    Build normalised circuit map points from GPS position data.
    Each point is tagged with which driver is faster at that location.

    Fallback chain for X/Y coordinates:
      1. Primary telemetry (tel) X/Y columns
      2. session.pos_data for driver1 (car position data)
    """
    try:
        x = None
        y = None
        dist_raw = None

        # --- Source 1: telemetry X/Y ---
        if "X" in tel.columns and "Y" in tel.columns:
            x_raw = pd.to_numeric(tel["X"], errors="coerce").fillna(0).to_numpy(dtype=np.float64)
            y_raw = pd.to_numeric(tel["Y"], errors="coerce").fillna(0).to_numpy(dtype=np.float64)
            # Check if data is actually meaningful (not all zeros)
            if (x_raw.max() - x_raw.min()) > 10 and (y_raw.max() - y_raw.min()) > 10:
                x = x_raw
                y = y_raw
                dist_raw = tel["Distance"].to_numpy(dtype=np.float64)
                logger.debug("Circuit map: using telemetry X/Y (%d points)", len(x))

        # --- Source 2: session.pos_data ---
        if x is None and session is not None:
            try:
                pos = getattr(session, "pos_data", None)
                if pos is not None and not pos.empty:
                    # pos_data has DriverNumber column; find driver1's number
                    drv_info = session.get_driver(driver1)
                    drv_num = str(getattr(drv_info, "DriverNumber", ""))
                    if drv_num:
                        drv_pos = pos[pos["DriverNumber"] == drv_num]
                    else:
                        drv_pos = pd.DataFrame()

                    if not drv_pos.empty and "X" in drv_pos.columns and "Y" in drv_pos.columns:
                        x_raw = pd.to_numeric(drv_pos["X"], errors="coerce").fillna(0).to_numpy(dtype=np.float64)
                        y_raw = pd.to_numeric(drv_pos["Y"], errors="coerce").fillna(0).to_numpy(dtype=np.float64)
                        if (x_raw.max() - x_raw.min()) > 10 and (y_raw.max() - y_raw.min()) > 10:
                            x = x_raw
                            y = y_raw
                            # pos_data typically has no Distance column; generate one from cumulative XY deltas
                            dx = np.diff(x, prepend=x[0])
                            dy = np.diff(y, prepend=y[0])
                            dist_raw = np.cumsum(np.sqrt(dx**2 + dy**2))
                            logger.debug("Circuit map: using session.pos_data (%d points)", len(x))
            except Exception as e:
                logger.debug("pos_data fallback failed: %s", e)

        if x is None or y is None or dist_raw is None:
            logger.info("Circuit map: no position data available")
            return []

        # Normalise coordinates to [0, 1] with aspect ratio preserved
        x_min, x_max = x.min(), x.max()
        y_min, y_max = y.min(), y.max()
        x_range = max(x_max - x_min, 1)
        y_range = max(y_max - y_min, 1)
        max_range = max(x_range, y_range)

        # Interpolate x, y onto common_dist grid
        x_interp = np.interp(common_dist, dist_raw, x)
        y_interp = np.interp(common_dist, dist_raw, y)

        # Find rotation if available
        rotation_deg = 0.0
        if session is not None:
            try:
                ci = session.get_circuit_info()
                rotation_deg = float(getattr(ci, 'rotation', 0.0))
            except Exception:
                pass

        x_norm = (x_interp - x_interp.min()) / max_range
        y_norm = (y_interp - y_interp.min()) / max_range

        # Stride down to n_map_points
        step = max(1, len(common_dist) // n_map_points)
        indices = range(0, len(common_dist), step)

        points = []
        for i in indices:
            d = float(delta[i])
            if abs(d) < 0.02:
                faster = None
            elif d > 0:
                faster = driver1
            else:
                faster = driver2

            points.append({
                "x": float(x_norm[i]),
                "y": float(y_norm[i]),
                "distance": float(common_dist[i]),
                "faster_driver": faster,
            })

        return points, rotation_deg

    except Exception as exc:
        logger.warning("Failed to build circuit map: %s", exc)
        return [], 0.0


def _build_single_driver_circuit(
    tel: pd.DataFrame,
    n_map_points: int = 300,
    session: "Optional[fastf1.core.Session]" = None,
    driver_code: str = "",
) -> "tuple[list, float]":
    """
    Build a normalised circuit outline from a single driver's telemetry.
    All points have faster_driver=None (uniform colour in the map).
    """
    try:
        x = None
        y = None
        dist_raw = None

        if "X" in tel.columns and "Y" in tel.columns:
            x_raw = pd.to_numeric(tel["X"], errors="coerce").fillna(0).to_numpy(dtype=np.float64)
            y_raw = pd.to_numeric(tel["Y"], errors="coerce").fillna(0).to_numpy(dtype=np.float64)
            if (x_raw.max() - x_raw.min()) > 10 and (y_raw.max() - y_raw.min()) > 10:
                x = x_raw
                y = y_raw
                dist_raw = tel["Distance"].to_numpy(dtype=np.float64)

        if x is None and session is not None and driver_code:
            try:
                pos = getattr(session, "pos_data", None)
                if pos is not None and not pos.empty:
                    drv_info = session.get_driver(driver_code)
                    drv_num = str(getattr(drv_info, "DriverNumber", ""))
                    if drv_num:
                        drv_pos = pos[pos["DriverNumber"] == drv_num]
                        if not drv_pos.empty and "X" in drv_pos.columns and "Y" in drv_pos.columns:
                            x_raw = pd.to_numeric(drv_pos["X"], errors="coerce").fillna(0).to_numpy(dtype=np.float64)
                            y_raw = pd.to_numeric(drv_pos["Y"], errors="coerce").fillna(0).to_numpy(dtype=np.float64)
                            if (x_raw.max() - x_raw.min()) > 10 and (y_raw.max() - y_raw.min()) > 10:
                                x = x_raw
                                y = y_raw
                                dx = np.diff(x, prepend=x[0])
                                dy = np.diff(y, prepend=y[0])
                                dist_raw = np.cumsum(np.sqrt(dx**2 + dy**2))
            except Exception as e:
                logger.debug("pos_data fallback failed: %s", e)

        if x is None:
            return [], 0.0

        x_range = max(x.max() - x.min(), 1.0)
        y_range = max(y.max() - y.min(), 1.0)
        max_range = max(x_range, y_range)

        rotation_deg = 0.0
        if session is not None:
            try:
                ci = session.get_circuit_info()
                rotation_deg = float(getattr(ci, "rotation", 0.0))
            except Exception:
                pass

        x_norm = (x - x.min()) / max_range
        y_norm = (y - y.min()) / max_range
        n = len(x_norm)
        step = max(1, n // n_map_points)

        if dist_raw is not None and len(dist_raw) == n:
            dists = dist_raw
        else:
            dx2 = np.diff(x, prepend=x[0])
            dy2 = np.diff(y, prepend=y[0])
            dists = np.cumsum(np.sqrt(dx2**2 + dy2**2))

        points = []
        for i in range(0, n, step):
            points.append({
                "x": float(x_norm[i]),
                "y": float(y_norm[i]),
                "distance": float(dists[i]),
                "faster_driver": None,
            })

        return points, rotation_deg

    except Exception as exc:
        logger.warning("Failed to build single driver circuit: %s", exc)
        return [], 0.0


def _compute_mini_sectors(
    distances: np.ndarray,
    spd1: np.ndarray,
    spd2: np.ndarray,
    driver1: str,
    driver2: str,
    n: int = 25,
) -> list[dict]:
    """Divide the lap into n mini sectors and compare speeds."""
    if len(distances) == 0:
        return []

    max_dist = distances[-1]
    sector_width = max_dist / n
    mini_sectors = []

    for i in range(n):
        d_start = i * sector_width
        d_end = (i + 1) * sector_width

        mask = (distances >= d_start) & (distances < d_end)
        if not mask.any():
            continue

        avg_spd1 = float(spd1[mask].mean())
        avg_spd2 = float(spd2[mask].mean())

        # Estimate time through sector: time = distance / avg_speed
        # Using avg speed in m/s
        sector_len = d_end - d_start
        eps = 1e-6
        t1 = sector_len / (avg_spd1 / 3.6 + eps)
        t2 = sector_len / (avg_spd2 / 3.6 + eps)

        faster = driver1 if t1 < t2 else (driver2 if t2 < t1 else None)

        mini_sectors.append({
            "sector_index": i,
            "distance_start": float(d_start),
            "distance_end": float(d_end),
            "time_d1": float(t1),
            "time_d2": float(t2),
            "faster_driver": faster,
        })

    return mini_sectors


def _lttb(x: np.ndarray, y: np.ndarray, n: int) -> np.ndarray:
    """
    Pure-Python/NumPy implementation of the Largest Triangle Three Buckets (LTTB)
    downsampling algorithm. Preserves visual fidelity better than stride sampling.

    Returns an array of selected indices.
    """
    length = len(x)
    if n >= length or n < 3:
        return np.arange(length)

    bucket_size = (length - 2) / (n - 2)
    selected = np.zeros(n, dtype=int)
    selected[0] = 0
    selected[-1] = length - 1

    a = 0  # previous selected point

    for i in range(n - 2):
        # Current bucket boundaries
        bucket_start = int(np.floor((i + 1) * bucket_size)) + 1
        bucket_end = int(np.floor((i + 2) * bucket_size)) + 1
        bucket_end = min(bucket_end, length - 1)

        # Next bucket: compute average point for lookahead
        next_start = bucket_end
        next_end = int(np.floor((i + 3) * bucket_size)) + 1
        next_end = min(next_end, length - 1)
        next_avg_x = np.mean(x[next_start:next_end])
        next_avg_y = np.mean(y[next_start:next_end])

        # Find the point in current bucket that forms the largest triangle
        # with point a and the next-bucket average
        ax, ay = x[a], y[a]
        max_area = -1.0
        best = bucket_start

        for j in range(bucket_start, bucket_end):
            bx, by = x[j], y[j]
            area = abs(
                (ax - next_avg_x) * (by - ay) -
                (ax - bx) * (next_avg_y - ay)
            ) * 0.5
            if area > max_area:
                max_area = area
                best = j

        selected[i + 1] = best
        a = best

    return selected


def _downsample_telemetry(tel: pd.DataFrame, n_points: int) -> pd.DataFrame:
    """
    Downsample telemetry DataFrame to approximately n_points rows using LTTB.
    Falls back to stride sampling for very small datasets.
    """
    n_rows = len(tel)
    if n_rows <= n_points:
        return tel

    try:
        dist = tel["Distance"].to_numpy(dtype=np.float64)
        spd = tel["Speed"].to_numpy(dtype=np.float64)
        spd = np.where(np.isnan(spd), 0.0, spd)

        indices = _lttb(dist, spd, n_points)
        return tel.iloc[indices].reset_index(drop=True)
    except Exception:
        # Fallback: stride-based sampling
        step = max(1, n_rows // n_points)
        return tel.iloc[::step].reset_index(drop=True)


def _telemetry_to_points(tel: pd.DataFrame) -> list[dict]:
    """Convert telemetry DataFrame to list of point dicts for JSON serialization."""
    points = []

    for _, row in tel.iterrows():
        def safe_float(val):
            try:
                v = float(val)
                return None if np.isnan(v) else v
            except (TypeError, ValueError):
                return None

        def safe_int(val):
            try:
                v = int(val)
                return v
            except (TypeError, ValueError):
                return None

        def safe_bool(val):
            try:
                return bool(val)
            except (TypeError, ValueError):
                return None

        # Time from lap start in seconds
        time_val = row.get("Time")
        time_sec = None
        if time_val is not None:
            try:
                time_sec = time_val.total_seconds()
            except AttributeError:
                time_sec = safe_float(time_val)

        # DRS: FastF1 encodes DRS as 0, 8, 10, 12, 14 — values ≥ 10 = DRS open
        drs_raw = safe_int(row.get("DRS"))

        point = {
            "distance": safe_float(row.get("Distance")) or 0.0,
            "speed": safe_float(row.get("Speed")),
            "throttle": safe_float(row.get("Throttle")),
            "brake": safe_bool(row.get("Brake")),
            "gear": safe_int(row.get("nGear")),
            "rpm": safe_float(row.get("RPM")),
            "drs": drs_raw,
            "time": time_sec,
        }
        points.append(point)

    return points
