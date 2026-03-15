"""
PitSense™ — AI Pit Strategy Engine routes.
Renamed from prediction.py; routes moved from /predict/* to /pitsense/*.
"""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException

from models.schemas import (
    DegradationRequest,
    DegradationResponse,
    DegradationPoint,
    PitWindowRequest,
    PitWindowResponse,
)
from ml.model_registry import predict_degradation_curve, predict_pit_window
from services.simulator import _get_pit_loss

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/v1/pitsense/curve", response_model=DegradationResponse)
async def pitsense_curve(request: DegradationRequest):
    """
    PitSense™ — predict tyre degradation curve for a given compound and conditions.

    Returns predicted lap time delta (seconds slower vs lap 1) for each tyre age.
    Uses a Gradient Boosting Regressor trained on 2022–2024 race data.
    Falls back to a linear estimate if no model is trained yet.
    """
    try:
        curve = predict_degradation_curve(
            compound=request.compound,
            circuit_id=request.circuit_id,
            track_temp=request.track_temp,
            air_temp=request.air_temp,
            max_laps=request.max_laps,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PitSense prediction failed: {exc}")

    points = [DegradationPoint(**p) for p in curve]
    cliff_lap = _find_cliff_lap(curve) if len(curve) > 5 else None

    return DegradationResponse(
        compound=request.compound,
        circuit_id=request.circuit_id,
        degradation_curve=points,
        cliff_lap=cliff_lap,
    )


@router.post("/v1/pitsense/window", response_model=PitWindowResponse)
async def pitsense_window(request: PitWindowRequest):
    """
    PitSense™ — recommend optimal pit window based on current tyre state and conditions.
    """
    try:
        result = predict_pit_window(
            compound=request.compound,
            circuit_id=request.circuit_id,
            current_tyre_age=request.current_tyre_age,
            track_temp=request.track_temp,
            air_temp=request.air_temp,
            gap_ahead=request.gap_ahead,
            gap_behind=request.gap_behind,
            pit_loss_time=request.pit_loss_time,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PitSense window prediction failed: {exc}")

    return PitWindowResponse(**result)


@router.get("/v1/pitsense/pit-loss/{circuit_id}")
async def pitsense_pit_loss(circuit_id: str):
    """Return pit stop time losses for green, safety car, and VSC conditions."""
    green = _get_pit_loss(circuit_id, "green")
    sc = max(green - 6.0, 15.0)
    vsc = max(green - 3.0, 18.0)
    return {
        "circuit_id": circuit_id,
        "green": round(green, 1),
        "sc": round(sc, 1),
        "vsc": round(vsc, 1),
    }


def _find_cliff_lap(curve: list[dict]) -> Optional[int]:
    """Find the lap number where degradation accelerates most sharply."""
    if len(curve) < 4:
        return None

    deltas = [p["predicted_delta"] for p in curve]

    second_deriv = []
    for i in range(1, len(deltas) - 1):
        d2 = deltas[i + 1] - 2 * deltas[i] + deltas[i - 1]
        second_deriv.append((i, d2))

    if not second_deriv:
        return None

    cliff_idx, cliff_d2 = max(second_deriv, key=lambda x: x[1])

    if cliff_d2 > 0.03:
        return curve[cliff_idx]["tyre_age"]

    return None
