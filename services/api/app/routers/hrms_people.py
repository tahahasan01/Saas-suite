"""Birthdays, work anniversaries and the org chart (wave A, H2/H20, St10, 0088).

Celebrations: upcoming birthdays (from an optional date of birth, only for
employees who haven't opted out, never with the year) and work anniversaries
(from join_date, with the number of years). HR sees them with
`hrms.employee.read`; every employee sees the same list through /me and
chooses whether their own birthday is shown. The org chart is drawn from
each active employee's manager.
"""
from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query

from .. import db
from ..deps import AuthContext, current_auth, current_employee
from ..models import Celebration, CelebrationSettings, OrgChartPerson
from ..rbac import perm

router = APIRouter(prefix="/hrms", tags=["hrms"])
portal = APIRouter(prefix="/me", tags=["portal"])


def _next(day: date, today: date) -> date:
    """The next occurrence of `day`'s month and day on or after today (29 Feb → 28 Feb)."""
    for year in (today.year, today.year + 1):
        try:
            d = day.replace(year=year)
        except ValueError:
            d = day.replace(year=year, day=28)
        if d >= today:
            return d
    return today      # unreachable: next year's occurrence is always ahead


async def _celebrations(conn: Any, days: int) -> list[Celebration]:
    today: date = await conn.fetchval("select current_date")
    rows = await conn.fetch(
        """select id, name, date_of_birth, celebrate_birthday, join_date from hrms_employees
            where status = 'active' and (date_of_birth is not null or join_date is not null)""")
    out: list[Celebration] = []
    for r in rows:
        if r["date_of_birth"] and r["celebrate_birthday"]:
            d = _next(r["date_of_birth"], today)
            if (d - today).days <= days:
                out.append(Celebration(employee_id=str(r["id"]), name=r["name"], kind="birthday", date=d, years=None))
        if r["join_date"]:
            d = _next(r["join_date"], today)
            years = d.year - r["join_date"].year
            if years >= 1 and (d - today).days <= days:
                out.append(Celebration(employee_id=str(r["id"]), name=r["name"], kind="anniversary", date=d,
                                       years=years))
    return sorted(out, key=lambda c: (c.date, c.name))


@router.get("/celebrations", response_model=list[Celebration])
async def celebrations(days: int = Query(30, ge=0, le=366),
                       auth: AuthContext = Depends(perm("hrms.employee.read"))) -> list[Celebration]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await _celebrations(conn, days)


@portal.get("/celebrations", response_model=list[Celebration])
async def my_celebrations(days: int = Query(30, ge=0, le=366), auth: AuthContext = Depends(current_auth),
                          employee_id: str = Depends(current_employee)) -> list[Celebration]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await _celebrations(conn, days)


@portal.put("/celebrations/settings", response_model=CelebrationSettings)
async def my_celebration_settings(body: CelebrationSettings, auth: AuthContext = Depends(current_auth),
                                  employee_id: str = Depends(current_employee)) -> CelebrationSettings:
    """Whether the team sees my birthday: my choice, not HR's."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        await conn.execute("update hrms_employees set celebrate_birthday = $2 where id = $1",
                           employee_id, body.celebrate_birthday)
    return body


@router.get("/org-chart", response_model=list[OrgChartPerson])
async def org_chart(auth: AuthContext = Depends(perm("hrms.employee.read"))) -> list[OrgChartPerson]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            """select e.id, e.name, coalesce(t.name, e.designation, '') as job_title,
                      coalesce(d.name, e.department, '') as department, e.manager_id,
                      (select count(*) from hrms_employees r where r.manager_id = e.id and r.status = 'active') as reports
                 from hrms_employees e
                 left join hrms_job_titles t on t.id = e.job_title_id
                 left join hrms_departments d on d.id = e.department_id
                where e.status = 'active' order by e.name""")
    return [OrgChartPerson(id=str(r["id"]), name=r["name"], job_title=r["job_title"] or "", department=r["department"] or "",
                           manager_id=str(r["manager_id"]) if r["manager_id"] else None, reports=r["reports"])
            for r in rows]
