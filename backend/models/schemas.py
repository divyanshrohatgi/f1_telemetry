"""
Pydantic response schemas for all API endpoints.
All times are in seconds (float) — timedelta objects from FastF1 are converted on ingestion.
"""

from __future__ import annotations

from typing import Any, List, Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Session / GP schemas
# ---------------------------------------------------------------------------

class GrandPrixInfo(BaseModel):
    round_number: int
    name: str
    country: str
    location: str
    date: str  # ISO date string
    sessions: list[str]  # Available session types: FP1, FP2, FP3, Q, SQ, R, SS


class SeasonResponse(BaseModel):
    year: int
    grands_prix: list[GrandPrixInfo]


class SessionMetadata(BaseModel):
    session_key: str  # "{year}_{gp_sanitized}_{session_type}"
    year: int
    gp_name: str
    session_type: str
    circuit_name: str
    country: str
    date: str
    weather_summary: Optional[str] = None
    total_laps: int = 0
    drivers: dict[str, DriverSessionInfo]  # driver_code → info


class DriverSessionInfo(BaseModel):
    code: str           # VER, NOR, LEC ...
    full_name: str
    team_name: str
    team_color: str
    driver_number: str


# ---------------------------------------------------------------------------
# Lap schemas
# ---------------------------------------------------------------------------

class LapData(BaseModel):
    lap_number: int
    lap_time: Optional[float] = None          # seconds
    sector1_time: Optional[float] = None       # seconds
    sector2_time: Optional[float] = None       # seconds
    sector3_time: Optional[float] = None       # seconds
    compound: Optional[str] = None             # SOFT, MEDIUM, HARD, INTER, WET
    tyre_life: Optional[int] = None            # laps on this set
    stint: Optional[int] = None
    is_pit_out_lap: bool = False
    is_pit_in_lap: bool = False
    is_deleted: bool = False                    # track limits / incident
    is_accurate: bool = True
    is_estimated: bool = False                  # lap_time estimated from LapStartTime delta
    track_status: Optional[str] = None         # "1"=green, "2"=yellow, "4"=SC, "6"=VSC
    pit_in_time: Optional[float] = None        # race elapsed seconds
    pit_out_time: Optional[float] = None
    pit_duration: Optional[float] = None       # seconds in pits
    speed_trap: Optional[float] = None         # km/h


class DriverLapsResponse(BaseModel):
    session_key: str
    driver_code: str
    team_name: str
    team_color: str
    laps: list[LapData]
    fastest_lap_number: Optional[int] = None


# ---------------------------------------------------------------------------
# Telemetry schemas
# ---------------------------------------------------------------------------

class TelemetryPoint(BaseModel):
    distance: float          # metres from lap start
    speed: Optional[float] = None
    throttle: Optional[float] = None
    brake: Optional[bool] = None
    gear: Optional[int] = None
    rpm: Optional[float] = None
    drs: Optional[int] = None          # 0=off, 10/12/14=on (F1 encoding)
    time: Optional[float] = None       # seconds from lap start


class TelemetryResponse(BaseModel):
    session_key: str
    driver_code: str
    lap_number: int
    points: list[TelemetryPoint]
    lap_distance: float      # total lap distance in metres
    lap_time: Optional[float] = None  # seconds
    circuit_points: list[CircuitPoint] = []  # normalised GPS track outline
    circuit_rotation: float = 0.0            # FastF1 rotation angle in degrees


# ---------------------------------------------------------------------------
# Strategy schemas
# ---------------------------------------------------------------------------

class Stint(BaseModel):
    stint_number: int
    compound: str
    start_lap: int
    end_lap: int
    tyre_life: int       # laps on this set at end of stint
    fresh: bool          # True if new tyres
    pit_in_time: Optional[float] = None   # seconds
    pit_duration: Optional[float] = None  # seconds
    avg_pace: Optional[float] = None      # average lap time in seconds


class DriverStrategy(BaseModel):
    driver_code: str
    full_name: str
    team_name: str
    team_color: str
    finishing_position: Optional[int] = None
    stints: list[Stint]
    total_pit_stops: int
    total_pit_time: float   # cumulative seconds in pits


class StrategyResponse(BaseModel):
    session_key: str
    drivers: list[DriverStrategy]


# ---------------------------------------------------------------------------
# Comparison schemas
# ---------------------------------------------------------------------------

class ComparisonLapPoint(BaseModel):
    distance: float
    # Speed
    speed_d1: Optional[float] = None
    speed_d2: Optional[float] = None
    # Throttle (0–100)
    throttle_d1: Optional[float] = None
    throttle_d2: Optional[float] = None
    # Brake (0 or 1)
    brake_d1: Optional[float] = None
    brake_d2: Optional[float] = None
    # Gear (1–8)
    gear_d1: Optional[float] = None
    gear_d2: Optional[float] = None
    # RPM
    rpm_d1: Optional[float] = None
    rpm_d2: Optional[float] = None
    # Cumulative time delta: d2 - d1 (positive = d1 is faster/ahead)
    delta: Optional[float] = None


