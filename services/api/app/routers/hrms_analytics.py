"""HR analytics (wave C, H39, St12): headcount, joiners, leavers, attrition,
absenteeism, leaving reasons and departments, from the tables HR already
keeps (no new ones). Headcount at a month's end counts who joined by then
and hadn't left by its last day; someone switched off without an exit date
(before 0100) can't be placed in time and is left out.
"""
from __future__ import annotations

import re
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status

from .. import db, payroll_data
from ..deps import AuthContext
from ..models import HrAnalytics, HrDepartment, HrMonth
from ..rbac import perm

router = APIRouter(prefix="/hrms", tags=["hrms"])

_MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
MAX_MONTHS = 36

# Who counts: active, or with an exit date that places their leaving.
_PEOPLE = """select id, coalesce(join_date, created_at::date) as joined, exit_date, exit_reason,
                    coalesce(nullif(department, ''), 'No department') as dept
               from hrms_employees where status = 'active' or exit_date is not null"""


def _first(ym: str) -> date:
    return date(int(ym[:4]), int(ym[5:]), 1)


def _next(d: date) -> date:
    return date(d.year + (d.month == 12), d.month % 12 + 1, 1)


@router.get("/analytics", response_model=HrAnalytics)
async def analytics(from_: str | None = Query(None, alias="from"), to: str | None = None,
                    auth: AuthContext = Depends(perm("hrms.employee.read"))) -> HrAnalytics:
    async with db.tenant_conn(auth.tenant_id) as conn:
        today: date = await conn.fetchval("select current_date")
        end = _first(to) if to and _MONTH.match(to) else today.replace(day=1)
        start = _first(from_) if from_ and _MONTH.match(from_) else _first(f"{end.year - 1}-{end.month:02d}")
        if (from_ and not _MONTH.match(from_)) or (to and not _MONTH.match(to)) or start > end:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Give months as YYYY-MM, the first not after the last")
        months: list[date] = []
        d = start
        while d <= end:
            months.append(d)
            d = _next(d)
        if len(months) > MAX_MONTHS:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"At most {MAX_MONTHS} months at a time")
        people = await conn.fetch(_PEOPLE)

        out: list[HrMonth] = []
        for m in months:
            last = _next(m) - timedelta(days=1)
            out.append(HrMonth(
                month=f"{m:%Y-%m}",
                headcount=sum(1 for p in people if p["joined"] <= last and (p["exit_date"] is None or p["exit_date"] > last)),
                joiners=sum(1 for p in people if m <= p["joined"] <= last),
                leavers=sum(1 for p in people if p["exit_date"] is not None and m <= p["exit_date"] <= last)))
        range_end = _next(end) - timedelta(days=1)
        left = [p for p in people if p["exit_date"] is not None and start <= p["exit_date"] <= range_end]
        avg = sum(x.headcount for x in out) / len(out)
        reasons: dict[str, int] = {}
        for p in left:
            reasons[p["exit_reason"] or "other"] = reasons.get(p["exit_reason"] or "other", 0) + 1
        depts: dict[str, list[int]] = {}
        for p in people:
            row = depts.setdefault(p["dept"], [0, 0])
            if p["joined"] <= range_end and (p["exit_date"] is None or p["exit_date"] > range_end):
                row[0] += 1
            if p in left:
                row[1] += 1

        # Absenteeism over the range's last complete month (days not yet over can't be judged).
        abs_month = end if _next(end) <= today else (end.replace(day=1) - timedelta(days=1)).replace(day=1)
        absent_pct = None
        if abs_month >= start:
            counts = await payroll_data.absence_counts(conn, abs_month, None)
            working = sum(a.working_days for a in counts.values())
            if working:
                absent = sum(a.absent_days + a.unpaid_leave_days for a in counts.values())
                absent_pct = round(absent / working * 100, 1)

        now = sum(1 for p in people if p["joined"] <= today and (p["exit_date"] is None or p["exit_date"] >= today))
        return HrAnalytics(
            months=out, headcount_now=now, joiners=sum(x.joiners for x in out), leavers=len(left),
            attrition_pct=round(len(left) / avg * 100, 1) if avg else 0.0, absenteeism_pct=absent_pct,
            absenteeism_month=f"{abs_month:%Y-%m}" if absent_pct is not None else None, leaving_reasons=reasons,
            by_department=[HrDepartment(department=k, headcount=v[0], leavers=v[1])
                           for k, v in sorted(depts.items(), key=lambda kv: -kv[1][0])])
