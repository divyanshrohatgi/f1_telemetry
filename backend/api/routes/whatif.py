"""
What-If Simulator API route.
POST /api/v1/whatif/simulate
"""

import logging
from fastapi import APIRouter, HTTPException

from models.schemas import WhatIfRequest, WhatIfResponse
from services.whatif_engine import run_whatif

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/v1/whatif/simulate", response_model=WhatIfResponse)
async def simulate_whatif(request: WhatIfRequest):
    """
    Modify one pit stop decision and recalculate race positions for all drivers.

    Send exactly one change in `changes` (v1 supports single-change only).
    `original_pit_lap` = start_lap of the stint that begins after the pit stop
                         (i.e. the first lap on the new compound in the actual race).
    """
    if not request.changes:
        raise HTTPException(status_code=400, detail="Provide at least one change")

    change = request.changes[0]  # v1: single change

    if change.new_pit_lap < 1:
        raise HTTPException(status_code=400, detail="new_pit_lap must be >= 1")
    if change.new_compound.upper() not in ("SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"):
        raise HTTPException(status_code=400, detail="Invalid compound")

    try:
        result = run_whatif(
            year=request.year,
            gp_name=request.gp_name,
            session_type=request.session,
            driver=change.driver,
            original_pit_lap=change.original_pit_lap,
            new_pit_lap=change.new_pit_lap,
            new_compound=change.new_compound,
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("What-If simulation failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))
