"""
ML Model registry — loads the correct degradation model based on season year.
Supports versioned models for future 2026+ retraining.
"""

import logging
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
from sklearn.pipeline import Pipeline

logger = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).parent / "saved_models"

# Model version → season ranges
MODEL_VERSIONS = {
    "v1": {
        "seasons": (2019, 2025),
        "filename_pattern": "degradation_v1_*.pkl",
    },
    # "v2": {
    #     "seasons": (2026, 9999),
    #     "filename_pattern": "degradation_v2_*.pkl",
    # },
}

_model_cache: dict[str, Optional[dict]] = {}


def get_model_for_season(year: int) -> Optional[dict]:
    """
    Load the appropriate degradation model for a given season year.

    Returns a dict with:
      - model: trained sklearn Pipeline
      - seasons: list of training seasons
      - feature_columns: list of feature column names

    Returns None if no suitable model is found.
    """
    version = "v1" if year <= 2025 else "v2"

    if version in _model_cache:
        return _model_cache[version]

    # Find latest matching model file
    pattern = MODEL_VERSIONS.get(version, {}).get("filename_pattern", "*.pkl")
    model_files = sorted(MODELS_DIR.glob(pattern), reverse=True)

    if not model_files:
        logger.warning("No model found for version %s in %s", version, MODELS_DIR)
        _model_cache[version] = None
        return None

    model_path = model_files[0]
    logger.info("Loading model: %s", model_path)

    try:
        payload = joblib.load(model_path)
        _model_cache[version] = payload
        logger.info("Model loaded: %s (trained on seasons %s)", model_path.name, payload.get("seasons"))
        return payload
    except Exception as exc:
        logger.error("Failed to load model %s: %s", model_path, exc)
        _model_cache[version] = None
        return None


def predict_degradation_curve(
    compound: str,
    circuit_id: str,
    track_temp: float,
    air_temp: float,
    max_laps: int,
    year: int = 2024,
) -> list[dict]:
    """
    Predict degradation curve for a given compound and conditions.

    Returns a list of dicts with:
      tyre_age, predicted_delta, ci_lower, ci_upper
    """
    payload = get_model_for_season(year)

    if payload is None:
        # Return a simple linear degradation estimate as fallback
        return _linear_fallback(compound, max_laps)

    model: Pipeline = payload["model"]
    feature_cols: list[str] = payload["feature_columns"]

    # Build compound one-hot
    compounds = ["SOFT", "MEDIUM", "HARD", "INTER", "WET"]
    compound_ohe = {f"compound_{c}": int(c == compound.upper()) for c in compounds}

    results = []
    deltas = []

    for age in range(1, max_laps + 1):
        row = {
            "tyre_age": age,
            "track_temp": track_temp,
            "air_temp": air_temp,
            **compound_ohe,
        }

        # Build feature vector in correct column order
        features = np.array([[row.get(col, 0) for col in feature_cols]])

        try:
            pred = float(model.predict(features)[0])
        except Exception:
            pred = age * _compound_rate(compound)

        deltas.append(pred)

    # Smooth with a rolling window to avoid noisy predictions
    smoothed = _smooth(deltas, window=3)

    # Simple confidence interval: ±0.5s at lap 1, ±1.5s at lap 30+
    for age, delta in enumerate(smoothed, start=1):
        ci_width = 0.5 + (age / 30) * 1.0
        results.append({
            "tyre_age": age,
            "predicted_delta": max(0, delta),
            "ci_lower": max(0, delta - ci_width),
            "ci_upper": max(0, delta + ci_width),
        })

    return results


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
) -> dict:
    """
    Recommend optimal pit window based on degradation model.

    Strategy: pit when cumulative degradation cost since lap 1 equals pit_loss_time.
    """
    curve = predict_degradation_curve(compound, circuit_id, track_temp, air_temp, 60, year)

    if not curve:
        return {
            "recommended_window_start": current_tyre_age + 5,
            "recommended_window_end": current_tyre_age + 10,
            "urgency": "watch",
            "cumulative_loss_at_window": 0.0,
            "explanation": "Could not compute pit window — model not available",
        }

    # Find the lap where cumulative deg exceeds pit_loss_time
    # (that's when you'd break even)
    window_start = None
    window_end = None

    for i in range(current_tyre_age, min(len(curve), 60)):
        point = curve[i]
        cum_loss = point["predicted_delta"]

        if window_start is None and cum_loss >= pit_loss_time * 0.75:
            window_start = i + 1

        if window_end is None and cum_loss >= pit_loss_time:
            window_end = i + 1
            break

    if window_start is None:
        window_start = current_tyre_age + 10
    if window_end is None:
        window_end = window_start + 8

    # Urgency based on current age vs window
    laps_to_window = window_start - current_tyre_age

    if laps_to_window <= 0:
        urgency = "now"
        explanation = f"Pit NOW — degradation cost exceeds pit loss time ({pit_loss_time:.0f}s)"
    elif laps_to_window <= 3:
        urgency = "soon"
        explanation = f"Pit in {laps_to_window}–{laps_to_window+3} laps"
    elif laps_to_window <= 8:
        urgency = "watch"
        explanation = f"Pit window opens in ~{laps_to_window} laps"
    else:
        urgency = "ok"
        explanation = f"Tyres OK for ~{laps_to_window} more laps"

    cum_at_window = curve[window_start - 1]["predicted_delta"] if window_start <= len(curve) else 0.0

    return {
        "recommended_window_start": window_start,
        "recommended_window_end": window_end,
        "urgency": urgency,
        "cumulative_loss_at_window": cum_at_window,
        "explanation": explanation,
    }


def _compound_rate(compound: str) -> float:
    """Fallback linear degradation rate per lap (seconds)."""
    rates = {
        "SOFT": 0.12,
        "MEDIUM": 0.07,
        "HARD": 0.04,
        "INTER": 0.10,
        "WET": 0.08,
    }
    return rates.get(compound.upper(), 0.08)


def _linear_fallback(compound: str, max_laps: int) -> list[dict]:
    """Return a simple linear degradation curve when no model is available."""
    rate = _compound_rate(compound)
    results = []
    for age in range(1, max_laps + 1):
        delta = rate * (age - 1)
        results.append({
            "tyre_age": age,
            "predicted_delta": delta,
            "ci_lower": max(0, delta - 1.0),
            "ci_upper": delta + 1.5,
        })
    return results


def _smooth(values: list[float], window: int = 3) -> list[float]:
    """Simple centered moving average smoothing."""
    result = []
    n = len(values)
    for i in range(n):
        start = max(0, i - window // 2)
        end = min(n, i + window // 2 + 1)
        result.append(np.mean(values[start:end]))
    return result

