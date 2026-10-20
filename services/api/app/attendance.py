"""Attendance: punches are the evidence, the day is derived (D-43, St03 §6.3).

Every check-in and check-out is an append-only row in hrms_punches. The one
hrms_attendance row per employee per work day is a function of that day's
punches and the employee's shift, recomputed on every punch:

  * late_min  — whole minutes (rounded up) past start + late grace;
  * early_min — minutes before end − early grace, once checked out;
  * status    — absent < absent_below_min worked ≤ half_day < half_day_below_min
                ≤ late/present. The thresholds wait until the day is closed:
                twenty minutes into the day nobody is a half day yet.

A day is closed by a check-out with nothing left open, or by being over —
the shift's end + early grace has passed (overnight: the next morning), the
local day has ended (no shift), or a later work day has begun. A day that is
over with a check-in still open is flagged `missing_checkout`, and the open
interval counts 0 minutes: the conservative rule, so a check-in alone never
earns a full day's pay (security review); HR corrects the day instead.
finalise_open_days() re-derives days that ended without a punch to close
them — payroll and the week matrix run it first, and the worker can run it
on a schedule.

No shift assigned keeps the tenant default from 0029: late from
tenants.late_after on, never a half day.

Local times become instants in SQL, under the session TimeZone tenant_conn
set (D-11), so DST zones work without a timezone library here.
"""
from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

import asyncpg

# Ids arrive as strings from the API and as UUIDs from the database.
Id = str | uuid.UUID


@dataclass(frozen=True)
class Shift:
    id: str
    name: str
    start_time: time
    end_time: time
    grace_in_min: int
    grace_out_min: int
    half_day_below_min: int
    absent_below_min: int

    @property
    def overnight(self) -> bool:
        return self.end_time <= self.start_time


@dataclass(frozen=True)
class Rule:
    """A shift pinned to one work day: its start and end as instants."""
    start_at: datetime
    end_at: datetime
    grace_in_min: int
    grace_out_min: int
    half_day_below_min: int
    absent_below_min: int


@dataclass(frozen=True)
class Punch:
    at: datetime
    kind: str  # in | out


@dataclass(frozen=True)
class Day:
    status: str
    late_min: int
    early_min: int
    worked_min: int
    first_in: datetime | None
    last_out: datetime | None
    missing_checkout: bool = False
    final: bool = False          # judged as over; finalise_open_days skips it


def _minutes_up(delta: timedelta) -> int:
    return max(0, math.ceil(delta.total_seconds() / 60))


