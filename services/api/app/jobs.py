"""Background jobs, run by the worker process (D-08, gate I6, migration 0043).

The API process runs no scheduler. `python -m app.worker` (app/worker.py)
polls `scheduled_jobs` and runs what is due. The rules:

- A due job is claimed in its own committed transaction (`for update skip
  locked`, status -> running, locked_until = now() + timeout_s) before it
  runs, so however many worker loops or processes there are, each due run
  happens once. A worker that finds the row locked skips it, never waits.
- next_run_at moves one interval ahead at claim; a `job_triggers` row makes
  a job due early and is consumed by the claim.
- A run is bounded by timeout_s. A failure (exception or timeout) adds to
  failure_count; success clears it. At max_failures the job is switched off
  and `job.disabled` is alerted. `python -m app.worker --enable CODE` (or
  `enable()`) turns it back on.
- reap(): a row still `running` past locked_until belonged to a worker that
  died. It goes back to idle with a failure counted; its run is `timeout`.
  A late finish from that worker is ignored (current_run_id moved on).

The jobs themselves fan out per tenant through tenant_conn (RLS-correct) and
keep going past one bad tenant.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Awaitable, Callable

from . import alerts, db, email, fbr_submit, monitor, notifications, obs
from .routers.pos import _VELOCITY_SQL

log = logging.getLogger("jobs")


# ── The jobs ────────────────────────────────────────────────────────────────
async def _active_tenants() -> list[str]:
    async with db.owner_conn() as oc:
        return [str(r["id"]) for r in await oc.fetch("select id from tenants where status='active'")]


async def _owner_user(conn) -> str | None:
    uid = await conn.fetchval("select u.id from users u join roles r on r.id=u.role_id where r.name='Owner' limit 1")
    return str(uid) if uid else None


async def run_followup_reminders() -> int:
    """A due next_follow_up_at notifies the lead owner (once)."""
    fired = 0
    for tid in await _active_tenants():
        try:
            async with db.tenant_conn(tid) as conn:
                due = await conn.fetch(
                    """select i.id, l.name, l.owner_id
                       from crm_interactions i join crm_leads l on l.id = i.lead_id
                       where i.next_follow_up_at is not null and not i.reminder_sent
                         and i.next_follow_up_at <= now() + interval '15 minutes'
                         and i.next_follow_up_at >= now() - interval '2 days'""")
                for r in due:
                    recipient = str(r["owner_id"]) if r["owner_id"] else await _owner_user(conn)
                    if recipient:
                        await notifications.create(conn, user_id=recipient, kind="warning",
                                                   title=f"Follow-up due: {r['name']}", link="/crm")
                        fired += 1
                    await conn.execute("update crm_interactions set reminder_sent=true where id=$1", r["id"])
        except Exception:
            log.exception("follow-up reminders failed for tenant %s", tid)
    return fired


async def run_restock_alerts() -> int:
    """Daily velocity check: tell the owner what is running out."""
    fired = 0
    for tid in await _active_tenants():
        try:
            async with db.tenant_conn(tid) as conn:
                names = []
                for r in await conn.fetch(_VELOCITY_SQL):
                    stock, low_at, sold = float(r["stock_qty"]), float(r["low_stock_at"]), float(r["sold_30d"])
                    vel = sold / 30.0
                    if (vel > 0 and stock / vel < 10) or (low_at > 0 and stock <= low_at):
                        names.append(r["name"])
                if names:
                    owner = await _owner_user(conn)
                    if owner:
                        body = ", ".join(names[:3]) + (f" +{len(names) - 3} more" if len(names) > 3 else "")
                        await notifications.create(conn, user_id=owner, kind="warning",
                                                   title=f"{len(names)} item(s) need restocking", body=body,
                                                   link="/pos/insights")
                        fired += 1
        except Exception:
            log.exception("restock alerts failed for tenant %s", tid)
    return fired


# code -> handler. Every row in scheduled_jobs has one here and vice versa
# (tests/core/test_worker.py); a new job is a seed row in a migration plus a
# line here.
HANDLERS: dict[str, Callable[[], Awaitable[Any]]] = {
    "fbr.outbox": fbr_submit.process_outbox,
    "email.outbox": email.process_outbox,
    "crm.followup_reminders": run_followup_reminders,
    "pos.restock_alerts": run_restock_alerts,
    "ops.monitor": monitor.check,
    "ops.prune": monitor.prune,
}


# ── Claiming, finishing, reaping (owner connection) ─────────────────────────
_CLAIM = """
with due as (
    select j.code from scheduled_jobs j
     where j.active and j.status = 'idle'
       and (j.next_run_at <= now()
            or exists (select 1 from job_triggers t where t.job_code = j.code and t.run_at <= now()))
       and ($1::text[] is null or j.code = any($1::text[]))
     order by j.failure_count, j.priority, j.next_run_at
     limit $2
     for update of j skip locked)
