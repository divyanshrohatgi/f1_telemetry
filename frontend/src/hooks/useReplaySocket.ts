import { useState, useEffect, useRef, useCallback } from 'react';

// ── Shared types (re-exported for components) ─────────────────────────────

export interface ReplayDriver {
  abbr: string;
  x: number;
  y: number;
  color: string;
  team: string;
  team_abbr: string;
  full_name: string;
  position: number | null;
  grid_position: number | null;
  compound: string | null;
  tyre_life: number | null;
  tyre_history: string[];          // previous stint compound letters, e.g. ["S","M"]
  pit_stops: number;
  in_pit: boolean;
  gap: number | string | null;     // null=leader, number=seconds, "PIT", "OUT"
  has_fastest_lap: boolean;
  retired: boolean;
  flag: string | null;             // "investigation" | "penalty" | null
  speed: number;
  throttle: number;
  brake: boolean;
  gear: number;
  rpm: number;
  drs: number;
  current_lap: number;
  pit_prediction: number | null;   // predicted rejoin position if pitting now
}

export interface WeatherData {
  air_temp: number;
  track_temp: number;
  humidity: number;
  rainfall: boolean;
  wind_speed: number;
  wind_direction: number;
}

export interface ReplayFrame {
  timestamp: number;
  lap: number;
  total_laps: number;
  is_race: boolean;
  drivers: ReplayDriver[];
  status: string;                  // "green"|"yellow"|"sc"|"vsc"|"red"
  weather: WeatherData | null;
}

export type ReplayStatus =
  | { kind: 'connecting' }
  | { kind: 'loading'; message: string }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

// ── Hook ──────────────────────────────────────────────────────────────────

export interface TrackPoint { x: number; y: number; }

export interface RCMessage {
  t: number;
  message: string;
  category: string;
  racing_number: string | null;
}

export function useReplaySocket(year: number, gp: string, sessionType: string) {
  const wsRef = useRef<WebSocket | null>(null);

  const [status, setStatus] = useState<ReplayStatus>({ kind: 'connecting' });
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [frame, setFrame] = useState<ReplayFrame | null>(null);
  const [totalTime, setTotalTime] = useState(0);
  const [totalLaps, setTotalLaps] = useState(0);
  const [finished, setFinished] = useState(false);
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const [trackRotation, setTrackRotation] = useState(0);
  const [rcMessages, setRcMessages] = useState<RCMessage[]>([]);

  useEffect(() => {
    if (!year || !gp || !sessionType) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = (import.meta as any).env?.VITE_API_URL?.replace(/^https?:\/\//, '') ?? 'localhost:8000';
    const url = `${protocol}//${host}/ws/replay/${year}/${encodeURIComponent(gp)}/${sessionType}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      switch (msg.type) {
        case 'status':
          setStatus({ kind: 'loading', message: msg.message });
          break;
        case 'ready':
          setStatus({ kind: 'ready' });
          setTotalTime(msg.total_time);
          setTotalLaps(msg.total_laps);
          if (msg.circuit_points) setTrackPoints(msg.circuit_points);
          if (msg.circuit_rotation != null) setTrackRotation(msg.circuit_rotation);
          if (msg.rc_messages) setRcMessages(msg.rc_messages);
          break;
        case 'frame': {
          const { type: _t, ...f } = msg;
          setFrame(f as ReplayFrame);
          break;
        }
        case 'finished':
          setPlaying(false);
          setFinished(true);
          break;
        case 'error':
          setStatus({ kind: 'error', message: msg.message });
          break;
      }
    };

    ws.onerror = () => setStatus({ kind: 'error', message: 'WebSocket connection failed' });
    ws.onclose = () => {};

    return () => ws.close();
  }, [year, gp, sessionType]);

  const send = useCallback((msg: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(msg);
  }, []);

  return {
    status,
    playing,
    speed,
    frame,
    totalTime,
    totalLaps,
    finished,
    trackPoints,
    trackRotation,
    rcMessages,

    play: useCallback(() => { send('play'); setPlaying(true); setFinished(false); }, [send]),
    pause: useCallback(() => { send('pause'); setPlaying(false); }, [send]),
    setSpeed: useCallback((s: number) => { send(`speed:${s}`); setSpeedState(s); }, [send]),
    seek: useCallback((t: number) => { send(`seek:${t}`); setFinished(false); }, [send]),
    seekToLap: useCallback((lap: number) => { send(`seeklap:${lap}`); setFinished(false); }, [send]),
    skip: useCallback((deltaSeconds: number) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(`seek:${(frame?.timestamp ?? 0) + deltaSeconds}`);
        setFinished(false);
      }
    }, [frame]),
    reset: useCallback(() => { send('reset'); setPlaying(false); setFinished(false); }, [send]),
  };
}
