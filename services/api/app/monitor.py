"""The worker's own health checks (ops.monitor) and housekeeping (ops.prune).

ops.monitor alerts (app/alerts.py) on:
  * outbox lag — rows due for longer than OUTBOX_LAG_ALERT_MIN that nobody
    has delivered, per kind (the worker is down, stuck, or a provider is);
  * stale jobs — an active job with no success in twice its interval.
Each alert is de-duplicated for an hour, so a lasting problem pings hourly,
not every five minutes.
"""
from __future__ import annotations

import logging

from . import alerts, db
from .config import settings

log = logging.getLogger("monitor")

# Rows that cannot be delivered yet by design are not lag: an FBR row of a
# tenant whose FBR filing is switched off, or a debit note still waiting for
# its sale (the sale's own row is what lags, and is alerted).
_LAG = """
select o.kind, count(*)::int as n,
       extract(epoch from now() - min(o.run_after))::int as oldest_s
  from outbox o
 where o.status in ('pending', 'retry')
   and o.run_after < now() - make_interval(mins => $1)
   and (o.kind not like 'fbr.%'
        or exists (select 1 from fbr_settings s where s.tenant_id = o.tenant_id and s.enabled))
   and (o.depends_on is null
        or exists (select 1 from outbox d where d.id = o.depends_on and d.status = 'done'))
 group by o.kind
 order by o.kind"""

_STALE = """
select code, last_success_at from scheduled_jobs
 where active and status = 'idle'      -- a running job is the reaper's business
   and coalesce(last_success_at, created_at) < now() - run_every * 2 - interval '5 minutes'
 order by code"""


async def outbox_lag() -> list[dict]:
    async with db.owner_conn() as oc:
        rows = await oc.fetch(_LAG, settings.outbox_lag_alert_min)
    for r in rows:
        await alerts.emit(
            "outbox.lag",
            f"{r['n']} {r['kind']} outbox row(s) overdue; oldest waiting {r['oldest_s'] // 60} min",
            severity="error", dedup_key=r["kind"], kind=r["kind"], rows=r["n"], oldest_s=r["oldest_s"])
    return [dict(r) for r in rows]


async def stale_jobs() -> list[str]:
    async with db.owner_conn() as oc:
        rows = await oc.fetch(_STALE)
    for r in rows:
        await alerts.emit("job.stale", f"Job {r['code']} has not succeeded in over twice its interval",
                          severity="warning", dedup_key=r["code"], job=r["code"])
    return [r["code"] for r in rows]


async def check() -> dict:
    return {"outbox_lag": await outbox_lag(), "stale_jobs": await stale_jobs()}


async def prune() -> int:
    """job_runs are kept 90 days (12-trd TR-NFR-15)."""
    async with db.owner_conn() as oc:
        status = await oc.execute("delete from job_runs where started_at < now() - interval '90 days'")
    return int(status.split()[-1])
