"""Apply raw-SQL migrations from infra/migrations in order (idempotent via a
schema_migrations ledger). Run: python -m scripts.migrate  (from services/api)."""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import os
from pathlib import Path
from urllib.parse import unquote, urlsplit

import asyncpg

from app.config import settings

MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "infra" / "migrations"
APP_ROLE = "app_user"


def scram_verifier(password: str, iterations: int = 4096) -> str:
    """What Postgres stores for a SCRAM-SHA-256 password (RFC 5802/7677), built
    here so the plaintext is never sent in a statement — what psql's password
    command does too. ASCII passwords only (SASLprep is then the identity)."""
    salt = os.urandom(16)
    salted = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)
    client_key = hmac.new(salted, b"Client Key", hashlib.sha256).digest()
    stored_key = hashlib.sha256(client_key).digest()
    server_key = hmac.new(salted, b"Server Key", hashlib.sha256).digest()
    b64 = lambda b: base64.b64encode(b).decode()  # noqa: E731
    return f"SCRAM-SHA-256${iterations}:{b64(salt)}${b64(stored_key)}:{b64(server_key)}"


async def set_role_password(conn: asyncpg.Connection, role: str, password: str) -> None:
    if not password.isascii():
        raise ValueError("use an ASCII password (e.g. openssl rand -hex 24)")
    # ALTER ROLE takes no bind parameters; quote_ident/quote_literal escape server-side.
    ident, literal = await conn.fetchrow(
        "select quote_ident($1), quote_literal($2)", role, scram_verifier(password))
    await conn.execute(f"alter role {ident} with password {literal}")


def app_user_password(app_database_url: str) -> str | None:
    parts = urlsplit(app_database_url)
    if parts.username != APP_ROLE or not parts.password:
        return None
    return unquote(parts.password)


async def sync_app_user_password(conn: asyncpg.Connection) -> None:
    """The runtime role's password is whatever APP_DATABASE_URL says (P0-6).
    Migrations no longer carry one; this runs after them on every deploy, so
    rotating it is: change the env, run migrate, restart api + worker."""
    password = app_user_password(settings.app_database_url)
    if password is None:
        print(f"! APP_DATABASE_URL has no {APP_ROLE} password; role password left unchanged")
        return
    await set_role_password(conn, APP_ROLE, password)
    print(f"= {APP_ROLE} password set from APP_DATABASE_URL")


async def main() -> None:
    conn = await asyncpg.connect(settings.database_url)
    try:
        await conn.execute(
            """create table if not exists schema_migrations (
                   version text primary key,
                   applied_at timestamptz not null default now()
               )"""
        )
        applied = {r["version"] for r in await conn.fetch("select version from schema_migrations")}
        files = sorted(MIGRATIONS_DIR.glob("*.sql"))
        if not files:
            print(f"No .sql files found in {MIGRATIONS_DIR}")
            return
        for path in files:
            version = path.name
            if version in applied:
                print(f"= skip {version}")
                continue
            sql = path.read_text(encoding="utf-8")
            async with conn.transaction():
                await conn.execute(sql)
                await conn.execute("insert into schema_migrations(version) values ($1)", version)
            print(f"+ applied {version}")
        print("Migrations up to date.")
        await sync_app_user_password(conn)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
