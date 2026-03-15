"""
WebSocket replay endpoint.

Client connects → server loads session + builds frames → streams at configurable speed.

Commands (text, lowercase):
  play            start streaming
  pause           pause streaming
  speed:<float>   set playback speed multiplier (0.25–50)
  seek:<float>    jump to timestamp in seconds
  seeklap:<int>   jump to start of lap N
  reset           jump to frame 0, pause
"""
import asyncio
import copy
import logging
from typing import Optional, Dict, List

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services.fastf1_loader import load_session
from services.replay_builder import build_replay_frames_async, build_circuit_outline_async, extract_rc_messages_async

logger = logging.getLogger(__name__)
router = APIRouter(tags=["replay"])

# Per-session build locks — prevent duplicate concurrent builds
_locks: Dict[str, asyncio.Lock] = {}

# In-memory frame cache: session_key → frames
_frame_cache: Dict[str, List[dict]] = {}

# Circuit outline cache: session_key → (points, rotation)
_circuit_cache: Dict[str, tuple] = {}

# Race control messages cache: session_key → list of RC message dicts
_rc_cache: Dict[str, List[dict]] = {}

BASE_INTERVAL = 0.5  # seconds per frame at speed=1

# Pit loss defaults by track status (seconds)
_PIT_LOSS_GREEN = 22.0
_PIT_LOSS_SC = 10.0
_PIT_LOSS_VSC = 14.0


def _session_key(year: int, gp: str, session_type: str) -> str:
    sanitized = gp.lower().replace(' ', '_').replace('-', '_')
    return f"{year}_{sanitized}_{session_type.lower()}"


def _get_lock(key: str) -> asyncio.Lock:
    if key not in _locks:
        _locks[key] = asyncio.Lock()
    return _locks[key]


async def _get_frames(year: int, gp: str, session_type: str,
                      send_status) -> List[dict]:
    """Load session and build frames, with per-key locking and caching."""
    key = _session_key(year, gp, session_type)

    if key in _frame_cache:
        return _frame_cache[key]

    lock = _get_lock(key)
    async with lock:
        # Double-checked locking
        if key in _frame_cache:
            return _frame_cache[key]

        await send_status('Loading session…')
        session = await asyncio.to_thread(
            load_session, year, gp, session_type,
            load_laps=True, load_telemetry=True, load_weather=True,
        )

        await send_status('Building replay frames…')
        frames = await build_replay_frames_async(session)
        _frame_cache[key] = frames

        await send_status('Building circuit map…')
        circuit_pts, circuit_rot = await build_circuit_outline_async(session)
        _circuit_cache[key] = (circuit_pts, circuit_rot)

        await send_status('Extracting race control messages…')
        rc_messages = await extract_rc_messages_async(session)
        _rc_cache[key] = rc_messages

        return frames


def _pit_loss_for_status(status: str) -> float:
    if status == 'sc':
        return _PIT_LOSS_SC
    if status == 'vsc':
        return _PIT_LOSS_VSC
    return _PIT_LOSS_GREEN


def _compute_pit_predictions(frame: dict) -> dict:
    """
    Compute pit_prediction for each non-retired, non-pit driver in the frame.
    Returns a new frame dict (shallow copy with drivers list replaced).

    pit_prediction: projected position after a pit stop this lap.
    Only shown when lap > 15.
    """
    current_lap = frame.get('lap', 0)
    if current_lap <= 15:
        return frame

    status = frame.get('status', 'green')
    pit_loss = _pit_loss_for_status(status)
    drivers: List[dict] = frame.get('drivers', [])

    # Build gap→position lookup for drivers currently on track
    # gap is None (leader), float seconds, 'PIT', or 'OUT'
    on_track_gaps: List[float] = []
    for d in drivers:
        gap = d.get('gap')
        if gap is None:
            on_track_gaps.append(0.0)
        elif isinstance(gap, (int, float)):
            on_track_gaps.append(float(gap))
    on_track_gaps_sorted = sorted(on_track_gaps)

    new_drivers: List[dict] = []
    for d in drivers:
        driver_copy = copy.copy(d)
        gap = d.get('gap')
        if (
            not d.get('retired', False)
            and not d.get('in_pit', False)
            and isinstance(gap, (int, float, type(None)))
        ):
            current_gap = 0.0 if gap is None else float(gap)
            projected_gap = current_gap + pit_loss

            # Count how many on-track drivers would be ahead after the pit
            projected_pos = 1
            for other_gap in on_track_gaps_sorted:
                if other_gap < projected_gap:
                    projected_pos += 1

            driver_copy['pit_prediction'] = projected_pos
        else:
            driver_copy['pit_prediction'] = None

        new_drivers.append(driver_copy)

    result = {k: v for k, v in frame.items() if k != 'drivers'}
    result['drivers'] = new_drivers
    return result


