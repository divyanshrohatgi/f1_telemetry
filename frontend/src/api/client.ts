/**
 * Typed API client for the F1 Telemetry Dashboard backend.
 * Uses fetch with typed response helpers — no Axios needed for simplicity.
 */

import type {
  SeasonResponse,
  SessionMetadata,
  DriverLapsResponse,
  TelemetryResponse,
  StrategyResponse,
  ComparisonResponse,
  WeatherResponse,
  DegradationRequest,
  DegradationResponse,
  PitWindowRequest,
  PitWindowResponse,
  SessionResultsResponse,
  LatestRaceInfo,
  StandingsResponse,
  HomepageData,
} from '../types/f1.types';

const BASE = '/api/v1';

class ApiError extends Error {
  status: number;
  detail?: string;
  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    let detail: string | undefined;
    try {
      const body = await res.json();
      detail = body.detail;
    } catch { /* ignore */ }
    throw new ApiError(res.status, `API error ${res.status}`, detail);
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail: string | undefined;
    try {
      const b = await res.json();
      detail = b.detail;
    } catch { /* ignore */ }
    throw new ApiError(res.status, `API error ${res.status}`, detail);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export const api = {
  /** List all GPs for a season. */
  getSeason: (year: number) =>
    get<SeasonResponse>(`/sessions/${year}`),

  /** Load a session — triggers FastF1 download on first call. */
  getSession: (year: number, gp: string, sessionType: string) =>
    get<SessionMetadata>(`/sessions/${year}/${encodeURIComponent(gp)}/${sessionType}`),

  /** All laps for a driver in a session. */
  getDriverLaps: (year: number, gp: string, sessionType: string, driver: string) =>
    get<DriverLapsResponse>(`/laps/${year}/${encodeURIComponent(gp)}/${sessionType}/${driver}`),

  /** Telemetry for a specific lap. */
  getTelemetry: (year: number, gp: string, sessionType: string, driver: string, lap: number, nPoints = 750) =>
    get<TelemetryResponse>(`/telemetry/${year}/${encodeURIComponent(gp)}/${sessionType}/${driver}/${lap}?n_points=${nPoints}`),

  /** Telemetry for a driver's fastest lap. */
  getFastestLapTelemetry: (year: number, gp: string, sessionType: string, driver: string, nPoints = 750) =>
    get<TelemetryResponse>(`/telemetry/${year}/${encodeURIComponent(gp)}/${sessionType}/${driver}/fastest?n_points=${nPoints}`),

  /** Strategy for all drivers in the session. */
  getStrategy: (year: number, gp: string, sessionType: string) =>
    get<StrategyResponse>(`/strategy/${year}/${encodeURIComponent(gp)}/${sessionType}`),

  /** Head-to-head comparison between two drivers. Defaults to fastest laps; pass lap1/lap2 for specific laps. */
  getComparison: (year: number, gp: string, sessionType: string, driver1: string, driver2: string, lap1?: number, lap2?: number) => {
    let url = `/comparison/${year}/${encodeURIComponent(gp)}/${sessionType}/${driver1}/${driver2}`;
    const params: string[] = [];
    if (lap1 != null) params.push(`lap1=${lap1}`);
    if (lap2 != null) params.push(`lap2=${lap2}`);
    if (params.length) url += `?${params.join('&')}`;
    return get<ComparisonResponse>(url);
  },

  /** Weather data for the session. */
  getWeather: (year: number, gp: string, sessionType: string) =>
    get<WeatherResponse>(`/weather/${year}/${encodeURIComponent(gp)}/${sessionType}`),

  /** PitSense™ — predict tyre degradation curve. */
  pitSenseCurve: (request: DegradationRequest) =>
    post<DegradationResponse>('/pitsense/curve', request),

  /** PitSense™ — recommend optimal pit window. */
  pitSenseWindow: (request: PitWindowRequest) =>
    post<PitWindowResponse>('/pitsense/window', request),

  /** PitSense™ — pit stop time losses for green / SC / VSC conditions. */
  pitLoss: (circuitId: string) =>
    get<{ circuit_id: string; green: number; sc: number; vsc: number }>(`/pitsense/pit-loss/${encodeURIComponent(circuitId)}`),

  /** Detect the most recently completed race. */
  getLatestRace: () =>
    get<LatestRaceInfo>('/latest-race'),

  /** Full timing sheet for a session (all drivers, positions, sectors, tyres). */
  getSessionResults: (year: number, gp: string, sessionType: string) =>
    get<SessionResultsResponse>(`/results/${year}/${encodeURIComponent(gp)}/${sessionType}`),

  /** Driver and constructor championship standings. */
  getStandings: (year: number) =>
    get<StandingsResponse>(`/standings/${year}`),

  /** Homepage data — hero race, standings, schedule. */
  getHomepageData: () =>
    get<HomepageData>('/homepage'),
};

export { ApiError };
