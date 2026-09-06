from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://localhost:5432/chitfund"
    supabase_url: str
    cors_origins: str = "http://localhost:5173"

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings():
    return Settings()