update scheduled_jobs j
   set status = 'running', worker = $3, last_run_at = now(),
       locked_until = now() + make_interval(secs => j.timeout_s),
       next_run_at = now() + j.run_every, updated_at = now()
  from due
 where j.code = due.code
returning j.code, j.timeout_s"""


async def claim(worker: str, only: list[str] | None = None, limit: int = 20) -> list[dict]:
    """Take due jobs for this worker, committed before any of them runs."""
    out = []
    async with db.owner_conn() as oc, oc.transaction():
        for r in await oc.fetch(_CLAIM, only, limit, worker):
            run_id = await oc.fetchval(
                "insert into job_runs (job_code, worker) values ($1, $2) returning id", r["code"], worker)
            await oc.execute("update scheduled_jobs set current_run_id = $2 where code = $1", r["code"], run_id)
            await oc.execute("delete from job_triggers where job_code = $1 and run_at <= now()", r["code"])
            out.append({"code": r["code"], "run_id": run_id, "timeout_s": r["timeout_s"], "worker": worker})
    return out


_FAILED = """
update scheduled_jobs
   set status = 'idle', locked_until = null, current_run_id = null,
       failure_count = failure_count + 1,
       first_failure_at = coalesce(first_failure_at, now()),
       active = active and failure_count + 1 < max_failures,
       disabled_reason = case when failure_count + 1 >= max_failures then left($3, 500)
                              else disabled_reason end,
       updated_at = now()
 where code = $1 and current_run_id = $2
returning code, failure_count, (active = false and failure_count = max_failures) as just_disabled"""


def _jsonable(value: Any) -> Any:
    return value if isinstance(value, (dict, list, int, float, str, bool, type(None))) else str(value)


async def finish(c: dict, *, ok: bool, error: str = "", result: Any = None, timed_out: bool = False) -> None:
    """Record a run's outcome. Does nothing if the run was already reaped."""
    status = "done" if ok else ("timeout" if timed_out else "failed")
    async with db.owner_conn() as oc, oc.transaction():
        await oc.execute(
            """update job_runs set finished_at = now(), status = $2, result = $3, error = $4
                where id = $1 and status = 'running'""",
            c["run_id"], status, _jsonable(result), error[:2000])
        if ok:
            await oc.execute(
                """update scheduled_jobs
                      set status = 'idle', locked_until = null, current_run_id = null,
                          failure_count = 0, first_failure_at = null, last_success_at = now(),
                          updated_at = now()
                    where code = $1 and current_run_id = $2""", c["code"], c["run_id"])
            return
        row = await oc.fetchrow(_FAILED, c["code"], c["run_id"], error)
    if row and row["just_disabled"]:
        etype = "Timeout" if timed_out else error.split(":", 1)[0].strip()[:60]
        await _disabled_alert(c["code"], row["failure_count"], etype, error)


async def _release(c: dict) -> None:
    """The worker is stopping mid-run: hand the job back, due now, without
    counting a failure."""
    async with db.owner_conn() as oc, oc.transaction():
        await oc.execute(
            """update job_runs set finished_at = now(), status = 'failed', error = 'worker stopped'
                where id = $1 and status = 'running'""", c["run_id"])
        await oc.execute(
            """update scheduled_jobs set status = 'idle', locked_until = null, current_run_id = null,
                      next_run_at = now(), updated_at = now()
                where code = $1 and current_run_id = $2""", c["code"], c["run_id"])


