"""Holiday calendars, holidays (with CSV import) and blackout days
(checklist 3F, migration 0067). Replaces the hard-coded list the web used to
offer: the federal government's list is imported each year, provinces get
their own calendars, and a business adds its own days."""
from __future__ import annotations

import re
from datetime import date, datetime

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status

from .. import csv_io, db, holidays, refs
from ..deps import AuthContext
from ..models import (
    BlackoutCreate,
    BlackoutOut,
    HolidayCalendarCreate,
    HolidayCalendarOut,
    HolidayCreate,
    HolidayOut,
    ImportResult,
    ImportRowError,
)
from ..rbac import perm

router = APIRouter(prefix="/hrms", tags=["hrms-holidays"])

HOLIDAY_HEADERS = {
    "date": ["date", "holidaydate", "day", "on"],
    "name": ["name", "holiday", "holidayname", "title", "occasion", "description"],
    "kind": ["kind", "type", "category"],
    "half_day": ["halfday", "half"],
}
_KINDS = {"public", "optional", "company"}
_YES = {"yes", "y", "true", "1", "half"}


def _s(v: object) -> str | None:
    return str(v) if v is not None else None


# ── Calendars ───────────────────────────────────────────────────────────────
def _cal(r: asyncpg.Record) -> HolidayCalendarOut:
    return HolidayCalendarOut(id=str(r["id"]), name=r["name"], scope=r["scope"], province=r["province"],
                              holidays=r["holidays"])


_CAL_SELECT = """select c.*, (select count(*) from hrms_holidays h where h.calendar_id = c.id) as holidays
                   from hrms_holiday_calendars c"""


@router.get("/holiday-calendars", response_model=list[HolidayCalendarOut])
async def list_calendars(auth: AuthContext = Depends(perm("hrms.leave.read"))) -> list[HolidayCalendarOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await holidays.ensure_federal(conn, auth.tenant_id)
        rows = await conn.fetch(
            _CAL_SELECT + " order by case c.scope when 'federal' then 0 when 'province' then 1 else 2 end, c.name")
    return [_cal(r) for r in rows]


@router.post("/holiday-calendars", response_model=HolidayCalendarOut, status_code=status.HTTP_201_CREATED)
async def create_calendar(body: HolidayCalendarCreate,
                          auth: AuthContext = Depends(perm("hrms.settings.manage"))) -> HolidayCalendarOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        try:
            cid = await conn.fetchval(
                """insert into hrms_holiday_calendars (tenant_id, name, scope, province)
                   values ($1, btrim($2), $3, $4) returning id""",
                auth.tenant_id, body.name, body.scope, body.province)
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, "A calendar with that name already exists.") from None
        return _cal(await conn.fetchrow(_CAL_SELECT + " where c.id=$1", cid))


@router.delete("/holiday-calendars/{calendar_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_calendar(calendar_id: str, response: Response,
                          auth: AuthContext = Depends(perm("hrms.settings.manage"))) -> Response:
    async with db.tenant_conn(auth.tenant_id) as conn:
        scope = await conn.fetchval("select scope from hrms_holiday_calendars where id=$1", calendar_id)
        if scope is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Calendar not found")
        if scope == "federal":
            raise HTTPException(status.HTTP_409_CONFLICT, "The federal calendar can't be removed; empty it instead.")
        await conn.execute("delete from hrms_holiday_calendars where id=$1", calendar_id)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


# ── Holidays ────────────────────────────────────────────────────────────────
_HOL_SELECT = """select h.*, c.name as calendar_name from hrms_holidays h
                 join hrms_holiday_calendars c on c.id = h.calendar_id"""


def _hol(r: asyncpg.Record) -> HolidayOut:
    return HolidayOut(id=str(r["id"]), holiday_date=r["holiday_date"], name=r["name"],
                      calendar_id=str(r["calendar_id"]), calendar_name=r["calendar_name"],
                      kind=r["kind"], half_day=r["half_day"])