class CircuitPoint(BaseModel):
    """Normalised circuit map point with mini-sector coloring."""
    x: float              # normalised 0–1
    y: float              # normalised 0–1
    distance: float       # metres along lap
    faster_driver: Optional[str] = None   # driver code or None if equal


class MiniSector(BaseModel):
    sector_index: int
    distance_start: float
    distance_end: float
    time_d1: Optional[float] = None
    time_d2: Optional[float] = None
    faster_driver: Optional[str] = None


class ComparisonResponse(BaseModel):
    session_key: str
    driver1_code: str
    driver2_code: str
    driver1_team_color: str
    driver2_team_color: str
    driver1_lap_time: Optional[float] = None
    driver2_lap_time: Optional[float] = None
    # Sector times [s1, s2, s3] in seconds
    driver1_sector_times: list[Optional[float]] = []
    driver2_sector_times: list[Optional[float]] = []
    # Distance where S1/S2 ends (for vertical sector markers on charts)
    sector_distances: list[float] = []
    lap_distance: float
    points: list[ComparisonLapPoint]
    circuit_points: list[CircuitPoint] = []   # normalised track map
    circuit_rotation: float = 0.0             # FastF1 rotation angle in degrees
    mini_sectors: list[MiniSector]


# ---------------------------------------------------------------------------
# Weather schemas
# ---------------------------------------------------------------------------

class WeatherPoint(BaseModel):
    lap_number: int
    time: Optional[float] = None     # session elapsed seconds
    air_temp: Optional[float] = None
    track_temp: Optional[float] = None
    humidity: Optional[float] = None
    pressure: Optional[float] = None
    wind_speed: Optional[float] = None
    rainfall: bool = False


class WeatherResponse(BaseModel):
    session_key: str
    points: list[WeatherPoint]


# ---------------------------------------------------------------------------
# ML / Prediction schemas
# ---------------------------------------------------------------------------

class DegradationRequest(BaseModel):
    compound: str = Field(..., description="Tyre compound: SOFT, MEDIUM, HARD, INTER, WET")
    circuit_id: str = Field(..., description="Circuit key, e.g. 'monza', 'silverstone'")
    track_temp: float = Field(..., description="Track surface temperature in °C")
    air_temp: float = Field(..., description="Ambient air temperature in °C")
    max_laps: int = Field(default=50, ge=1, le=70)


class DegradationPoint(BaseModel):
    tyre_age: int
    predicted_delta: float       # seconds slower vs lap 1
    ci_lower: float              # 95% confidence interval lower bound
    ci_upper: float              # 95% confidence interval upper bound


class DegradationResponse(BaseModel):
    compound: str
    circuit_id: str
    degradation_curve: list[DegradationPoint]
    cliff_lap: Optional[int] = None   # predicted lap where deg accelerates sharply


class PitWindowRequest(BaseModel):
    compound: str
    circuit_id: str
    current_tyre_age: int
    track_temp: float
    air_temp: float
    gap_ahead: Optional[float] = None   # seconds gap to car ahead
    gap_behind: Optional[float] = None  # seconds gap to car behind
    pit_loss_time: float = Field(default=23.0, description="Estimated pit stop time loss in seconds")


class PitWindowResponse(BaseModel):
    recommended_window_start: int   # lap number
    recommended_window_end: int     # lap number
    urgency: str                    # "now", "soon", "watch", "ok"
    cumulative_loss_at_window: float  # seconds of degradation at recommended lap
    explanation: str


# ---------------------------------------------------------------------------
# Session results schemas (full timing sheet — all drivers in one call)
# ---------------------------------------------------------------------------

class DriverResult(BaseModel):
    position: Optional[int] = None
    grid_position: Optional[int] = None
    driver_code: str
    full_name: str
    team_name: str
    team_color: str
    driver_number: str
    # Time gaps
    gap_to_leader: Optional[str] = None   # "+1.234s", "LEADER", "+1 Lap", "DNF"
    # Best lap across all laps in session
    best_lap_time: Optional[float] = None
    best_lap_number: Optional[int] = None
    # Best sector times across all laps
    best_s1: Optional[float] = None
    best_s2: Optional[float] = None
    best_s3: Optional[float] = None
    # Last lap time (most recent completed lap)
    last_lap_time: Optional[float] = None
    laps_completed: int = 0
    # Tyre info (from final stint)
    compound: Optional[str] = None        # SOFT, MEDIUM, HARD, INTER, WET
    tyre_age: int = 0
    pit_stops: int = 0
    status: str = ""                      # "Finished", "+1 Lap", "DNF", "Accident" ...
    points: float = 0.0
    # Purple / overall-best flags
    is_best_lap: bool = False
    is_best_s1: bool = False
    is_best_s2: bool = False
    is_best_s3: bool = False


class SessionResultsResponse(BaseModel):
    session_key: str
    year: int
    gp_name: str
    session_type: str
    circuit_name: str
    country: str
    date: str
    total_laps: int = 0
    drivers: list[DriverResult]
    # Session-wide bests (for purple highlighting)
    overall_best_lap: Optional[float] = None
    overall_best_s1: Optional[float] = None
    overall_best_s2: Optional[float] = None
    overall_best_s3: Optional[float] = None
    weather_summary: Optional[str] = None


