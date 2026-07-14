"""Cross-module overview — the one screen where "all-in-one" is visible.

Unlike the per-module /summary endpoints, this reads every section the tenant
has enabled in a single round trip, so the dashboard never has to fan out.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from .. import db
from ..deps import AuthContext, current_auth
from ..models import ActivityItem, Alert, DashboardOverview, Kpi, StageSlice, TrendPoint

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

TREND_DAYS = 14

# generate_series keeps zero-days in the result so a quiet day plots as a real
# zero instead of being dropped and silently compressing the x-axis.
_REVENUE_TREND = """
select d::date as day, coalesce(sum(s.total_minor), 0)::bigint as value
  from generate_series(current_date - ($1::int - 1), current_date, interval '1 day') d
  left join pos_sales s on s.created_at::date = d::date
 group by d order by d
"""

_LEADS_TREND = """
select d::date as day, count(l.id)::bigint as value
  from generate_series(current_date - ($1::int - 1), current_date, interval '1 day') d
  left join crm_leads l on l.created_at::date = d::date
 group by d order by d
"""

# Pipeline by stage — "where is my money sitting?", which is the question the
# dashboard could not answer. Kept as value AND count per stage: a stage can hold
# one huge deal or twenty small ones, and those are different problems.
#
# left join so an empty stage plots as a real zero rather than vanishing — a
# missing "Proposal sent" column reads as "no such stage", not "nothing in it".
# 'lost' is excluded: it isn't pipeline, and including it would dominate the
# axis for anyone with a long history.
_PIPELINE = """
select s.name, s.kind,
       count(l.id)::bigint as count,
       coalesce(sum(l.value_minor), 0)::bigint as value
  from crm_stages s
  left join crm_leads l on l.stage_id = s.id
 where s.kind <> 'lost'
 group by s.id, s.name, s.kind, s.position
 order by s.position
"""

_CRM = """
select count(*) filter (where s.kind = 'active') as open_leads,
       coalesce(sum(l.value_minor) filter (
         where s.kind = 'won' and l.updated_at >= date_trunc('month', current_date)), 0) as won_mtd,
       coalesce(sum(l.value_minor) filter (
         where s.kind = 'won'
           and l.updated_at >= date_trunc('month', current_date) - interval '1 month'
           and l.updated_at <  date_trunc('month', current_date)), 0) as won_prev,
       count(*) filter (
         where s.kind = 'active'
           and not exists (select 1 from crm_interactions i
                            where i.lead_id = l.id and i.created_at > now() - interval '7 days')
       ) as stale
  from crm_leads l join crm_stages s on s.id = l.stage_id
"""

_POS = """
select (select coalesce(sum(total_minor), 0) from pos_sales
         where created_at::date = current_date) as rev_today,
       (select coalesce(sum(total_minor), 0) from pos_sales
         where created_at::date = current_date - 1) as rev_yday,
       (select count(*) from pos_sales where created_at::date = current_date) as sales_today,
       (select count(*) from pos_products
         where active and low_stock_at > 0 and stock_qty <= low_stock_at) as low_stock
"""

_HRMS = """
select (select count(*) from hrms_employees where status = 'active') as headcount,
       (select count(*) from hrms_attendance
         where work_date = current_date and check_in is not null) as present,
       (select count(*) from hrms_leave_requests where status = 'pending') as pending_leaves
"""

_ACTIVITY = """
select a.action, a.entity, u.name as actor, a.created_at
  from audit_log a left join users u on u.id = a.actor_id
 order by a.created_at desc limit 8
"""


def _delta(current: int, previous: int) -> float | None:
    """Percent change, or None when there is no baseline to compare against."""
    if previous <= 0:
        return None
    return round((current - previous) / previous * 100, 1)


@router.get("/overview", response_model=DashboardOverview)
async def overview(auth: AuthContext = Depends(current_auth)) -> DashboardOverview:
    kpis: list[Kpi] = []
    alerts: list[Alert] = []
    revenue: list[TrendPoint] = []
    leads: list[TrendPoint] = []
    pipeline: list[StageSlice] = []

    async with db.tenant_conn(auth.tenant_id) as conn:
        enabled = {
            r["section_key"]
            for r in await conn.fetch(
                "select section_key from entitlements where tenant_id=$1 and enabled",
                auth.tenant_id,
            )
        }

        if "crm" in enabled:
            c = await conn.fetchrow(_CRM)
            leads = [TrendPoint(day=r["day"], value=r["value"])
                     for r in await conn.fetch(_LEADS_TREND, TREND_DAYS)]
            pipeline = [StageSlice(name=r["name"], kind=r["kind"], count=r["count"], value=r["value"])
                        for r in await conn.fetch(_PIPELINE)]
            kpis += [
                Kpi(key="open_leads", label="Open leads", value=c["open_leads"],
                    kind="count", href="/crm"),
                Kpi(key="won_mtd", label="Won this month", value=c["won_mtd"], kind="money",
                    delta_pct=_delta(c["won_mtd"], c["won_prev"]), href="/crm"),
            ]
            if c["stale"]:
                alerts.append(Alert(text=f"{c['stale']} open leads have had no contact in 7 days",
                                    href="/crm", tone="warning"))

        if "pos" in enabled:
            p = await conn.fetchrow(_POS)
            revenue = [TrendPoint(day=r["day"], value=r["value"])
                       for r in await conn.fetch(_REVENUE_TREND, TREND_DAYS)]
            kpis += [
                Kpi(key="rev_today", label="Revenue today", value=p["rev_today"], kind="money",
                    delta_pct=_delta(p["rev_today"], p["rev_yday"]), href="/pos"),
                Kpi(key="sales_today", label="Sales today", value=p["sales_today"],
                    kind="count", href="/pos"),
            ]
            if p["low_stock"]:
                alerts.append(Alert(text=f"{p['low_stock']} products are at or below their stock line",
                                    href="/pos/products", tone="danger"))

        if "hrms" in enabled:
            h = await conn.fetchrow(_HRMS)
            kpis += [
                Kpi(key="present", label="Present today", value=h["present"],
                    kind="count", href="/hrms/attendance"),
                Kpi(key="headcount", label="Headcount", value=h["headcount"],
                    kind="count", href="/hrms"),
            ]
            if h["pending_leaves"]:
                alerts.append(Alert(text=f"{h['pending_leaves']} leave requests need approval",
                                    href="/hrms/leave", tone="warning"))

        activity = [ActivityItem(action=r["action"], entity=r["entity"], actor=r["actor"],
                                 created_at=r["created_at"])
                    for r in await conn.fetch(_ACTIVITY)]

    return DashboardOverview(sections=sorted(enabled), kpis=kpis, revenue_trend=revenue,
                             leads_trend=leads, pipeline=pipeline, alerts=alerts, activity=activity)
