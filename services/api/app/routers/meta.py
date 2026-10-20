"""Liveness and readiness (gate O1; 12-trd TR-NFR-23).

/health  the process is up. No I/O, so a slow database never gets a healthy
         process restarted.
/ready   it can serve: both database pools answer, Redis answers, and every
         migration file in infra/migrations has been applied (a container
         started against an un-migrated database is not ready). 503 with the
         failing check otherwise. The compose healthcheck and the proxy's
         upstream check use this one.

Both are unauthenticated, unthrottled and left out of the access log; they
say nothing about tenants or versions beyond the migration head.
"""
from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from .. import db, store
from ..config import settings

router = APIRouter(tags=["meta"])

_DEFAULT_MIGRATIONS = Path(__file__).resolve().parents[4] / "infra" / "migrations"


def migrations_dir() -> Path:
    return Path(settings.migrations_dir) if settings.migrations_dir else _DEFAULT_MIGRATIONS


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "business-os-api"}


async def _db_ok(pool_conn) -> bool:
    try:
        async with pool_conn() as conn:
            return await asyncio.wait_for(conn.fetchval("select 1"), timeout=2) == 1
    except Exception:  # noqa: BLE001 — any failure means not ready
        return False


async def _migrations() -> tuple[bool, str | None, list[str]]:
    """(at head, head file, missing files)."""
    folder = migrations_dir()
    files = sorted(p.name for p in folder.glob("*.sql")) if folder.is_dir() else []
    if not files:
        return False, None, ["(no migration files found at MIGRATIONS_DIR)"]
    try:
        async with db.owner_conn() as oc:
            applied = {r["version"] for r in await oc.fetch("select version from schema_migrations")}
    except Exception:  # noqa: BLE001
        return False, files[-1], files
    missing = [f for f in files if f not in applied]
    return not missing, files[-1], missing


@router.get("/ready")
async def ready() -> JSONResponse:
    db_owner, db_app, redis_ok, (mig_ok, head, missing) = await asyncio.gather(
        _db_ok(db.owner_conn), _db_ok(_app_conn), store.ping(), _migrations())
    checks = {"database": db_owner and db_app, "redis": redis_ok, "migrations": mig_ok}
    body = {"status": "ready" if all(checks.values()) else "not_ready", "checks": checks,
            "migration_head": head}
    if missing:
        body["migrations_missing"] = missing[:20]
    return JSONResponse(body, status_code=200 if all(checks.values()) else 503)


def _app_conn():
    # The runtime pool (RLS-enforced role) must answer too, not just the owner's.
    return db._app().acquire()