class LatestRaceInfo(BaseModel):
    """Lightweight pointer to the most recently completed race."""
    year: int
    gp_name: str
    round_number: int
    country: str
    date: str


# ---------------------------------------------------------------------------
# Championship standings schemas
# ---------------------------------------------------------------------------

class DriverStanding(BaseModel):
    position: Optional[int] = None
    driver_code: str
    full_name: str
    team_name: str
    team_color: str
    points: float
    wins: int


class ConstructorStanding(BaseModel):
    position: Optional[int] = None
    team_name: str
    team_color: str
    points: float
    wins: int


class StandingsResponse(BaseModel):
    year: int
    round: int
    drivers: list[DriverStanding]
    constructors: list[ConstructorStanding]


# ---------------------------------------------------------------------------
# Error schema
# ---------------------------------------------------------------------------

class ErrorResponse(BaseModel):
    detail: str
    code: Optional[str] = None


# ---------------------------------------------------------------------------
# Simulator schemas
# ---------------------------------------------------------------------------

class PitStopSimulation(BaseModel):
    lap: int
    compound: str

class SimulationRequest(BaseModel):
    driver_code: str
    starting_compound: Optional[str] = None
    pit_stops: list[PitStopSimulation]

class SimulatedLap(BaseModel):
    lap_number: int
    lap_time: float
    cumulative_time: float
    compound: str
    tyre_age: int
    is_pit_in_lap: bool
    is_pit_out_lap: bool
    traffic_penalty: float = 0.0

class SimulationResponse(BaseModel):
    session_key: str
    driver_code: str
    original_total_time: float
    simulated_total_time: float
    time_delta: float
    simulated_laps: list[SimulatedLap]


# ---------------------------------------------------------------------------
# Homepage schemas
# ---------------------------------------------------------------------------

class HeroDriver(BaseModel):
    position: Optional[int] = None
    driver_code: str
    full_name: str
    team_color: str
    gap_to_leader: Optional[str] = None
    headshot_url: Optional[str] = None
    compound: Optional[str] = None


class Point2D(BaseModel):
    x: float
    y: float

class HeroRaceResult(BaseModel):
    year: int
    gp_name: str
    country: str
    circuit_name: str
    date: str
    round_number: int
    total_laps: int = 0
    top5: List[HeroDriver] = []
    fastest_lap_time: Optional[float] = None
    fastest_lap_driver: Optional[str] = None
    fastest_lap_number: Optional[int] = None
    laps_led_driver: Optional[str] = None
    laps_led_count: Optional[int] = None
    safety_car_count: int = 0
    circuit_points: Optional[List[CircuitPoint]] = None
    circuit_rotation: float = 0.0
    circuit_length_km: Optional[float] = None
    race_distance_km: Optional[float] = None


class RaceInsight(BaseModel):
    type: str
    title: str
    emoji: str = ""
    driver_code: Optional[str] = None
    team_color: str = "#FFFFFF"
    headline: str
    detail: str
    headshot_url: Optional[str] = None


class SeasonNode(BaseModel):
    round_number: int
    gp_name: str
    country: str
    date: str
    is_completed: bool = False
    is_next: bool = False
    winner: Optional[str] = None
    total_laps: Optional[int] = None
    circuit_length_km: Optional[float] = None
    race_distance_km: Optional[float] = None
    lap_record_time: Optional[str] = None
    lap_record_driver: Optional[str] = None
    lap_record_year: Optional[int] = None


# ---------------------------------------------------------------------------
# What-If Simulator schemas
# ---------------------------------------------------------------------------

class WhatIfChange(BaseModel):
    driver: str
    original_pit_lap: int
    new_pit_lap: int
    new_compound: str

class WhatIfRequest(BaseModel):
    year: int
    gp_name: str
    session: str = "R"
    changes: List[WhatIfChange]

class WhatIfLap(BaseModel):
    lap: int
    position: int
    gap: float = 0.0
    time: float = 0.0
    compound: str = "UNKNOWN"
    tyre_age: int = 0
    is_simulated: bool = False

class DriverFinalResult(BaseModel):
    driver: str
    position: int
    gap: Optional[float] = None

class WhatIfSummary(BaseModel):
    driver: str
    actual_position: int
    simulated_position: int
    position_change: int
    time_delta: float

class WhatIfResponse(BaseModel):
    summary: WhatIfSummary
    actual_laps: List[WhatIfLap]
    simulated_laps: List[WhatIfLap]
    all_drivers_actual_final: List[DriverFinalResult]
    all_drivers_simulated_final: List[DriverFinalResult]


class HomepageData(BaseModel):
    hero: Optional[HeroRaceResult] = None
    next_race_name: Optional[str] = None
    next_race_date: Optional[str] = None
    next_race_country: Optional[str] = None
    insights: List[RaceInsight] = []
    drivers_standings: List[DriverStanding] = []
    constructors_standings: List[ConstructorStanding] = []
    standings_round: int = 0
    season_year: int = 0
    season_nodes: List[SeasonNode] = []
    completed_races: int = 0
    total_races: int = 0
