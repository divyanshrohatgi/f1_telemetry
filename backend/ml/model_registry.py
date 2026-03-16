"""
ML Model registry — loads dry and wet degradation models.
Supports versioned models for future retraining.
"""

import logging
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
from sklearn.pipeline import Pipeline

logger = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).parent / "saved_models"

_model_cache: dict[str, Optional[dict]] = {}


def _load_model(pattern: str, cache_key: str) -> Optional[dict]:
    """Load latest model matching pattern, cache by key."""
    if cache_key in _model_cache:
        return _model_cache[cache_key]

    model_files = sorted(MODELS_DIR.glob(pattern), reverse=True)
    if not model_files:
        logger.warning("No model found for pattern %s in %s", pattern, MODELS_DIR)
        _model_cache[cache_key] = None
        return None

    try:
        payload = joblib.load(model_files[0])
        _model_cache[cache_key] = payload
        logger.info("Loaded model: %s (seasons %s)", model_files[0].name, payload.get("seasons"))
        return payload
    except Exception as exc:
        logger.error("Failed to load %s: %s", model_files[0], exc)
        _model_cache[cache_key] = None
        return None


def get_model_for_season(year: int, wet: bool = False) -> Optional[dict]:
    """
    Load the appropriate degradation model for a given season.
    wet=True loads the wet-weather model.
    Falls back to v1 model if dry model not found.
    """
    if wet:
        return _load_model("degradation_wet_*.pkl", "wet")

    payload = _load_model("degradation_dry_*.pkl", "dry")
    if payload is None:
        payload = _load_model("degradation_v1_*.pkl", "v1_fallback")
    return payload


def predict_degradation_curve(
    compound: str,
    circuit_id: str,
    track_temp: float,
    air_temp: float,
    max_laps: int,
    year: int = 2024,
    fresh_tyre: bool = True,
    humidity: float = 50.0,
    position: float = 10.0,
    speed_i1: float = 260.0,
    speed_i2: float = 260.0,
    speed_st: float = 310.0,
    team: str = "",
    start_race_lap: int = 1,
    wet: bool = False,
) -> list[dict]:
    """
    Predict degradation curve lap-by-lap for a compound in given conditions.

    Uses the AR chain: each lap's prediction feeds prev_lap_delta / delta_acceleration
    for the next lap — same as training.

    Returns list of dicts: tyre_age, predicted_delta, ci_lower, ci_upper
    """
    compound_upper = compound.upper()
    is_wet_compound = compound_upper in ("INTER", "WET")
    payload = get_model_for_season(year, wet=wet or is_wet_compound)

    if payload is None:
        return _linear_fallback(compound_upper, max_laps)

    model: Pipeline = payload["model"]
    circuit_deg_map  = payload.get("circuit_deg_map")
    team_deg_map     = payload.get("team_deg_map")
    circuit_encoder  = payload.get("circuit_encoder")
    feature_cols: list[str] = payload.get("feature_columns", [])

    # Resolve target-encoded values; fall back to global mean if unseen
    circuit_deg = float(
        circuit_deg_map.get(circuit_id, circuit_deg_map.mean())
        if circuit_deg_map is not None else 1.0
    )
    team_deg = float(
        team_deg_map.get(team, team_deg_map.mean())
        if team_deg_map is not None else 1.0
    )

    # Label-encoded circuit (new models only)
    circuit_encoded = 0
    if circuit_encoder is not None:
        cid = circuit_id.lower().strip()
        try:
            circuit_encoded = int(circuit_encoder.transform([cid])[0])
        except ValueError:
            known = list(circuit_encoder.classes_)
            match = next((c for c in known if cid in c or c in cid), None)
            circuit_encoded = int(circuit_encoder.transform([match])[0]) if match else 0

    # Compound one-hot (dry model uses SOFT/MEDIUM/HARD/INTER only)
    all_compounds = ["SOFT", "MEDIUM", "HARD", "INTER", "WET"]
    compound_ohe = {f"compound_{c}": int(c == compound_upper) for c in all_compounds}

    # Compound × age interactions
    is_soft   = int(compound_upper == "SOFT")
    is_medium = int(compound_upper == "MEDIUM")
    is_hard   = int(compound_upper == "HARD")
    is_inter  = int(compound_upper == "INTER")
    is_wet    = int(compound_upper == "WET")

    results = []
    prev_delta      = 0.0
    prev_prev_delta = 0.0

    for age in range(1, max_laps + 1):
        race_lap = start_race_lap + age - 1
        delta_accel = prev_delta - prev_prev_delta

        row = {
            # Compound × age interactions (replace raw tyre_age in dry model)
            "soft_x_age":   is_soft   * age,
            "medium_x_age": is_medium * age,
            "hard_x_age":   is_hard   * age,
            "inter_x_age":  is_inter  * age,
            "wet_x_age":    is_wet    * age,
            # Tyre age (used by wet model)
            "tyre_age":     age,
            "tyre_age_sq":  age ** 2,
            # Race context
            "race_lap_number":    race_lap,
            "prev_lap_delta":     prev_delta,
            "delta_acceleration": delta_accel,
            "year":               year,
            "fresh_tyre":         int(fresh_tyre),
            # Conditions
            "humidity":   humidity,
            "position":   position,
            "speed_i1":   speed_i1,
            "speed_i2":   speed_i2,
            "speed_st":   speed_st,
            "track_temp": track_temp,
            "air_temp":   air_temp,
            # Encoded context (target-encoded for complex models, label-encoded for simple)
            "circuit_deg":     circuit_deg,
            "team_deg":        team_deg,
            "circuit_encoded": circuit_encoded,
            **compound_ohe,
        }

        features = np.array([[row.get(col, 0.0) for col in feature_cols]])

        try:
            pred = float(model.predict(features)[0])
        except Exception:
            pred = age * _compound_rate(compound_upper)

        # Enforce monotonic-ish: predicted delta shouldn't drop sharply mid-stint
        # (small noise suppression — doesn't prevent legitimate cliff detection)
        if age > 3 and pred < prev_delta - 1.5:
            pred = prev_delta - 0.3

        results.append(pred)
        prev_prev_delta = prev_delta
        prev_delta = pred

    # Smooth lightly (window=2) to reduce XGBoost step noise without killing cliff shape
    smoothed = _smooth(results, window=2)

    output = []
    for age, delta in enumerate(smoothed, start=1):
        ci_width = 0.4 + (age / 30) * 0.8   # tighter CI from better model
        output.append({
            "tyre_age": age,
            "predicted_delta": max(0.0, delta),
            "ci_lower": max(0.0, delta - ci_width),
            "ci_upper": max(0.0, delta + ci_width),
        })

    return output


