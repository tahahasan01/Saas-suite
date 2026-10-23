"""Overtime claims, paid through payroll (wave A, H5, St10, 0086).

An employee claims overtime for a day through /me, at most the minutes
attendance derived for it. A manager (`hrms.attendance.approve`) approves or
rejects. Approval prices the claim once (payroll_engine.overtime_pay) and
creates an OVERTIME one-off for the month, so payroll pays, freezes and
releases it like any one-off. Amounts are pay: only callers holding
`payroll.salary.read` see them.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status

from .. import attendance, db, holidays, payroll_data, rbac
from .. import payroll_engine as eng
from ..deps import AuthContext, current_auth, current_employee
from ..models import OvertimeClaimIn, OvertimeDecision, OvertimeOut, OvertimeRates, OvertimeRatesOut, OvertimeStatus
from ..rbac import perm

router = APIRouter(prefix="/hrms", tags=["hrms"])
portal = APIRouter(prefix="/me", tags=["portal"])

DEFAULT_SHIFT_MINUTES = 480          # an 8-hour day when no shift is assigned
FINAL_RUN = ("approved", "paid", "locked")

_SELECT = """select c.*, e.name as employee_name from hrms_overtime_claims c
               join hrms_employees e on e.id = c.employee_id"""


def _out(r: asyncpg.Record, *, show_pay: bool) -> OvertimeOut:
    return OvertimeOut(
        id=str(r["id"]), employee_id=str(r["employee_id"]), employee_name=r["employee_name"], work_date=r["work_date"],
        minutes=r["minutes"], reason=r["reason"], status=r["status"], rate_multiplier=float(r["rate_multiplier"]),
        day_type=r["day_type"],
        amount_minor=r["amount_minor"] if show_pay else None, decided_at=r["decided_at"],
        decision_note=r["decision_note"], created_at=r["created_at"])


async def _shift_minutes(conn: asyncpg.Connection, employee_id: Any, day: date) -> int:
    shift = await attendance.shift_for(conn, employee_id, day)
    if shift is None:
        return DEFAULT_SHIFT_MINUTES
    start = datetime.combine(day, shift.start_time)
    end = datetime.combine(day, shift.end_time)
    if end <= start:                     # an overnight shift ends the next day
        end += timedelta(days=1)
    return int((end - start).total_seconds() // 60) or DEFAULT_SHIFT_MINUTES


async def _price(conn: asyncpg.Connection, claim: asyncpg.Record, multiplier: Decimal) -> int:
    """Salary on the day worked, over that month's working hours, × hours × multiplier."""
    base = await conn.fetchval(
        """select base_minor from hrms_compensation where employee_id = $1 and effective_from <= $2
            order by effective_from desc, seq desc limit 1""", claim["employee_id"], claim["work_date"])
    first = claim["work_date"].replace(day=1)
    counts = await payroll_data.absence_counts(conn, first, [claim["employee_id"]])
    working = counts[str(claim["employee_id"])].working_days if str(claim["employee_id"]) in counts else 0
    return eng.overtime_pay(int(base or 0), working_days=working,
                            shift_minutes=await _shift_minutes(conn, claim["employee_id"], claim["work_date"]),
                            minutes=claim["minutes"], multiplier=multiplier)


async def _pay_month(conn: asyncpg.Connection, work_date: date) -> date:
    """The month the overtime is paid in: the month it was worked, unless that
    month's regular payroll is already final; then the current month."""
    first = work_date.replace(day=1)
    closed = await conn.fetchval(
        "select 1 from payroll_runs where kind = 'regular' and period_start = $1 and status = any($2::text[])",
        first, list(FINAL_RUN))
    if not closed:
        return first
    today: date = await conn.fetchval("select current_date")
    return today.replace(day=1)


# ── Rates by kind of day (0109) ─────────────────────────────────────────────
async def _rates(conn: asyncpg.Connection) -> OvertimeRatesOut:
    r = await conn.fetchrow("select * from hrms_overtime_rates")
    if r is None:
        return OvertimeRatesOut(normal=2.0, rest_day=2.0, holiday=2.0, verified=False)
    return OvertimeRatesOut(normal=float(r["normal"]), rest_day=float(r["rest_day"]), holiday=float(r["holiday"]),
                            verified=r["verified"])


async def _day_type(conn: asyncpg.Connection, employee_id: str, day: date) -> str:
    """Their holiday (federal, company, their province) beats the weekly day off."""
    if day in await holidays.for_employee(conn, employee_id, day, day):
        return "holiday"
    off = await conn.fetchval("select weekly_off_days from tenants where id = current_setting('app.tenant_id')::uuid")
    return "rest_day" if day.isoweekday() % 7 in set(off or [0]) else "normal"


@router.get("/overtime-rates", response_model=OvertimeRatesOut)
async def get_rates(auth: AuthContext = Depends(perm("hrms.attendance.read"))) -> OvertimeRatesOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await _rates(conn)


@router.put("/overtime-rates", response_model=OvertimeRatesOut)
async def put_rates(body: OvertimeRates, auth: AuthContext = Depends(perm("payroll.settings.manage"))) -> OvertimeRatesOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await conn.execute(
            """insert into hrms_overtime_rates (tenant_id, normal, rest_day, holiday, updated_by)
               values ($1, $2, $3, $4, $5)
               on conflict (tenant_id) do update set normal = excluded.normal, rest_day = excluded.rest_day,
                  holiday = excluded.holiday, updated_by = excluded.updated_by, updated_at = now()""",
            auth.tenant_id, Decimal(str(body.normal)), Decimal(str(body.rest_day)), Decimal(str(body.holiday)),
            auth.user_id)
        return await _rates(conn)


