"""Application settings, loaded from the monorepo-root .env file."""
from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# services/api/app/config.py -> parents[3] == monorepo root
ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_ENV, extra="ignore")

    # Owner connection: migrations + auth/signup (bypasses RLS as table owner)
    database_url: str = "postgres://businessos:change_me_in_prod@localhost:5432/businessos"
    # Runtime connection: tenant-scoped queries as non-owner role (RLS enforced)
    app_database_url: str = "postgres://app_user:app_user_pw@localhost:5432/businessos"

    redis_url: str = "redis://localhost:6379"

    session_secret: str = "dev_only_change_me"
    session_ttl_days: int = 30

    api_port: int = 4000
    node_env: str = "development"

    # Comma-separated allowed browser origins for CORS
    web_origin: str = "http://localhost:3000"

    anthropic_api_key: str = ""
    ai_model: str = "claude-sonnet-5"          # reasoning/answers
    ai_model_fast: str = "claude-haiku-4-5-20251001"  # cheap classification

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.web_origin.split(",") if o.strip()]

    @property
    def is_prod(self) -> bool:
        return self.node_env == "production"


settings = Settings()
