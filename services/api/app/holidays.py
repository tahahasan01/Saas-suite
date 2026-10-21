"""Holiday calendars and blackout days (checklist 3F, migration 0067).

An employee's holidays are the federal calendar's, any company calendar's,
and those of the province their work location is in — never another
province's, and never `optional` days (the employee asks for those as
leave). Lists are imported per year from a CSV; nothing is hard-coded.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import asyncpg


@dataclass(frozen=True)
class HolidayDay:
    name: str
    half_day: bool


@dataclass(frozen=True)
class Blackout:
    id: str
    name: str
    date_from: date
    date_to: date


async def ensure_federal(conn: asyncpg.Connection, tenant_id: str) -> str:
    """The tenant's federal calendar, created on first use (tenants that
    signed up after 0067). Race-safe: the partial unique index decides."""
    await conn.execute(
        """insert into hrms_holiday_calendars (tenant_id, name, scope) values ($1, 'Federal', 'federal')
           on conflict do nothing""", tenant_id)
    cid = await conn.fetchval(
        "select id from hrms_holiday_calendars where tenant_id=$1 and scope='federal'", tenant_id)
    return str(cid)


async def for_employee(conn: asyncpg.Connection, employee_id: str, start: date, end: date) -> dict[date, HolidayDay]:
    rows = await conn.fetch("select * from hrms_employee_holidays($1, $2, $3)", employee_id, start, end)
    return {r["holiday_date"]: HolidayDay(r["name"], r["half_day"]) for r in rows}


async def blackout_for(conn: asyncpg.Connection, employee_id: str, start: date, end: date) -> Blackout | None:
    """The first blackout overlapping [start, end] that applies to the
    employee: tenant-wide, or for their location or department."""
    r = await conn.fetchrow(
        """select b.id, b.name, b.date_from, b.date_to
             from hrms_blackout_days b join hrms_employees e on e.id = $1
            where b.date_from <= $3 and b.date_to >= $2
              and (b.location_id is null or b.location_id = e.location_id)
              and (b.department_id is null or b.department_id = e.department_id)
            order by b.date_from limit 1""", employee_id, start, end)
    return Blackout(str(r["id"]), r["name"], r["date_from"], r["date_to"]) if r else None