async def _calendar(conn: asyncpg.Connection, auth: AuthContext, calendar_id: object) -> str:
    if calendar_id is None:
        return await holidays.ensure_federal(conn, auth.tenant_id)
    if await conn.fetchval("select 1 from hrms_holiday_calendars where id=$1", calendar_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Calendar not found")
    return str(calendar_id)


@router.get("/holidays", response_model=list[HolidayOut])
async def list_holidays(calendar_id: str | None = None, year: int | None = Query(default=None, ge=2000, le=2100),
                        auth: AuthContext = Depends(perm("hrms.leave.read"))) -> list[HolidayOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await holidays.ensure_federal(conn, auth.tenant_id)
        rows = await conn.fetch(
            _HOL_SELECT + """ where ($1::uuid is null or h.calendar_id = $1::uuid)
                                and ($2::int is null or extract(year from h.holiday_date)::int = $2)
                              order by h.holiday_date, c.name""", calendar_id, year)
    return [_hol(r) for r in rows]


@router.post("/holidays", response_model=HolidayOut, status_code=status.HTTP_201_CREATED)
async def create_holiday(body: HolidayCreate,
                         auth: AuthContext = Depends(perm("hrms.holiday.manage"))) -> HolidayOut:
    """One holiday per date per calendar; a repeat renames it (as before)."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        cid = await _calendar(conn, auth, body.calendar_id)
        hid = await conn.fetchval(
            """insert into hrms_holidays (tenant_id, calendar_id, holiday_date, name, kind, half_day)
               values ($1,$2,$3,btrim($4),$5,$6)
               on conflict (calendar_id, holiday_date) do update
                 set name = excluded.name, kind = excluded.kind, half_day = excluded.half_day
               returning id""",
            auth.tenant_id, cid, body.holiday_date, body.name, body.kind, body.half_day)
        return _hol(await conn.fetchrow(_HOL_SELECT + " where h.id=$1", hid))


@router.delete("/holidays/{holiday_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_holiday(holiday_id: str, response: Response,
                         auth: AuthContext = Depends(perm("hrms.holiday.manage"))) -> Response:
    async with db.tenant_conn(auth.tenant_id) as conn:
        # 404, not a silent 204, for an id this tenant can't see.
        if await conn.fetchval("delete from hrms_holidays where id=$1 returning id", holiday_id) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Holiday not found")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


def parse_day(raw: str) -> date | None:
    """2030-03-23, 23/03/2030, 23-03-2030 or 23 Mar 2030."""
    raw = raw.strip()
    if re.fullmatch(r"\d{4}-\d{1,2}-\d{1,2}", raw):
        fmts: tuple[str, ...] = ("%Y-%m-%d",)
    else:
        fmts = ("%d/%m/%Y", "%d-%m-%Y", "%d %b %Y", "%d %B %Y", "%d-%b-%Y")
    for f in fmts:
        try:
            return datetime.strptime(raw, f).date()
        except ValueError:
            continue
    return None


@router.post("/holidays/import", response_model=ImportResult)
async def import_holidays(request: Request, calendar_id: str | None = None,
                          auth: AuthContext = Depends(perm("hrms.holiday.manage"))) -> ImportResult:
    """Load a calendar from a CSV posted as the body: columns Date and Name,
    optional Kind (public / optional / company) and Half day (yes/no).
    Dates already in the calendar are skipped, never renamed; bad rows are
    named and the rest still import."""
    rows = csv_io.read_rows(await request.body(), HOLIDAY_HEADERS)
    if rows and "date" not in rows[0]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Couldn't find a Date column.")
    created = skipped = 0
    errors: list[ImportRowError] = []
    async with db.tenant_conn(auth.tenant_id) as conn:
        cid = await _calendar(conn, auth, calendar_id)
        for i, row in enumerate(rows, start=2):
            day = parse_day(row.get("date", ""))
            name = row.get("name", "").strip()
            kind = (row.get("kind", "") or "public").strip().lower()
            if day is None:
                errors.append(ImportRowError(row=i, error=f"Can't read the date {row.get('date', '')!r}"))
                continue
            if not name or len(name) > 120:
                errors.append(ImportRowError(row=i, error="Missing name"))
                continue
            if kind not in _KINDS:
                errors.append(ImportRowError(row=i, error=f"Kind must be public, optional or company, not {kind!r}"))
                continue
            hid = await conn.fetchval(
                """insert into hrms_holidays (tenant_id, calendar_id, holiday_date, name, kind, half_day)
                   values ($1,$2,$3,$4,$5,$6) on conflict (calendar_id, holiday_date) do nothing returning id""",
                auth.tenant_id, cid, day, name, kind, row.get("half_day", "").strip().lower() in _YES)
            if hid is None:
                skipped += 1
            else:
                created += 1
    return ImportResult(created=created, skipped_duplicates=skipped, errors=errors[:50])


# ── Blackout days ───────────────────────────────────────────────────────────
def _blackout(r: asyncpg.Record) -> BlackoutOut:
    return BlackoutOut(id=str(r["id"]), name=r["name"], date_from=r["date_from"], date_to=r["date_to"],
                       location_id=_s(r["location_id"]), department_id=_s(r["department_id"]))


@router.get("/blackout-days", response_model=list[BlackoutOut])
async def list_blackouts(auth: AuthContext = Depends(perm("hrms.leave.read"))) -> list[BlackoutOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch("select * from hrms_blackout_days order by date_from")
    return [_blackout(r) for r in rows]


@router.post("/blackout-days", response_model=BlackoutOut, status_code=status.HTTP_201_CREATED)
async def create_blackout(body: BlackoutCreate,
                          auth: AuthContext = Depends(perm("hrms.settings.manage"))) -> BlackoutOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "hrms_locations", body.location_id)
        await refs.ensure_visible(conn, "hrms_departments", body.department_id)
        row = await conn.fetchrow(
            """insert into hrms_blackout_days (tenant_id, name, date_from, date_to, location_id, department_id,
                                               created_by)
               values ($1, btrim($2), $3, $4, $5, $6, $7) returning *""",
            auth.tenant_id, body.name, body.date_from, body.date_to, body.location_id, body.department_id,
            auth.user_id)
    return _blackout(row)


@router.delete("/blackout-days/{blackout_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_blackout(blackout_id: str, response: Response,
                          auth: AuthContext = Depends(perm("hrms.settings.manage"))) -> Response:
    async with db.tenant_conn(auth.tenant_id) as conn:
        if await conn.fetchval("delete from hrms_blackout_days where id=$1 returning id", blackout_id) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Blackout not found")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response

