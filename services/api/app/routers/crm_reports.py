"""CRM reports: funnel, lost reasons and sources, each as JSON or CSV (08).

The funnel counts how many leads *reached* each stage, Odoo-style survival:
a won lead counts for every open stage and its won stage; an open or lost
lead for its own stage and every earlier one. That works because losing a
lead keeps the stage it died in (D-31).

Filters: `pipeline_id` (the funnel defaults to the default pipeline; the
others cover every pipeline) and `date_from` / `date_to` on the day a lead was
created, in the tenant's time zone.
"""
from __future__ import annotations

import datetime as dt
from typing import Any, Literal

from fastapi import APIRouter, Depends, Response

from .. import csv_io, db, pipelines
from ..deps import AuthContext
from ..models import (
    FunnelReport,
    FunnelRow,
    LostReasonRow,
    LostReasonsReport,
    SourceRow,
    SourcesReport,
)
from ..rbac import perm

router = APIRouter(prefix="/crm/reports", tags=["crm"])

Format = Literal["json", "csv"]

_LEAD_FILTER = """($1::uuid is null or l.pipeline_id = $1)
                  and ($2::date is null or l.created_at::date >= $2)
                  and ($3::date is null or l.created_at::date <= $3)"""


def _pct(part: int, whole: int) -> int | None:
    """Whole percent, half-up; None when there's nothing to divide by."""
    if whole <= 0:
        return None
    return (200 * part + whole) // (2 * whole)


def _rupees(minor: int) -> str:
    sign = "-" if minor < 0 else ""
    return f"{sign}{abs(minor) // 100}.{abs(minor) % 100:02d}"


def _cell(v: Any) -> Any:
    """A spreadsheet must not run a stage name like '=HYPERLINK(...)'."""
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + v
    return v


def _csv(name: str, headers: list[str], rows: list[dict[str, Any]]) -> Response:
    body = csv_io.to_csv(headers, [{k: _cell(v) for k, v in r.items()} for r in rows])
    return Response(body, media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="crm-{name}.csv"'})


@router.get("/funnel", response_model=FunnelReport)
async def funnel(pipeline_id: str | None = None, date_from: dt.date | None = None, date_to: dt.date | None = None,
                 format: Format = "json", auth: AuthContext = Depends(perm("crm.report.read"))) -> Any:
    async with db.tenant_conn(auth.tenant_id) as conn:
        pid = pipeline_id or await pipelines.ensure_default(conn, auth.tenant_id)
        rows = await conn.fetch(
            f"""with ld as (
                    select l.status, l.value_minor, l.stage_id, s.position, s.is_won
                      from crm_leads l join crm_stages s on s.id = l.stage_id
                     where {_LEAD_FILTER})
                select st.id, st.name, st.is_won,
                       count(ld.*) filter (where case when st.is_won then ld.stage_id = st.id and ld.status = 'won'
                                                      else ld.status = 'won'
                                                           or (not ld.is_won and ld.position >= st.position) end)
                         as reached,
                       coalesce(sum(ld.value_minor) filter (
                         where case when st.is_won then ld.stage_id = st.id and ld.status = 'won'
                                    else ld.status = 'won' or (not ld.is_won and ld.position >= st.position) end), 0)
                         as value_minor
                  from crm_stages st left join ld on true
                 where st.pipeline_id = $1
                 group by st.id, st.name, st.is_won, st.position
                 order by st.is_won, st.position""",
            pid, date_from, date_to)
    out: list[FunnelRow] = []
    prev: int | None = None
    for r in rows:
        conv = (100 if r["reached"] else None) if prev is None else _pct(r["reached"], prev)
        out.append(FunnelRow(stage_id=str(r["id"]), stage=r["name"], is_won=r["is_won"], reached=r["reached"],
                             value_minor=r["value_minor"], conversion_pct=conv))
        prev = r["reached"]
    if format == "csv":
        return _csv("funnel", ["stage", "reached", "value", "conversion_pct"],
                    [{"stage": x.stage, "reached": x.reached, "value": _rupees(x.value_minor),
                      "conversion_pct": x.conversion_pct} for x in out])
    return FunnelReport(rows=out)


@router.get("/lost-reasons", response_model=LostReasonsReport)
async def lost_reasons(pipeline_id: str | None = None, date_from: dt.date | None = None,
                       date_to: dt.date | None = None, format: Format = "json",
                       auth: AuthContext = Depends(perm("crm.report.read"))) -> Any:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            f"""select coalesce(r.name, 'No reason given') as reason, count(*) as count,
                       coalesce(sum(l.value_minor), 0) as value_minor
                  from crm_leads l left join crm_lost_reasons r on r.id = l.lost_reason_id
                 where l.status = 'lost' and {_LEAD_FILTER}
                 group by 1 order by count(*) desc, 1""",
            pipeline_id, date_from, date_to)
    out = [LostReasonRow(reason=r["reason"], count=r["count"], value_minor=r["value_minor"]) for r in rows]
    if format == "csv":
        return _csv("lost-reasons", ["reason", "count", "value"],
                    [{"reason": x.reason, "count": x.count, "value": _rupees(x.value_minor)} for x in out])
    return LostReasonsReport(rows=out)


@router.get("/sources", response_model=SourcesReport)
async def sources(pipeline_id: str | None = None, date_from: dt.date | None = None, date_to: dt.date | None = None,
                  format: Format = "json", auth: AuthContext = Depends(perm("crm.report.read"))) -> Any:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            f"""select l.source, count(*) as leads,
                       count(*) filter (where l.status = 'open') as open,
                       count(*) filter (where l.status = 'won') as won,
                       count(*) filter (where l.status = 'lost') as lost,
                       coalesce(sum(l.value_minor) filter (where l.status = 'won'), 0) as won_value_minor
                  from crm_leads l
                 where {_LEAD_FILTER}
                 group by l.source order by count(*) desc, l.source""",
            pipeline_id, date_from, date_to)
    out = [SourceRow(source=r["source"], leads=r["leads"], open=r["open"], won=r["won"], lost=r["lost"],
                     won_value_minor=r["won_value_minor"], win_rate_pct=_pct(r["won"], r["won"] + r["lost"]))
           for r in rows]
    if format == "csv":
        return _csv("sources", ["source", "leads", "open", "won", "lost", "won_value", "win_rate_pct"],
                    [{"source": x.source, "leads": x.leads, "open": x.open, "won": x.won, "lost": x.lost,
                      "won_value": _rupees(x.won_value_minor), "win_rate_pct": x.win_rate_pct} for x in out])
    return SourcesReport(rows=out)
