"""Database pools and the RLS-aware tenant connection helper.

Two pools by design (see migration 0001 header):
  * owner_pool  — connects as the table owner; RLS does NOT apply. Used ONLY for
                  operations that have no tenant context yet: signup and
                  login-by-email lookups.
  * app_pool    — connects as the non-owner `app_user`; RLS IS enforced. Every
                  tenant request runs inside `tenant_conn()`, which opens a
                  transaction and sets `app.tenant_id` so RLS filters all rows.
"""
from __future__ import annotations

import json
from contextlib import asynccontextmanager
from typing import AsyncIterator

import asyncpg

from .config import settings

owner_pool: asyncpg.Pool | None = None
app_pool: asyncpg.Pool | None = None


async def _init_conn(conn: asyncpg.Connection) -> None:
    # Decode json/jsonb as Python objects instead of raw strings.
    for typ in ("json", "jsonb"):
        await conn.set_type_codec(typ, encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


async def connect() -> None:
    global owner_pool, app_pool
    owner_pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=10, init=_init_conn)
    app_pool = await asyncpg.create_pool(settings.app_database_url, min_size=1, max_size=10, init=_init_conn)


async def disconnect() -> None:
    if owner_pool:
        await owner_pool.close()
    if app_pool:
        await app_pool.close()


def _owner() -> asyncpg.Pool:
    assert owner_pool is not None, "DB not connected"
    return owner_pool


def _app() -> asyncpg.Pool:
    assert app_pool is not None, "DB not connected"
    return app_pool


@asynccontextmanager
async def owner_conn() -> AsyncIterator[asyncpg.Connection]:
    """Owner connection — RLS bypassed. Use only for signup/auth lookups."""
    async with _owner().acquire() as conn:
        yield conn


@asynccontextmanager
async def tenant_conn(tenant_id: str) -> AsyncIterator[asyncpg.Connection]:
    """Runtime connection scoped to a tenant. Opens a transaction and sets the
    `app.tenant_id` GUC locally so Row-Level Security filters every query."""
    async with _app().acquire() as conn:
        async with conn.transaction():
            # is_local = true -> reset at end of transaction
            await conn.execute("SELECT set_config('app.tenant_id', $1, true)", str(tenant_id))
            yield conn


@asynccontextmanager
async def readonly_tenant_conn(tenant_id: str, timeout_ms: int = 5000) -> AsyncIterator[asyncpg.Connection]:
    """Like tenant_conn but the transaction is READ ONLY with a statement timeout.
    Used to execute AI-generated SQL — a hard guarantee it cannot mutate data."""
    async with _app().acquire() as conn:
        async with conn.transaction():
            await conn.execute("SET TRANSACTION READ ONLY")  # must be first statement
            await conn.execute(f"SET LOCAL statement_timeout = {int(timeout_ms)}")
            await conn.execute("SELECT set_config('app.tenant_id', $1, true)", str(tenant_id))
            yield conn
