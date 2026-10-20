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

    redis_url: str = "redis://localhost:6379"  # rate limits, lockouts, alert de-dup (Redis 7+)
    redis_prefix: str = "bos:"

    # Sessions are opaque random tokens stored hashed (security.py), so there
    # is no signing secret to configure (P1-15: the unused default is gone).
    session_ttl_days: int = 30

    api_port: int = 4000
    # ENV=production (NODE_ENV kept as a fallback for existing .env files)
    # switches on the startup guard, Secure cookies, HSTS and hides /docs.
    # Code asks `settings.is_prod`; node_env is only the label (logs, Sentry).
    node_env: str = Field(default="development", validation_alias=AliasChoices("env", "node_env"))
    # Jobs run in the worker process (`python -m app.worker`), never in the API.
    worker_poll_s: float = 5.0
    worker_heartbeat_file: str = ""            # default: <tmp>/bos-worker-heartbeat

    # Comma-separated allowed browser origins for CORS
    web_origin: str = "http://localhost:3000"
    # Comma-separated CIDRs of the reverse proxy (Caddy). X-Forwarded-For is
    # believed only when the direct peer is in one of them; empty = never.
    trusted_proxy_cidrs: str = ""

    # Master keys for credentials encrypted in the DB (app/crypto.py):
    # JSON {"key_id": "<base64 of 32 random bytes>"}. Lives outside the DB and
    # its backups. Empty = a public dev key, which production refuses.
    bos_data_keys: str = ""
    bos_data_key_active: str = ""

    sentry_dsn: str = ""                       # error tracking (no-op if empty)
    git_sha: str = ""                          # the release tag for Sentry and logs (CI sets it)
    log_format: str = "json"                   # json | text (text is for a dev terminal)
    log_level: str = "INFO"
    # Where /ready finds the migration files (default: the repo's infra/migrations).
    migrations_dir: str = ""

    # Alerts (app/alerts.py). The webhook is optional: Slack/Discord/ntfy-style JSON POST.
    alert_webhook_url: str = ""
    alert_5xx_per_5min: int = 20               # 5xx responses in a 5-minute window
    alert_401_per_5min: int = 200              # 401s (bad/expired sessions, wrong passwords)
    alert_ratelimit_per_5min: int = 200        # 429s and 423 lockouts
    outbox_lag_alert_min: int = 30             # a due outbox row waiting this long

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
