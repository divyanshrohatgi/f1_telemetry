"""
F1 Telemetry Dashboard — FastAPI application entry point.

Run with:
    uvicorn api.main:app --reload --port 8000
"""

import logging
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from api.routes import sessions, laps, telemetry, strategy, comparison, weather, prediction, pitsense, results, standings, simulate, homepage, live, whatif
from api.routes import replay_ws

# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App creation
# ---------------------------------------------------------------------------
app = FastAPI(
    title="F1 Telemetry Dashboard API",
    description="Real Formula 1 race analytics powered by FastF1",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

import os
import json
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# CORS — allow React frontend (read from .env)
# ---------------------------------------------------------------------------
app.add_middleware(GZipMiddleware, minimum_size=1000)

cors_origins_str = os.getenv("CORS_ORIGINS", '["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173", "http://127.0.0.1:3000"]')
try:
    origins = json.loads(cors_origins_str)
except json.JSONDecodeError:
    logger.error("Failed to parse CORS_ORIGINS from environment. Falling back to default origins.")
    origins = ["http://localhost:5173", "http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Security headers
# ---------------------------------------------------------------------------

@app.middleware("http")
async def add_security_headers(request: Request, call_next) -> Response:
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
app.include_router(sessions.router, prefix="/api", tags=["sessions"])
app.include_router(laps.router, prefix="/api", tags=["laps"])
app.include_router(telemetry.router, prefix="/api", tags=["telemetry"])
app.include_router(strategy.router, prefix="/api", tags=["strategy"])
app.include_router(comparison.router, prefix="/api", tags=["comparison"])
app.include_router(weather.router, prefix="/api", tags=["weather"])
app.include_router(prediction.router, prefix="/api", tags=["ml-predictions"])
app.include_router(pitsense.router,  prefix="/api", tags=["pitsense"])
app.include_router(results.router,    prefix="/api", tags=["results"])
app.include_router(standings.router,  prefix="/api", tags=["standings"])
app.include_router(homepage.router,   prefix="/api/v1", tags=["homepage"])
app.include_router(simulate.router,   prefix="/api", tags=["simulate"])
app.include_router(whatif.router,     prefix="/api", tags=["whatif"])
app.include_router(live.router,       prefix="/api", tags=["live"])
app.include_router(replay_ws.router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "f1-telemetry-api"}


@app.get("/")
async def root():
    return {
        "message": "F1 Telemetry Dashboard API",
        "docs": "/docs",
        "version": "1.0.0"
    }
