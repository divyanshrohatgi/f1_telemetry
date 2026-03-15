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
  tyre_history: string[];
  pit_stops: number;
  in_pit: boolean;
  gap: number | string | null;  // null=leader, number=seconds, 'PIT', 'OUT'
  has_fastest_lap: boolean;
  retired: boolean;
  flag: string | null; // 'investigation' | 'penalty' | null
  speed: number;
  throttle: number;
  brake: boolean;
  gear: number;
  rpm: number;
  drs: number;
  current_lap: number;
  pit_prediction: number | null;
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
  status: string;
  weather: WeatherData | null;
}

export interface SessionMeta {
  year: number;
  gp_name: string;
  circuit_name: string;
  country_code: string;
  session_type: string; // 'R' | 'Q' | 'FP1' | 'FP2' | 'FP3' | 'S'
}

export interface BattleZone {
  driverA: string;
  driverB: string;
  gapSeconds: number;
}

export interface RCMessage {
  t: number;
  message: string;
  category: string;
  racing_number: string | null;
}
