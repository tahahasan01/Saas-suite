"""Application settings, loaded from the monorepo-root .env file."""
from __future__ import annotations

from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# services/api/app/config.py -> parents[3] == monorepo root
ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_ENV, extra="ignore", populate_by_name=True)

    # Owner connection: migrations + auth/signup (bypasses RLS as table owner)
    database_url: str = "postgres://businessos:change_me_in_prod@localhost:5432/businessos"
    # Runtime connection: tenant-scoped queries as non-owner role (RLS enforced)
    app_database_url: str = "postgres://app_user:app_user_pw@localhost:5432/businessos"

    redis_url: str = "redis://localhost:6379"

    # Sessions are opaque random tokens stored hashed (security.py), so there
    # is no signing secret to configure (P1-15: the unused default is gone).
    session_ttl_days: int = 30

    api_port: int = 4000
    # ENV=production (NODE_ENV kept as a fallback for existing .env files)
    # switches on the startup guard, Secure cookies, HSTS and hides /docs.
    node_env: str = Field("development", validation_alias=AliasChoices("env", "node_env"))
    # Run the proactive scheduler in this process (disable on extra replicas).
    enable_scheduler: bool = True

    # Comma-separated allowed browser origins for CORS
    web_origin: str = "http://localhost:3000"

    # Master keys for credentials encrypted in the DB (app/crypto.py):
    # JSON {"key_id": "<base64 of 32 random bytes>"}. Lives outside the DB and
    # its backups. Empty = a public dev key, which production refuses.
    bos_data_keys: str = ""
    bos_data_key_active: str = ""

    sentry_dsn: str = ""                       # error tracking (no-op if empty)

    anthropic_api_key: str = ""
    ai_model: str = "claude-sonnet-5"          # reasoning/answers
    ai_model_fast: str = "claude-haiku-4-5-20251001"  # cheap classification

    # Email — 'console' logs links in dev; 'smtp' sends for real.
    email_provider: str = "console"
    email_from: str = "Business OS <no-reply@businessos.pk>"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.web_origin.split(",") if o.strip()]

    @property
    def is_prod(self) -> bool:
        return self.node_env == "production"


settings = Settings()