@router.websocket('/ws/replay/{year}/{gp}/{session_type}')
async def replay_ws(websocket: WebSocket, year: int, gp: str, session_type: str):
    await websocket.accept()

    async def send(msg: dict):
        try:
            await websocket.send_json(msg)
        except Exception:
            pass

    async def send_status(message: str):
        await send({'type': 'status', 'message': message})

    try:
        await send_status('Connecting…')

        try:
            frames = await _get_frames(year, gp, session_type, send_status)
        except Exception as exc:
            await send({'type': 'error', 'message': f'Failed to load session: {exc}'})
            await websocket.close()
            return

        if not frames:
            await send({'type': 'error', 'message': 'No telemetry data available for replay'})
            await websocket.close()
            return

        key = _session_key(year, gp, session_type)
        circuit_pts, circuit_rot = _circuit_cache.get(key, ([], 0.0))
        rc_messages_data = _rc_cache.get(key, [])

        await send({
            'type': 'ready',
            'total_frames': len(frames),
            'total_time': frames[-1]['timestamp'],
            'total_laps': frames[-1].get('total_laps', 0),
            'circuit_points': circuit_pts,
            'circuit_rotation': circuit_rot,
            'rc_messages': rc_messages_data,
        })

        # Send first frame with pit predictions
        await send({'type': 'frame', **_compute_pit_predictions(frames[0])})

        # ── Playback state ────────────────────────────────────────────────
        playing = False
        speed = 1.0
        frame_index = 0

        async def handle_command(cmd: str):
            nonlocal playing, speed, frame_index
            cmd = cmd.strip().lower()
            if cmd == 'play':
                playing = True
            elif cmd == 'pause':
                playing = False
            elif cmd.startswith('speed:'):
                try:
                    speed = max(0.25, min(50.0, float(cmd.split(':', 1)[1])))
                except ValueError:
                    pass
            elif cmd.startswith('seek:'):
                try:
                    t = float(cmd.split(':', 1)[1])
                    for i, f in enumerate(frames):
                        if f['timestamp'] >= t:
                            frame_index = i
                            break
                    await send({'type': 'frame', **_compute_pit_predictions(frames[frame_index])})
                except (ValueError, IndexError):
                    pass
            elif cmd.startswith('seeklap:'):
                try:
                    target_lap = int(cmd.split(':', 1)[1])
                    for i, f in enumerate(frames):
                        if f.get('lap', 0) >= target_lap:
                            frame_index = i
                            break
                    await send({'type': 'frame', **_compute_pit_predictions(frames[frame_index])})
                except (ValueError, IndexError):
                    pass
            elif cmd == 'reset':
                frame_index = 0
                playing = False
                await send({'type': 'frame', **_compute_pit_predictions(frames[0])})

        async def poll_commands(timeout: float) -> bool:
            """Poll for a command within timeout. Returns True if command received."""
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=timeout)
                await handle_command(msg)
                return True
            except asyncio.TimeoutError:
                return False

        # ── Main loop ─────────────────────────────────────────────────────
        while True:
            if playing and frame_index < len(frames):
                enriched = _compute_pit_predictions(frames[frame_index])
                await send({'type': 'frame', **enriched})
                frame_index += 1

                if frame_index >= len(frames):
                    playing = False
                    await send({'type': 'finished'})
                    continue

                # Drain remaining interval in 50ms chunks, checking for commands
                remaining = BASE_INTERVAL / speed
                while remaining > 0:
                    chunk = min(remaining, 0.05)
                    await poll_commands(chunk)
                    remaining -= chunk
                    if not playing:
                        break
            else:
                # Idle: wait for a command
                await poll_commands(1.0)

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.error('Replay WS error: %s', exc, exc_info=True)
        try:
            await websocket.close()
        except Exception:
            pass
