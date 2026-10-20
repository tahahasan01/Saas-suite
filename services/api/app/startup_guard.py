"""Refuse to boot production on default or known secrets (S10, P0-6).

The dev passwords live in this repository (.env.example, CI, old migrations),
so they are public. A production process that finds one of them — or no key
for the credentials encrypted in the DB — exits before serving a request.
The API calls `enforce()` at import; the worker at startup (app/worker.py).

Messages name the setting, never its value: they end up in deploy logs.
"""
from __future__ import annotations

import sys
from urllib.parse import unquote, urlsplit

from . import crypto
from .config import Settings

MIN_PASSWORD = 16

# Every password that has ever been written into this repo or its docs.
KNOWN = {
    "change_me_in_prod", "app_user_pw", "devpassword", "dev_only_change_me",
    "postgres", "password", "businessos", "changeme", "change_me", "secret",
    "replace_with_openssl_rand_hex_32",
}


def _db_url_problem(name: str, url: str) -> str | None:
    password = unquote(urlsplit(url).password or "")
    if not password:
        return f"{name} has no password"
    if password.lower() in KNOWN or "change_me" in password.lower() or "replace" in password.lower():
        return f"{name} uses a default/known password"
    if len(password) < MIN_PASSWORD:
        return f"{name} password is shorter than {MIN_PASSWORD} characters"
    return None


def problems(s: Settings) -> list[str]:
    """Empty when the settings are fit for production (or when not production)."""
    if not s.is_prod:
        return []
    found = [p for p in (_db_url_problem("DATABASE_URL", s.database_url),
                         _db_url_problem("APP_DATABASE_URL", s.app_database_url)) if p]
    try:
        ring = crypto.KeyRing.parse(s.bos_data_keys, s.bos_data_key_active)
        if ring.is_dev:
            found.append("BOS_DATA_KEYS is not set (the public dev key cannot protect real credentials)")
    except ValueError as e:
        found.append(f"BOS_DATA_KEYS/BOS_DATA_KEY_ACTIVE invalid: {e}")
    return found


def enforce(s: Settings) -> None:
    found = problems(s)
    if found:
        print("Business OS: refusing to start in production:\n  - " + "\n  - ".join(found)
              + "\nSee infra/README.md (Secrets).", file=sys.stderr)
        raise SystemExit(78)  # EX_CONFIG