def derive(punches: list[Punch], *, rule: Rule | None, late_after_at: datetime | None = None,
           day_over: bool = False) -> Day:
    """The day from its punches, in time order. `rule` is the shift for this
    day; without one, `late_after_at` (tenants.late_after on that day) decides.
    `day_over`: nothing more is expected that day (see the module docstring)."""
    first_in = last_out = open_at = None
    last_pair: tuple[datetime, datetime] | None = None
    worked = timedelta()
    for p in sorted(punches, key=lambda p: p.at):
        if p.kind == "in":
            first_in = first_in or p.at
            open_at = open_at or p.at          # a second tap while in is no new pair
        elif open_at is not None:
            worked += p.at - open_at
            last_pair, open_at = (open_at, p.at), None
            last_out = p.at
        elif last_pair is not None:            # a repeated check-out moves the last one
            worked += p.at - last_pair[1]
            last_pair = (last_pair[0], p.at)
            last_out = p.at
    worked_min = int(worked.total_seconds() // 60)
    checked_out = last_out is not None and open_at is None
    missing = day_over and open_at is not None
    judged = checked_out or day_over   # worked_min holds closed pairs only

    if rule is None:
        late = first_in is not None and late_after_at is not None and first_in >= late_after_at
        late_min = _minutes_up(first_in - late_after_at) if late and first_in and late_after_at else 0
        return Day("late" if late else "present", late_min, 0, worked_min, first_in, last_out,
                   missing, day_over)

    late_min = _minutes_up(first_in - (rule.start_at + timedelta(minutes=rule.grace_in_min))) if first_in else 0
    early_min = (_minutes_up(rule.end_at - timedelta(minutes=rule.grace_out_min) - last_out)
                 if checked_out and last_out is not None else 0)
    if judged and worked_min < rule.absent_below_min:
        status = "absent"
    elif judged and worked_min < rule.half_day_below_min:
        status = "half_day"
    else:
        status = "late" if late_min > 0 else "present"
    return Day(status, late_min, early_min, worked_min, first_in, last_out, missing, day_over)


def overnight_cutoff(start: time, end: time) -> time:
    """For an overnight shift, the local time before which a punch belongs to
    the shift that started the evening before: the middle of the off-duty gap
    (22:00–06:00 → 14:00), as far as possible from both ends of the shift."""
    s, e = start.hour * 60 + start.minute, end.hour * 60 + end.minute
    m = e + (s - e) // 2
    return time(m // 60, m % 60)


# ── Database side ───────────────────────────────────────────────────────────
_SHIFT_FOR = """
select s.* from hrms_shift_assignments a join hrms_shifts s on s.id = a.shift_id
 where a.employee_id = $1 and a.date_from <= $2 and (a.date_to is null or a.date_to >= $2)
 order by a.date_from desc limit 1"""


def _shift(r: asyncpg.Record) -> Shift:
    return Shift(id=str(r["id"]), name=r["name"], start_time=r["start_time"], end_time=r["end_time"],
                 grace_in_min=r["grace_in_min"], grace_out_min=r["grace_out_min"],
                 half_day_below_min=r["half_day_below_min"], absent_below_min=r["absent_below_min"])


async def shift_for(conn: asyncpg.Connection, employee_id: Id, day: date) -> Shift | None:
    r = await conn.fetchrow(_SHIFT_FOR, employee_id, day)
    return _shift(r) if r else None


async def resolve(conn: asyncpg.Connection, employee_id: Id, at: datetime) -> tuple[date, Shift | None]:
    """The work day a punch at `at` counts towards, and that day's shift.
    Its local date — unless yesterday's shift is overnight and the punch falls
    before that shift's cutoff (an 02:00 check-out ends last night's shift)."""
    local = await conn.fetchrow("select $1::timestamptz::date as d, $1::timestamptz::time as t", at)
    yesterday = await shift_for(conn, employee_id, local["d"] - timedelta(days=1))
    if yesterday and yesterday.overnight and local["t"] < overnight_cutoff(yesterday.start_time, yesterday.end_time):
        return local["d"] - timedelta(days=1), yesterday
    return local["d"], await shift_for(conn, employee_id, local["d"])


async def _rule(conn: asyncpg.Connection, day: date, shift: Shift) -> Rule:
    # date + time is a local timestamp; the cast to timestamptz reads it in
    # the session TimeZone (the tenant's).
    r = await conn.fetchrow(
        "select ($1::date + $2::time)::timestamptz as s, ($1::date + $3::int + $4::time)::timestamptz as e",
        day, shift.start_time, 1 if shift.overnight else 0, shift.end_time)
    return Rule(start_at=r["s"], end_at=r["e"], grace_in_min=shift.grace_in_min,
                grace_out_min=shift.grace_out_min, half_day_below_min=shift.half_day_below_min,
                absent_below_min=shift.absent_below_min)


async def preview(conn: asyncpg.Connection, employee_id: Id, day: date, shift: Shift | None = None, *,
                  now: datetime | None = None) -> Day:
    """Derive `day` from its punches without writing anything. `now` is the
    clock the day is judged by (the database's, unless a test freezes it)."""
    punches = [Punch(r["at"], r["kind"]) for r in await conn.fetch(
        "select at, kind from hrms_punches where employee_id=$1 and work_date=$2 order by at", employee_id, day)]
    shift = shift or await shift_for(conn, employee_id, day)
    clock = await conn.fetchrow(
        """select coalesce($3::timestamptz, now()) as now,
                  coalesce($3::timestamptz, now())::date as today,
                  exists (select 1 from hrms_punches where employee_id=$1 and work_date > $2) as later""",
        employee_id, day, now)
    if shift is not None:
        rule = await _rule(conn, day, shift)
        over = clock["later"] or clock["now"] >= rule.end_at + timedelta(minutes=rule.grace_out_min)
        return derive(punches, rule=rule, day_over=over)
    late_after_at = await conn.fetchval(
        """select ($1::date + t.late_after)::timestamptz from tenants t
            where t.id = current_setting('app.tenant_id', true)::uuid""", day)
    return derive(punches, rule=None, late_after_at=late_after_at,
                  day_over=clock["later"] or clock["today"] > day)


async def rederive(conn: asyncpg.Connection, tenant_id: Id, employee_id: Id, day: date,
                   shift: Shift | None = None, *, now: datetime | None = None) -> uuid.UUID | None:
    """Write the derived row for (employee, day); returns its id. A locked
    day (frozen by a payroll run) is left exactly as it is, and so is a day
    with no check-in punch (nothing to derive it from)."""
    # Method, geo and the fraud flag describe the latest check-in, as before.
    last_in = await conn.fetchrow(
        """select method, lat, lng, fraud_flag from hrms_punches
            where employee_id=$1 and work_date=$2 and kind='in' order by at desc limit 1""",
        employee_id, day)
    if last_in is None:
        existing: uuid.UUID | None = await conn.fetchval(
            "select id from hrms_attendance where employee_id=$1 and work_date=$2", employee_id, day)
        return existing
    shift = shift or await shift_for(conn, employee_id, day)
    d = await preview(conn, employee_id, day, shift, now=now)
    row_id: uuid.UUID | None = await conn.fetchval(
        """insert into hrms_attendance (tenant_id, employee_id, work_date, check_in, check_out, status,
                                        method, lat, lng, fraud_flag, shift_id, late_min, early_min, worked_min,
                                        missing_checkout, final)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           on conflict (employee_id, work_date) do update set
             check_in = excluded.check_in, check_out = excluded.check_out, status = excluded.status,
             method = excluded.method, lat = excluded.lat, lng = excluded.lng,
             fraud_flag = excluded.fraud_flag, shift_id = excluded.shift_id,
             late_min = excluded.late_min, early_min = excluded.early_min, worked_min = excluded.worked_min,
             missing_checkout = excluded.missing_checkout, final = excluded.final
           where not hrms_attendance.locked
           returning id""",
        tenant_id, employee_id, day, d.first_in, d.last_out, d.status,
        last_in["method"], last_in["lat"], last_in["lng"], last_in["fraud_flag"],
        shift.id if shift else None, d.late_min, d.early_min, d.worked_min, d.missing_checkout, d.final)
    if row_id is None:  # locked
        row_id = await conn.fetchval(
            "select id from hrms_attendance where employee_id=$1 and work_date=$2", employee_id, day)
    return row_id


async def punch(conn: asyncpg.Connection, employee_id: Id, kind: str, *, method: str,
                at: datetime | None = None, lat: float | None = None, lng: float | None = None,
                flag: str = "", by: str | None = None) -> uuid.UUID | None:
    """Record one punch and re-derive its day; returns the day's row id.

    A check-out with no check-in on its work day records nothing and returns
    None. Punches for one employee run one at a time (row lock), so two taps
    can't each derive the day from a snapshot missing the other."""
    tenant_id = await conn.fetchval("select tenant_id from hrms_employees where id=$1 for update", employee_id)
    if tenant_id is None:
        return None
    at = at or await conn.fetchval("select now()")
    day, shift = await resolve(conn, employee_id, at)
    if kind == "out" and not await conn.fetchval(
            "select 1 from hrms_punches where employee_id=$1 and work_date=$2 and kind='in'", employee_id, day):
        return None
    await conn.execute(
        """insert into hrms_punches (tenant_id, employee_id, at, kind, work_date, method, lat, lng, fraud_flag, created_by)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)""",
        tenant_id, employee_id, at, kind, day, method, lat, lng, flag, by)
    row_id = await rederive(conn, tenant_id, employee_id, day, shift)
    # A new work day closes the earlier ones this employee left open.
    await finalise_open_days(conn, employee_id, before=day)
    return row_id


async def finalise_open_days(conn: asyncpg.Connection, employee_id: Id | None = None, *,
                             before: date | None = None,
                             now: datetime | None = None) -> int:
    """Re-derive every unlocked day not yet judged as over, up to today (or
    strictly before `before`), for one employee or the whole tenant; returns
    how many rows were looked at. Idempotent, so payroll and the week matrix
    call it before reading, and the worker can schedule it per tenant (inside
    a tenant_conn) to close days nobody punched out of."""
    rows = await conn.fetch(
        """select tenant_id, employee_id, work_date from hrms_attendance
            where not final and not locked
              and ($1::uuid is null or employee_id = $1::uuid)
              and work_date < coalesce($2::date, coalesce($3::timestamptz, now())::date + 1)
            order by employee_id, work_date""",
        employee_id, before, now)
    for r in rows:
        # The punch lock, so a check-out committing meanwhile can't be
        # overwritten by a derivation that didn't see it. Employee order keeps
        # two concurrent finalisations from deadlocking.
        await conn.execute("select 1 from hrms_employees where id=$1 for update", r["employee_id"])
        await rederive(conn, r["tenant_id"], r["employee_id"], r["work_date"], now=now)
    return len(rows)
