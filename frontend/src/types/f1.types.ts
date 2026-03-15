/**
 * Shared TypeScript types for the F1 Telemetry Dashboard.
 * These mirror the Pydantic schemas from the backend.
 */

// ---------------------------------------------------------------------------
// Session / GP
// ---------------------------------------------------------------------------

export interface GrandPrixInfo {
  round_number: number;
  name: string;
  country: string;
  location: string;
  date: string;
  sessions: string[];
}

export interface SeasonResponse {
  year: number;
  grands_prix: GrandPrixInfo[];
}

export interface DriverSessionInfo {
  code: string;
  full_name: string;
  team_name: string;
  team_color: string;
  driver_number: string;
}

export interface SessionMetadata {
  session_key: string;
  year: number;
  gp_name: string;
  session_type: string;
  circuit_name: string;
  country: string;
  date: string;
  weather_summary: string | null;
  total_laps: number;
  drivers: Record<string, DriverSessionInfo>;
}

// ---------------------------------------------------------------------------
// Laps
// ---------------------------------------------------------------------------

export type TyreCompound = 'SOFT' | 'MEDIUM' | 'HARD' | 'INTER' | 'WET' | 'UNKNOWN';

export interface LapData {
  lap_number: number;
  lap_time: number | null;
  sector1_time: number | null;
  sector2_time: number | null;
  sector3_time: number | null;
  compound: TyreCompound | null;
  tyre_life: number | null;
  stint: number | null;
  is_pit_out_lap: boolean;
  is_pit_in_lap: boolean;
  is_deleted: boolean;
  is_accurate: boolean;
  is_estimated: boolean;
  track_status: string | null;
  pit_in_time: number | null;
  pit_out_time: number | null;
  pit_duration: number | null;
  speed_trap: number | null;
}

export interface DriverLapsResponse {
  session_key: string;
  driver_code: string;
  team_name: string;
  team_color: string;
  laps: LapData[];
  fastest_lap_number: number | null;
}

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

export interface TelemetryPoint {
  distance: number;
  speed: number | null;
  throttle: number | null;
  brake: boolean | null;
  gear: number | null;
  rpm: number | null;
  drs: number | null;
  time: number | null;
}

export interface TelemetryResponse {
  session_key: string;
  driver_code: string;
  lap_number: number;
  points: TelemetryPoint[];
  lap_distance: number;
  lap_time: number | null;
  circuit_points: CircuitPoint[];
  circuit_rotation: number;
}

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

export interface Stint {
  stint_number: number;
  compound: TyreCompound;
  start_lap: number;
  end_lap: number;
  tyre_life: number;
  fresh: boolean;
  pit_in_time: number | null;
  pit_duration: number | null;
  avg_pace: number | null;
}

export interface DriverStrategy {
  driver_code: string;
  full_name: string;
  team_name: string;
  team_color: string;
  finishing_position: number | null;
  stints: Stint[];
  total_pit_stops: number;
  total_pit_time: number;
}