# ── Manager side ────────────────────────────────────────────────────────────
@router.get("/overtime", response_model=list[OvertimeOut])
async def list_claims(status_filter: OvertimeStatus | None = Query(None, alias="status"),
                      auth: AuthContext = Depends(perm("hrms.attendance.read"))) -> list[OvertimeOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        show = await rbac.holds_key(conn, auth, "payroll.salary.read")
        rows = await conn.fetch(_SELECT + """ where ($1::text is null or c.status = $1)
                                             order by c.status = 'pending' desc, c.work_date desc limit 300""",
                                status_filter)
    return [_out(r, show_pay=show) for r in rows]


async def _decide(conn: asyncpg.Connection, auth: AuthContext, claim_id: UUID) -> asyncpg.Record:
    row = await conn.fetchrow(
        """select c.*, e.user_id as claimant_user from hrms_overtime_claims c
             join hrms_employees e on e.id = c.employee_id where c.id = $1 for update of c""", claim_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Overtime claim not found")
    # An approver who is also the claimant would be paying themselves (security review).
    if row["claimant_user"] is not None and str(row["claimant_user"]) == auth.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can't decide your own overtime claim")
    if row["status"] != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, f"This claim was already {row['status']}")
    return row


@router.post("/overtime/{claim_id}/approve", response_model=OvertimeOut)
async def approve(claim_id: UUID, body: OvertimeDecision,
                  auth: AuthContext = Depends(perm("hrms.attendance.approve"))) -> OvertimeOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        claim = await _decide(conn, auth, claim_id)
        # Changing the rate changes pay: that needs payroll rights, not just approval.
        if body.rate_multiplier is not None and not await rbac.holds_key(conn, auth, "payroll.salary.update"):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Changing the overtime rate needs payroll.salary.update")
        multiplier = Decimal(str(body.rate_multiplier)) if body.rate_multiplier is not None else claim["rate_multiplier"]
        amount = await _price(conn, claim, multiplier)
        one_off = None
        if amount > 0:
            hours = f"{claim['minutes'] // 60}h{claim['minutes'] % 60:02d}"
            one_off = await conn.fetchval(
                """insert into pay_one_offs (tenant_id, employee_id, period, code, name, kind, amount_minor, taxable,
                                             note, created_by)
                   values ($1, $2, $3, 'OVERTIME', $4, 'earning', $5, true, $6, $7) returning id""",
                auth.tenant_id, claim["employee_id"], await _pay_month(conn, claim["work_date"]),
                f"Overtime {hours} on {claim['work_date']:%d %b}", amount,
                f"overtime claim {claim['id']} at ×{multiplier}", auth.user_id)
        await conn.execute(
            """update hrms_overtime_claims set status = 'approved', rate_multiplier = $2, amount_minor = $3,
                      one_off_id = $4, decided_by = $5, decided_at = now(), decision_note = $6 where id = $1""",
            claim_id, multiplier, amount, one_off, auth.user_id, body.note)
        show = await rbac.holds_key(conn, auth, "payroll.salary.read")
        return _out(await conn.fetchrow(_SELECT + " where c.id = $1", claim_id), show_pay=show)


@router.post("/overtime/{claim_id}/reject", response_model=OvertimeOut)
async def reject(claim_id: UUID, body: OvertimeDecision,
                 auth: AuthContext = Depends(perm("hrms.attendance.approve"))) -> OvertimeOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        await _decide(conn, auth, claim_id)
        await conn.execute(
            """update hrms_overtime_claims set status = 'rejected', decided_by = $2, decided_at = now(),
                      decision_note = $3 where id = $1""", claim_id, auth.user_id, body.note)
        show = await rbac.holds_key(conn, auth, "payroll.salary.read")
        return _out(await conn.fetchrow(_SELECT + " where c.id = $1", claim_id), show_pay=show)


# ── The employee's own claims (/me) ─────────────────────────────────────────
@portal.get("/overtime", response_model=list[OvertimeOut])
async def my_claims(auth: AuthContext = Depends(current_auth),
                    employee_id: str = Depends(current_employee)) -> list[OvertimeOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(_SELECT + " where c.employee_id = $1 order by c.work_date desc limit 100", employee_id)
    return [_out(r, show_pay=True) for r in rows]      # their own pay


@portal.post("/overtime", response_model=OvertimeOut, status_code=status.HTTP_201_CREATED)
async def claim(body: OvertimeClaimIn, auth: AuthContext = Depends(current_auth),
                employee_id: str = Depends(current_employee)) -> OvertimeOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        worked = await conn.fetchval(
            "select overtime_min from hrms_attendance where employee_id = $1 and work_date = $2",
            employee_id, body.work_date)
        if not worked:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Attendance shows no overtime that day")
        minutes = body.minutes if body.minutes is not None else worked
        if minutes > worked:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                f"Attendance shows {worked} minutes of overtime that day")
        day_type = await _day_type(conn, employee_id, body.work_date)
        rate = getattr(await _rates(conn), day_type)
        try:
            cid = await conn.fetchval(
                """insert into hrms_overtime_claims (tenant_id, employee_id, work_date, minutes, reason, day_type,
                                                     rate_multiplier)
                   values ($1, $2, $3, $4, $5, $6, $7) returning id""",
                auth.tenant_id, employee_id, body.work_date, minutes, body.reason, day_type, Decimal(str(rate)))
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, "You've already claimed overtime for that day")
        return _out(await conn.fetchrow(_SELECT + " where c.id = $1", cid), show_pay=True)
