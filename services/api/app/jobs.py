"""Proactive background scheduler — the vision's "AI pops up a notification."

Runs per-tenant (RLS-correct via tenant_conn):
  * follow-up reminders — a due next_follow_up_at notifies the lead owner (once)
  * restock alerts — daily velocity check notifies the owner what's running out

Single-instance by design; disable on extra replicas via ENABLE_SCHEDULER=false
(or move to a dedicated worker) so notifications aren't duplicated.
"""
from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from . import db, fbr_submit, notifications
from .routers.pos import _VELOCITY_SQL

log = logging.getLogger("jobs")
_scheduler: AsyncIOScheduler | None = None


async def _active_tenants() -> list[str]:
    async with db.owner_conn() as oc:
        return [str(r["id"]) for r in await oc.fetch("select id from tenants where status='active'")]


async def _owner_user(conn) -> str | None:
    uid = await conn.fetchval("select u.id from users u join roles r on r.id=u.role_id where r.name='Owner' limit 1")
    return str(uid) if uid else None


async def run_followup_reminders() -> int:
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


def start() -> None:
    global _scheduler
    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(run_followup_reminders, "interval", minutes=5, id="followups")
    _scheduler.add_job(run_restock_alerts, "interval", hours=24, id="restock")
    # FBR filings that did not land at the till. Frequent, because an unfiled
    # invoice is a compliance liability until it is filed.
    _scheduler.add_job(fbr_submit.retry_pending, "interval", minutes=2, id="fbr_retry")
    _scheduler.start()
    log.info("proactive scheduler started")


def stop() -> None:
    if _scheduler:
        _scheduler.shutdown(wait=False)