export interface StrategyResponse {
  session_key: string;
  drivers: DriverStrategy[];
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export interface ComparisonLapPoint {
  distance: number;
  speed_d1: number | null;
  speed_d2: number | null;
  throttle_d1: number | null;
  throttle_d2: number | null;
  brake_d1: number | null;
  brake_d2: number | null;
  gear_d1: number | null;
  gear_d2: number | null;
  rpm_d1: number | null;
  rpm_d2: number | null;
  delta: number | null;
}

export interface CircuitPoint {
  x: number;
  y: number;
  distance: number;
  faster_driver: string | null;
}

export interface MiniSector {
  sector_index: number;
  distance_start: number;
  distance_end: number;
  time_d1: number | null;
  time_d2: number | null;
  faster_driver: string | null;
}

export interface ComparisonResponse {
  session_key: string;
  driver1_code: string;
  driver2_code: string;
  driver1_team_color: string;
  driver2_team_color: string;
  driver1_lap_time: number | null;
  driver2_lap_time: number | null;
  driver1_sector_times: (number | null)[];
  driver2_sector_times: (number | null)[];
  sector_distances: number[];
  lap_distance: number;
  points: ComparisonLapPoint[];
  circuit_points: CircuitPoint[];
  circuit_rotation: number;
  mini_sectors: MiniSector[];
}

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------

export interface WeatherPoint {
  lap_number: number;
  time: number | null;
  air_temp: number | null;
  track_temp: number | null;
  humidity: number | null;
  pressure: number | null;
  wind_speed: number | null;
  rainfall: boolean;
}

export interface WeatherResponse {
  session_key: string;
  points: WeatherPoint[];
}

// ---------------------------------------------------------------------------
// ML Predictions
// ---------------------------------------------------------------------------

export interface DegradationRequest {
  compound: TyreCompound;
  circuit_id: string;
  track_temp: number;
  air_temp: number;
  max_laps: number;
}

export interface DegradationPoint {
  tyre_age: number;
  predicted_delta: number;
  ci_lower: number;
  ci_upper: number;
}

export interface DegradationResponse {
  compound: TyreCompound;
  circuit_id: string;
  degradation_curve: DegradationPoint[];
  cliff_lap: number | null;
}

export interface PitWindowRequest {
  compound: TyreCompound;
  circuit_id: string;
  current_tyre_age: number;
  track_temp: number;
  air_temp: number;
  gap_ahead: number | null;
  gap_behind: number | null;
  pit_loss_time: number;
}

export interface PitWindowResponse {
  recommended_window_start: number;
  recommended_window_end: number;
  urgency: 'now' | 'soon' | 'watch' | 'ok';
  cumulative_loss_at_window: number;
  explanation: string;
}

// ---------------------------------------------------------------------------
// Session Results (full timing sheet — all drivers)
// ---------------------------------------------------------------------------

export interface DriverResult {
  position: number | null;
  grid_position: number | null;
  driver_code: string;
  full_name: string;
  team_name: string;
  team_color: string;
  driver_number: string;
  gap_to_leader: string | null;
  best_lap_time: number | null;
  best_lap_number: number | null;
  best_s1: number | null;
  best_s2: number | null;
  best_s3: number | null;
  last_lap_time: number | null;
  laps_completed: number;
  compound: TyreCompound | null;
  tyre_age: number;
  pit_stops: number;
  status: string;
  points: number;
  is_best_lap: boolean;
  is_best_s1: boolean;
  is_best_s2: boolean;
  is_best_s3: boolean;
}

export interface SessionResultsResponse {
  session_key: string;
  year: number;
  gp_name: string;
  session_type: string;
  circuit_name: string;
  country: string;
  date: string;
  total_laps: number;
  drivers: DriverResult[];
  overall_best_lap: number | null;
  overall_best_s1: number | null;
  overall_best_s2: number | null;
  overall_best_s3: number | null;
  weather_summary: string | null;
}

export interface LatestRaceInfo {
  year: number;
  gp_name: string;
  round_number: number;
  country: string;
  date: string;
}

// ---------------------------------------------------------------------------
// Championship Standings
// ---------------------------------------------------------------------------

export interface DriverStanding {
  position: number | null;
  driver_code: string;
  full_name: string;
  team_name: string;
  team_color: string;
  points: number;
  wins: number;
}

export interface ConstructorStanding {
  position: number | null;
  team_name: string;
  team_color: string;
  points: number;
  wins: number;
}

export interface StandingsResponse {
  year: number;
  round: number;
  drivers: DriverStanding[];
  constructors: ConstructorStanding[];
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

export interface SimulatedLap {
  lap_number: number;
  lap_time: number;
  cumulative_time: number;
  compound: TyreCompound;
  tyre_age: number;
  is_pit_in_lap: boolean;
  is_pit_out_lap: boolean;
  traffic_penalty: number;
}

export interface SimulationResponse {
  session_key: string;
  driver_code: string;
  original_total_time: number;
  simulated_total_time: number;
  time_delta: number;
  simulated_laps: SimulatedLap[];
}

// ---------------------------------------------------------------------------
// Homepage
// ---------------------------------------------------------------------------

export interface HeroDriver {
  position: number | null;
  driver_code: string;
  full_name: string;
  team_color: string;
  gap_to_leader: string | null;
  headshot_url: string | null;
  compound: string | null;
}

export interface HeroRaceResult {
  year: number;
  gp_name: string;
  country: string;
  circuit_name: string;
  date: string;
  round_number: number;
  total_laps: number;
  top5: HeroDriver[];
  fastest_lap_time: number | null;
  fastest_lap_driver: string | null;
  fastest_lap_number: number | null;
  laps_led_driver: string | null;
  laps_led_count: number | null;
  safety_car_count: number;
  circuit_points: CircuitPoint[] | null;
  circuit_rotation: number;
  circuit_length_km: number | null;
  race_distance_km: number | null;
}

export interface RaceInsight {
  type: string;
  title: string;
  emoji: string;
  driver_code: string | null;
  team_color: string;
  headline: string;
  detail: string;
}

export interface SeasonRaceNode {
  round_number: number;
  gp_name: string;
  country: string;
  date: string;
  is_completed: boolean;
  is_next: boolean;
  winner: string | null;
  total_laps: number | null;
  circuit_length_km: number | null;
  race_distance_km: number | null;
  lap_record_time: string | null;
  lap_record_driver: string | null;
  lap_record_year: number | null;
}

export interface HomepageData {
  hero: HeroRaceResult | null;
  next_race_name: string | null;
  next_race_date: string | null;
  next_race_country: string | null;
  insights: RaceInsight[];
  drivers_standings: DriverStanding[];
  constructors_standings: ConstructorStanding[];
  standings_round: number;
  season_year: number;
  season_nodes: SeasonRaceNode[];
  completed_races: number;
  total_races: number;
}

// ---------------------------------------------------------------------------
// UI State
// ---------------------------------------------------------------------------

export type AppMode = 'home' | 'latest' | 'analysis';

export type TabView = 'laps' | 'telemetry' | 'comparison' | 'strategy' | 'degradation' | 'weather' | 'simulator' | 'replay';

export interface AppState {
  selectedYear: number;
  selectedGP: string | null;
  selectedSessionType: string | null;
  sessionMetadata: SessionMetadata | null;
  selectedDrivers: string[];          // Up to 2 for comparison
  activeTab: TabView;
  selectedLap: number | null;
  isLoading: boolean;
}
