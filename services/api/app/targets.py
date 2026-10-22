"""Sales targets and the forecast (wave D, C16/C17, migration 0123; study 12 §4).

Targets: an amount for a month, for one rep or the company, on one of
three measures. Progress is worked out when read, on the tenant's own
calendar (tenant_conn sets the session time zone):

* won_value  deals won in the month, by their owner;
* invoiced   invoices issued in the month, less credit notes, credited to
             the deal's owner (or whoever raised the invoice);
* collected  payments dated in the month, credited the same way.

Forecast: open deals in the month they're expected to close, at value x
probability (weighted) and at full value (best case), beside what was won.
Deals whose date has passed and deals with no date get their own buckets
instead of quietly dropping out (study 12: a weakness of the reference).
The forecast follows the caller's lead scope.
"""
from __future__ import annotations

from datetime import date
from typing import Any

import asyncpg
from fastapi import HTTPException, status

from . import leads, rbac, scopes, sequences
from .crm_selling_models import ForecastBucket, ForecastDeal, ForecastOut, TargetOut
from .deps import AuthContext


def first_of(month: str) -> date:
    y, m = month.split("-")
    return date(int(y), int(m), 1)


def add_months(d: date, n: int) -> date:
    m = d.month - 1 + n
    return date(d.year + m // 12, m % 12 + 1, 1)


def _half_up_div(n: int, d: int) -> int:
    q, r = divmod(n, d)
    return q + (1 if 2 * r >= d else 0)


def pace(amount: int, start: date, today: date) -> int:
    """Where an even pace would be by today: all of a past month, none of a future one."""
    end = add_months(start, 1)
    if today >= end:
        return amount
    if today < start:
        return 0
    return _half_up_div(amount * ((today - start).days + 1), (end - start).days)


_ACHIEVED = {
    "won_value": """select coalesce(sum(value_minor), 0) from crm_leads
                     where status = 'won' and won_at >= $1 and won_at < $2
                       and ($3::uuid is null or owner_id = $3)""",
    "invoiced": """select coalesce(sum(i.total_minor - i.credited_minor), 0) from invoices i
                     left join crm_leads l on l.id = i.lead_id
                    where i.kind = 'invoice' and i.status in ('issued', 'partially_paid', 'paid')
                      and i.issue_date >= $1 and i.issue_date < $2
                      and ($3::uuid is null or coalesce(l.owner_id, i.requested_by) = $3)""",
    "collected": """select coalesce(sum(p.amount_minor), 0) from invoice_payments p
                      join invoices i on i.id = p.invoice_id
                      left join crm_leads l on l.id = i.lead_id
                     where p.paid_on >= $1 and p.paid_on < $2
                       and ($3::uuid is null or coalesce(l.owner_id, i.requested_by) = $3)""",
}


async def for_month(conn: asyncpg.Connection, month: str) -> list[TargetOut]:
    start = first_of(month)
    end = add_months(start, 1)
    today = await sequences.local_date(conn, None)
    rows = await conn.fetch(
        """select t.*, u.name as user_name from crm_targets t left join users u on u.id = t.user_id
            where t.month = $1 order by t.user_id is not null, u.name, t.metric""", start)
    out = []
    for r in rows:
        achieved = int(await conn.fetchval(_ACHIEVED[r["metric"]], start, end, r["user_id"]))
        out.append(TargetOut(
            id=str(r["id"]), month=month, user_id=str(r["user_id"]) if r["user_id"] else None,
            user_name=r["user_name"], metric=r["metric"], amount_minor=r["amount_minor"], achieved_minor=achieved,
            percent=achieved * 100 // r["amount_minor"], pace_minor=pace(r["amount_minor"], start, today)))
    return out


async def upsert(conn: asyncpg.Connection, tenant_id: str, actor: str, month: str, metric: str, amount: int,
                 user_id: Any) -> str:
    if user_id is not None and not await conn.fetchval("select 1 from users where id = $1", user_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    tid = await conn.fetchval(
        """insert into crm_targets (tenant_id, month, user_id, metric, amount_minor, created_by)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (tenant_id, month, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), metric)
           do update set amount_minor = excluded.amount_minor, updated_at = now()
           returning id""", tenant_id, first_of(month), user_id, metric, amount, actor)
    return str(tid)


async def copy(conn: asyncpg.Connection, tenant_id: str, actor: str, src: str, dst: str) -> int:
    """Last month's targets into another month; ones already set there are kept."""
    n: int = await conn.fetchval(
        """with ins as (
             insert into crm_targets (tenant_id, month, user_id, metric, amount_minor, created_by)
             select $1, $3, user_id, metric, amount_minor, $4 from crm_targets where month = $2
             on conflict do nothing returning 1)
           select count(*) from ins""", tenant_id, first_of(src), first_of(dst), actor)
    return n


# ── Forecast ────────────────────────────────────────────────────────────────
def _deal(r: asyncpg.Record) -> ForecastDeal:
    return ForecastDeal(id=str(r["id"]), name=r["name"], owner_id=str(r["owner_id"]) if r["owner_id"] else None,
                        value_minor=r["value_minor"], probability=r["probability"],
                        weighted_minor=leads.weighted(r["value_minor"], r["probability"]),
                        expected_close_date=r["expected_close_date"])


def _add(b: ForecastBucket, r: asyncpg.Record) -> None:
    d = _deal(r)
    b.weighted_minor += d.weighted_minor
    b.best_case_minor += d.value_minor
    b.open_count += 1
    b.deals.append(d)


async def forecast(conn: asyncpg.Connection, auth: AuthContext, months: int) -> ForecastOut:
    scope = await rbac.scope_of(conn, auth, "crm.lead.read")
    visible = scopes.where("crm.lead", scope, "l")
    today = await sequences.local_date(conn, None)
    start = date(today.year, today.month, 1)
    end = add_months(start, months)
    buckets = {add_months(start, i): ForecastBucket(month=add_months(start, i).strftime("%Y-%m"))
               for i in range(months)}
    overdue, no_date = ForecastBucket(), ForecastBucket()
    rows = await conn.fetch(
        f"""select l.id, l.name, l.owner_id, l.value_minor, l.probability, l.expected_close_date
              from crm_leads l
             where l.status = 'open' and (l.expected_close_date is null or l.expected_close_date < $1)
               and {visible}
             order by l.expected_close_date nulls last, l.value_minor desc, l.id""", end)
    for r in rows:
        d = r["expected_close_date"]
        if d is None:
            _add(no_date, r)
        elif d < today:
            _add(overdue, r)
        else:
            _add(buckets[date(d.year, d.month, 1)], r)
    for r in await conn.fetch(
            f"""select date_trunc('month', l.won_at)::date as m, sum(l.value_minor) as v from crm_leads l
                 where l.status = 'won' and l.won_at >= $1 and l.won_at < $2 and {visible} group by 1""",
            start, end):
        buckets[r["m"]].won_minor = int(r["v"])
    return ForecastOut(months=list(buckets.values()), overdue=overdue, no_date=no_date)
