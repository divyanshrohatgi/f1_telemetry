import os
from typing import List
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    """
    Application configuration via environment variables.
    """
    ENVIRONMENT: str = "prod"
    
    # Origins allowed to make cross-origin requests
    # Default covers local development
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]
    
    # Default IP-based rate limit
    DEFAULT_RATE_LIMIT: str = "60/minute"
    
    # Internal flag to enable ML prediction caching 
    # (can add more config as needed)

    class Config:
        env_file = "../.env"
        env_file_encoding = "utf-8"

settings = Settings()
