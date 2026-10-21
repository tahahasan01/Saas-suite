"""Database pools and the RLS-aware tenant connection helper.

Two pools by design (see migration 0001 header):
  * owner_pool  — connects as the table owner; RLS does NOT apply. Used ONLY for
                  operations that have no tenant context yet: signup and
                  login-by-email lookups.
  * app_pool    — connects as the non-owner `app_user`; RLS IS enforced. Every
                  tenant request runs inside `tenant_conn()`, which opens a
                  transaction and sets `app.tenant_id` so RLS filters all rows.
                  `ai_conn()` borrows the same pool and drops to `ai_reader`.
"""
from __future__ import annotations

import json
from contextlib import asynccontextmanager
from typing import AsyncIterator

import asyncpg

from . import context
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


async def _use_tenant_clock(conn: asyncpg.Connection) -> None:
    """Run this transaction in the tenant's timezone (D-11): current_date,
    now()::date and timestamp-to-date casts become the tenant's local day.
    Reads the tenant row through RLS, so app.tenant_id must already be set.

    Also sets `app.branch_ids` for the restrictive branch policy (D-03,
    migration 0055): '*' when no user is acting (jobs, scripts, signup), else
    the user's branches narrowed by X-Branch-Ids. Same statement, no extra
    round trip."""
    user_id, requested = context.branch_request()
    await conn.execute(
        """select set_config('TimeZone',
                  coalesce((select timezone from tenants
                             where id = current_setting('app.tenant_id', true)::uuid),
                           'Asia/Karachi'), true),
                  set_config('app.branch_ids',
                  case when $1::uuid is null then '*'
                       else bos_session_branches(current_setting('app.tenant_id', true)::uuid,
                                                 $1::uuid, $2::text[]) end, true)""",
        user_id, requested)


_SET_CONTEXT = """
select set_config('app.actor_id', $1, true), set_config('app.request_id', $2, true),
       set_config('app.actor_kind', $3, true)"""


async def apply_context(conn: asyncpg.Connection) -> None:
    """Stamp the current request/job context (app/context.py) on this
    transaction, for the audit trigger. tenant_conn does it for you; call it
    yourself only inside an owner-connection transaction (e.g. the worker)."""
    await conn.execute(_SET_CONTEXT, *context.gucs())


@asynccontextmanager
async def tenant_conn(tenant_id: str) -> AsyncIterator[asyncpg.Connection]:
    """Runtime connection scoped to a tenant. Opens a transaction and sets the
    `app.tenant_id` GUC locally so Row-Level Security filters every query,
    plus who is acting (app.actor_id / request_id / actor_kind) for audit."""
    actor_id, request_id, actor_kind = context.gucs()
    async with _app().acquire() as conn:
        async with conn.transaction():
            # is_local = true -> reset at end of transaction
            await conn.execute(
                """select set_config('app.tenant_id', $1, true), set_config('app.actor_id', $2, true),
                          set_config('app.request_id', $3, true), set_config('app.actor_kind', $4, true)""",
                str(tenant_id), actor_id, request_id, actor_kind)
            await _use_tenant_clock(conn)
            yield conn


@asynccontextmanager
async def job_conn(tenant_id: str, job: str, run_id: str | None = None) -> AsyncIterator[asyncpg.Connection]:
    """A tenant connection for a worker job (D-08, TRD TR-SEC-09): RLS as
    usual, and audit rows read actor_kind 'job', request_id 'job:<job>:<run_id>'."""
    with context.job(job, run_id):
        async with tenant_conn(tenant_id) as conn:
            yield conn


@asynccontextmanager
async def ai_conn(tenant_id: str, timeout_ms: int = 5000) -> AsyncIterator[asyncpg.Connection]:
    """Connection for executing AI-generated SQL (TR-SEC-10).

    A READ ONLY transaction with short timeouts, pinned to the tenant, that
    then drops to `ai_reader` (migration 0032): that role can read the ai_v_*
    views and nothing else, and cannot call set_config(), so even SQL that got
    past the validator can't write, read a base table or switch tenant. Every
    setting is transaction-local, so the pooled connection comes back clean.
    """
    async with _app().acquire() as conn:
        async with conn.transaction(readonly=True):
            await conn.execute(f"SET LOCAL statement_timeout = {int(timeout_ms)}")
            await conn.execute("SET LOCAL lock_timeout = 1000")
            await conn.execute("SET LOCAL idle_in_transaction_session_timeout = 10000")
            await conn.execute("SELECT set_config('app.tenant_id', $1, true)", str(tenant_id))
            await _use_tenant_clock(conn)
            # Last: ai_reader may not call set_config, so everything above
            # has to happen while still app_user.
            await conn.execute("SET LOCAL ROLE ai_reader")
            yield conn
