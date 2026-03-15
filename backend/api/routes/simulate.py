import logging
from fastapi import APIRouter, HTTPException

from models.schemas import SimulationRequest, SimulationResponse
from services.simulator import simulate_race_strategy
from api.limiter import limiter
from fastapi import Request

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/v1/simulate/{year}/{gp}/{session_type}", response_model=SimulationResponse)
@limiter.limit("10/minute")
async def run_simulation(request: Request, year: int, gp: str, session_type: str, req: SimulationRequest):
    """
    Run a mathematical race strategy simulation for a specific driver.
    """
    try:
        result = simulate_race_strategy(
            year=year,
            gp=gp,
            session_type=session_type,
            driver_code=req.driver_code,
            starting_compound=req.starting_compound,
            pit_stops=req.pit_stops
        )
        return SimulationResponse(**result)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as exc:
        logger.error(f"Simulation failed: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Simulation failed: {exc}")
