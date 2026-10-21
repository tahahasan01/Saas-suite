"""Module state per tenant (migration 0052): enable, disable, purge.

Everything here runs inside the caller's transaction, under RLS, except
`bootstrap` (signup's owner transaction) and `run_due_purges` (the worker).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import asyncpg
from fastapi import HTTPException, status

from .. import audit, billing, context, db
from ..models import SECTIONS
from . import MODULES, EnablePlan, dependents, plan_enable

log = logging.getLogger("modules")

PURGE_DELAY = timedelta(days=7)


async def states(conn: asyncpg.Connection) -> dict[str, tuple[str, str]]:
    """module_key -> (state, reason) for the tenant in context."""
    return {r["module_key"]: (r["state"], r["reason"]) for r in await conn.fetch(
        "select module_key, state, reason from tenant_modules")}


def enabled_of(st: dict[str, tuple[str, str]]) -> set[str]:
    return {k for k, (s, _) in st.items() if s == "enabled" and k in MODULES} | {
        k for k, m in MODULES.items() if m.always_on}


async def max_apps(conn: asyncpg.Connection) -> int:
    sub = await conn.fetchrow(
        "select * from subscriptions where tenant_id = current_setting('app.tenant_id')::uuid")
    return int(billing.effective_limits(sub)["max_sections"])


def _known(key: str) -> None:
    if key not in MODULES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown module: {key}")


def _reason(key: str, requested: str) -> str:
    if key == requested:
        return "user"
    return "auto" if MODULES[key].auto_enable else "dependency"


async def _upsert(conn: asyncpg.Connection, keys: list[str], requested: str, user_id: str | None) -> None:
    for k in keys:
        await conn.execute(
            """insert into tenant_modules (tenant_id, module_key, state, reason, enabled_by)
               values (current_setting('app.tenant_id')::uuid, $1, 'enabled', $2, $3)
               on conflict (tenant_id, module_key) do update
                  set state = 'enabled', reason = excluded.reason, enabled_by = excluded.enabled_by,
                      changed_at = now()""",
            k, _reason(k, requested), user_id if k == requested else None)
    # Turning a module back on cancels any purge still waiting (D-02).
    await conn.execute(
        """update module_purges set status = 'cancelled', finished_at = now()
            where status = 'pending' and module_key = any($1::text[])""", keys)


async def enable(conn: asyncpg.Connection, key: str, *, user_id: str | None,
                 dry_run: bool = False, limit_status: int = status.HTTP_402_PAYMENT_REQUIRED) -> EnablePlan:
    _known(key)
    st = await states(conn)
    plan = plan_enable(key, enabled=enabled_of(st), max_apps=await max_apps(conn))
    if dry_run:
        return plan
    if plan.violations:
        raise HTTPException(limit_status, plan.violations[0])
    if plan.to_enable:
        await _upsert(conn, plan.to_enable, key, user_id)
        await audit.event(conn, "module.enable", "module", key, data={"enabled": plan.to_enable})
    return plan


def _auto_managed(key: str, reason: str | None) -> bool:
    """Follows its dependencies off without asking: link/auto modules, and
    supporting modules that came on as a dependency."""
    m = MODULES[key]
    return bool(m.auto_enable) or (not m.application and reason != "user")


async def plan_disable(conn: asyncpg.Connection, key: str) -> tuple[list[str], list[str]]:
    """(everything that goes off, the enabled dependents that need cascade)."""
    _known(key)
    st = await states(conn)
    on = enabled_of(st)
    deps = dependents(key, enabled=on)
    blocked = [d for d in deps if not _auto_managed(d, st.get(d, (None, None))[1])]
    return [key, *deps], blocked


async def disable(conn: asyncpg.Connection, key: str, *, cascade: bool = False,
                  dry_run: bool = False) -> tuple[list[str], list[str]]:
    _known(key)
    if MODULES[key].always_on:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{MODULES[key].label} is always on")
    to_disable, blocked = await plan_disable(conn, key)
    if dry_run:
        return to_disable, blocked
    if blocked and not cascade:
        names = ", ".join(blocked)
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"Turn off {names} first, or disable with cascade (these modules need {key})")
    # Data stays (D-02): only the state flips; routes then answer 403.
    await conn.execute(
        """update tenant_modules set state = 'disabled', changed_at = now()
            where module_key = any($1::text[]) and state <> 'disabled'""", to_disable)
    if key not in (await states(conn)):  # never had a row (e.g. an app never turned on)
        await conn.execute(
            """insert into tenant_modules (tenant_id, module_key, state)
               values (current_setting('app.tenant_id')::uuid, $1, 'disabled')
               on conflict do nothing""", key)
    await audit.event(conn, "module.disable", "module", key, data={"disabled": to_disable})
    return to_disable, blocked


async def bootstrap(conn: asyncpg.Connection, tenant_id: str, apps: list[str]) -> None:
    """Signup, inside its owner transaction: the chosen apps on, the rest
    off, plus every supporting and link module the apps need."""
    for section in SECTIONS:   # the entitlements trigger mirrors these into tenant_modules
        await conn.execute(
            "insert into entitlements (tenant_id, section_key, enabled) values ($1,$2,$3)",
            tenant_id, section, section in apps)
    on = {k for k, m in MODULES.items() if m.always_on} | set(apps)
    extra: list[tuple[str, str]] = []
    for app in apps:
        plan = plan_enable(app, enabled=on - {app})
        for k in plan.to_enable:
            if k not in on:
                on.add(k)
                extra.append((k, "auto" if MODULES[k].auto_enable else "dependency"))
    for k, reason in extra:
        await conn.execute(
            """insert into tenant_modules (tenant_id, module_key, state, reason)
               values ($1, $2, 'enabled', $3) on conflict (tenant_id, module_key) do nothing""",
            tenant_id, k, reason)


# ── Purge (separate, delayed, typed confirmation) ───────────────────────────
def confirmation_for(key: str) -> str:
    return f"DELETE {key}"


async def request_purge(conn: asyncpg.Connection, key: str, *, confirm: str,
                        user_id: str | None) -> dict[str, Any]:
    _known(key)
    m = MODULES[key]
    if not m.purge_tables:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{m.label} has no data to purge")
    st = await states(conn)
    if st.get(key, ("disabled", ""))[0] != "disabled":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Turn {m.label} off before purging its data")
    if confirm.strip() != confirmation_for(key):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            f'Type "{confirmation_for(key)}" to confirm')
    run_after = datetime.now(timezone.utc) + PURGE_DELAY
    try:
        row = await conn.fetchrow(
            """insert into module_purges (tenant_id, module_key, requested_by, run_after)
               values (current_setting('app.tenant_id')::uuid, $1, $2, $3)
               returning status, run_after""", key, user_id, run_after)
    except asyncpg.UniqueViolationError:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A purge of {m.label} is already scheduled")
    await audit.event(conn, "module.purge_requested", "module", key, data={"run_after": run_after.isoformat()})
    return {"module": key, "status": row["status"], "run_after": row["run_after"]}


async def run_due_purges() -> int:
    """Worker job `modules.purge`: carry out each due purge whose module is
    still off; one tenant's failure is recorded and never stops the rest."""
    done = 0
    async with db.owner_conn() as oc:
        due = await oc.fetch(
            "select id, tenant_id, module_key from module_purges where status = 'pending' and run_after <= now()")
    for row in due:
        with context.job("modules.purge"):
            async with db.owner_conn() as conn, conn.transaction():
                await db.apply_context(conn)
                locked = await conn.fetchrow(
                    "select status from module_purges where id = $1 for update skip locked", row["id"])
                if locked is None or locked["status"] != "pending":
                    continue
                state = await conn.fetchval(
                    "select state from tenant_modules where tenant_id = $1 and module_key = $2",
                    row["tenant_id"], row["module_key"])
                if state == "enabled":
                    await conn.execute(
                        "update module_purges set status='cancelled', finished_at=now() where id=$1", row["id"])
                    continue
                spec = MODULES.get(row["module_key"])
                result: dict[str, int] = {}
                try:
                    async with conn.transaction():
                        for table in (spec.purge_tables if spec else ()):
                            # Table names come from the manifests, never from input.
                            tag = await conn.execute(f"delete from {table} where tenant_id = $1", row["tenant_id"])
                            result[table] = int(tag.split()[-1])
                except asyncpg.PostgresError as e:
                    log.exception("module purge %s failed", row["id"])
                    await conn.execute(
                        "update module_purges set status='failed', finished_at=now(), error=$2 where id=$1",
                        row["id"], type(e).__name__)
                    continue
                await conn.execute(
                    "update module_purges set status='done', finished_at=now(), result=$2 where id=$1",
                    row["id"], result)
                done += 1
    return done