async def _disabled_alert(code: str, failures: int, error_type: str, error: str) -> None:
    # The error text stays in the log (redacted); the alert carries its type.
    log.error("job %s switched off after %d failures in a row: %s", code, failures, error)
    await alerts.emit("job.disabled", f"Job {code} was switched off after {failures} failures in a row ({error_type})",
                      severity="critical", job=code, failures=failures, error_type=error_type)


async def reap() -> list[str]:
    """Free jobs whose worker died mid-run (running past locked_until)."""
    async with db.owner_conn() as oc, oc.transaction():
        rows = await oc.fetch(
            """with stale as (
                   select code, current_run_id from scheduled_jobs
                    where status = 'running' and locked_until < now()
                    for update skip locked)
               update scheduled_jobs j
                  set status = 'idle', locked_until = null, current_run_id = null,
                      failure_count = j.failure_count + 1,
                      first_failure_at = coalesce(j.first_failure_at, now()),
                      active = j.active and j.failure_count + 1 < j.max_failures,
                      disabled_reason = case when j.failure_count + 1 >= j.max_failures
                                             then 'Timed out: its worker stopped responding'
                                             else j.disabled_reason end,
                      updated_at = now()
                 from stale
                where j.code = stale.code
            returning j.code, j.failure_count, stale.current_run_id as run_id,
                      (j.active = false and j.failure_count = j.max_failures) as just_disabled""")
        if rows:
            await oc.execute(
                """update job_runs set status = 'timeout', finished_at = now(),
                          error = 'reaped: the worker running it stopped responding'
                    where id = any($1::bigint[]) and status = 'running'""",
                [r["run_id"] for r in rows if r["run_id"] is not None])
    for r in rows:
        log.warning("reaped job %s (run %s): its worker stopped responding", r["code"], r["run_id"])
        if r["just_disabled"]:
            await _disabled_alert(r["code"], r["failure_count"], "WorkerLost", "its worker stopped responding")
    return [r["code"] for r in rows]


# ── Running ─────────────────────────────────────────────────────────────────
async def execute(c: dict) -> None:
    """Run one claimed job to completion, failure or timeout. Never raises
    (except cancellation, after handing the job back)."""
    obs.bind(job_code=c["code"], job_run_id=c["run_id"], actor_kind="job")
    handler = HANDLERS.get(c["code"])
    if handler is None:
        await finish(c, ok=False, error=f"no handler registered for {c['code']}")
        return
    try:
        result = await asyncio.wait_for(handler(), timeout=c["timeout_s"])
    except asyncio.TimeoutError:
        log.error("job %s timed out after %ss", c["code"], c["timeout_s"])
        await finish(c, ok=False, timed_out=True, error=f"timed out after {c['timeout_s']}s")
    except asyncio.CancelledError:
        await asyncio.shield(_release(c))
        raise
    except Exception as e:  # noqa: BLE001 — a failing job is recorded, never fatal to the worker
        log.exception("job %s failed", c["code"])
        await finish(c, ok=False, error=f"{type(e).__name__}: {e}")
    else:
        await finish(c, ok=True, result=result)


async def run_due(worker: str, only: list[str] | None = None) -> list[str]:
    """One pass: reap, claim everything due, run it all, wait. Returns the
    codes run. (The long-running worker loop spawns instead of waiting.)"""
    await reap()
    claimed = await claim(worker, only)
    await asyncio.gather(*(obs.in_new_context(execute(c)) for c in claimed))
    return [c["code"] for c in claimed]


# ── Operations ──────────────────────────────────────────────────────────────
async def trigger(code: str) -> None:
    """Make a job due now (it still waits for any run in progress)."""
    async with db.owner_conn() as oc:
        await oc.execute("insert into job_triggers (job_code) values ($1)", code)


async def enable(code: str) -> bool:
    """Turn a switched-off job back on, with a clean failure count, due now."""
    async with db.owner_conn() as oc:
        return bool(await oc.fetchval(
            """update scheduled_jobs set active = true, failure_count = 0, first_failure_at = null,
                      disabled_reason = '', next_run_at = now(), updated_at = now()
                where code = $1 returning code""", code))