def predict_pit_window(
    compound: str,
    circuit_id: str,
    current_tyre_age: int,
    track_temp: float,
    air_temp: float,
    gap_ahead: Optional[float],
    gap_behind: Optional[float],
    pit_loss_time: float = 23.0,
    year: int = 2024,
    team: str = "",
    humidity: float = 50.0,
    wet: bool = False,
) -> dict:
    """
    Recommend optimal pit window based on degradation model.
    Pits when cumulative degradation cost equals pit_loss_time.
    """
    curve = predict_degradation_curve(
        compound, circuit_id, track_temp, air_temp,
        max_laps=60, year=year, team=team, humidity=humidity, wet=wet,
        start_race_lap=current_tyre_age,
    )

    if not curve:
        return {
            "recommended_window_start": current_tyre_age + 5,
            "recommended_window_end": current_tyre_age + 10,
            "urgency": "watch",
            "cumulative_loss_at_window": 0.0,
            "explanation": "Model not available",
        }

    window_start = None
    window_end   = None

    for i in range(current_tyre_age, min(len(curve), 60)):
        cum_loss = curve[i]["predicted_delta"]

        if window_start is None and cum_loss >= pit_loss_time * 0.75:
            window_start = i + 1
        if window_end is None and cum_loss >= pit_loss_time:
            window_end = i + 1
            break

    if window_start is None:
        window_start = current_tyre_age + 10
    if window_end is None:
        window_end = window_start + 8

    laps_to_window = window_start - current_tyre_age

    if laps_to_window <= 0:
        urgency = "now"
        explanation = f"Pit NOW — degradation cost exceeds pit loss time ({pit_loss_time:.0f}s)"
    elif laps_to_window <= 3:
        urgency = "soon"
        explanation = f"Pit in {laps_to_window}–{laps_to_window + 3} laps"
    elif laps_to_window <= 8:
        urgency = "watch"
        explanation = f"Pit window opens in ~{laps_to_window} laps"
    else:
        urgency = "ok"
        explanation = f"Tyres OK for ~{laps_to_window} more laps"

    cum_at_window = curve[window_start - 1]["predicted_delta"] if window_start <= len(curve) else 0.0

    return {
        "recommended_window_start": window_start,
        "recommended_window_end":   window_end,
        "urgency":                  urgency,
        "cumulative_loss_at_window": cum_at_window,
        "explanation":              explanation,
    }


def _compound_rate(compound: str) -> float:
    """Fallback linear degradation rate per lap."""
    return {"SOFT": 0.12, "MEDIUM": 0.07, "HARD": 0.04, "INTER": 0.10, "WET": 0.08}.get(compound, 0.08)


def _linear_fallback(compound: str, max_laps: int) -> list[dict]:
    rate = _compound_rate(compound)
    return [
        {
            "tyre_age": age,
            "predicted_delta": rate * (age - 1),
            "ci_lower": max(0.0, rate * (age - 1) - 1.0),
            "ci_upper": rate * (age - 1) + 1.5,
        }
        for age in range(1, max_laps + 1)
    ]


def _smooth(values: list[float], window: int = 2) -> list[float]:
    result = []
    n = len(values)
    for i in range(n):
        start = max(0, i - window // 2)
        end   = min(n, i + window // 2 + 1)
        result.append(float(np.mean(values[start:end])))
    return result
