"""Compensatory leave and leave encashment (wave C, H8, St12, 0103).

Comp-off: an employee asks on /me for a day (or half) off in return for a
weekly off day or holiday they clocked in on. An approver
(hrms.leave.approve, never for themselves) credits it to a leave type in the
current leave year as a `comp_off` ledger entry.

Encashment: HR turns up to the remaining balance into pay. It is pay, so it
needs payroll.salary.update as well as hrms.leave.adjust. The rate is the
salary ÷ 30 a day (a founder decision, St12 §5), rounded half-up once; a
taxable LEAVE_ENCASH one-off pays it with the next salary and an `encash`
ledger entry takes the days off.
"""
from __future__ import annotations

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status

from .. import db, holidays, leave, payroll_data, rbac, refs
from ..deps import AuthContext, current_auth, current_employee
from ..models import CompOffApprove, CompOffIn, CompOffOut, CompOffReject, CompOffStatus, EncashIn, EncashOut
from ..rbac import perm

router = APIRouter(prefix="/hrms", tags=["hrms"])
portal = APIRouter(prefix="/me", tags=["portal"])

DAYS_PER_MONTH = 30      # the per-day divisor for encashment (St12 §5: founder to confirm)

_SELECT = """select c.*, e.name as employee_name, e.user_id as claimant_user, lt.name as leave_type_name
               from hrms_comp_off_requests c join hrms_employees e on e.id = c.employee_id
               left join hrms_leave_types lt on lt.id = c.leave_type_id"""


def _out(r: asyncpg.Record) -> CompOffOut:
    return CompOffOut(id=str(r["id"]), employee_id=str(r["employee_id"]), employee_name=r["employee_name"],
                      work_date=r["work_date"], days=float(r["days"]), reason=r["reason"], status=r["status"],
                      leave_type_name=r["leave_type_name"], decision_note=r["decision_note"],
                      decided_at=r["decided_at"], created_at=r["created_at"])


# ── The employee's side (/me) ───────────────────────────────────────────────
@portal.post("/comp-off", response_model=CompOffOut, status_code=status.HTTP_201_CREATED)
async def ask(body: CompOffIn, auth: AuthContext = Depends(current_auth),
              employee_id: str = Depends(current_employee)) -> CompOffOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        today: date = await conn.fetchval("select current_date")
        if body.work_date > today:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Ask once you've worked the day")
        off = set(await conn.fetchval("select weekly_off_days from tenants where id = $1", auth.tenant_id) or [0])
        is_off = body.work_date.isoweekday() % 7 in off          # ISO Sun=7 -> dow Sun=0
        if not is_off and body.work_date not in await holidays.for_employee(conn, employee_id, body.work_date,
                                                                           body.work_date):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                "That was a working day: comp-off is for working a day off or a holiday")
        if not await conn.fetchval(
                """select 1 from hrms_attendance where employee_id = $1 and work_date = $2
                     and check_in is not null and status <> 'absent'""", employee_id, body.work_date):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Attendance shows you hadn't clocked in that day")
        try:
            cid = await conn.fetchval(
                """insert into hrms_comp_off_requests (tenant_id, employee_id, work_date, days, reason)
                   values ($1, $2, $3, $4, $5) returning id""",
                auth.tenant_id, employee_id, body.work_date, Decimal(str(body.days)), body.reason)
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, "You've already asked for that day")
        return _out(await conn.fetchrow(_SELECT + " where c.id = $1", cid))


@portal.get("/comp-off", response_model=list[CompOffOut])
async def mine(auth: AuthContext = Depends(current_auth),
               employee_id: str = Depends(current_employee)) -> list[CompOffOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(_SELECT + " where c.employee_id = $1 order by c.work_date desc limit 100", employee_id)
    return [_out(r) for r in rows]


# ── The approver's side ─────────────────────────────────────────────────────
@router.get("/comp-off", response_model=list[CompOffOut])
async def list_requests(status_filter: CompOffStatus | None = Query(None, alias="status"),
                        auth: AuthContext = Depends(perm("hrms.leave.read"))) -> list[CompOffOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            _SELECT + """ where ($1::text is null or c.status = $1)
                          order by c.status = 'pending' desc, c.work_date desc limit 300""", status_filter)
    return [_out(r) for r in rows]


async def _decide(conn: asyncpg.Connection, auth: AuthContext, request_id: UUID) -> asyncpg.Record:
    row = await conn.fetchrow(_SELECT + " where c.id = $1 for update of c", request_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comp-off request not found")
    if row["claimant_user"] is not None and str(row["claimant_user"]) == auth.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can't decide your own comp-off")
    if row["status"] != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, f"This request was already {row['status']}")
    return row


@router.post("/comp-off/{comp_off_id}/approve", response_model=CompOffOut)
async def approve(comp_off_id: UUID, body: CompOffApprove,
                  auth: AuthContext = Depends(perm("hrms.leave.approve"))) -> CompOffOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        row = await _decide(conn, auth, comp_off_id)
        lt = await leave.resolve_type(conn, auth.tenant_id, type_id=body.leave_type_id)
        today: date = await conn.fetchval("select current_date")
        cycle, _ = leave.cycle_bounds(today, lt["cycle_start_month"])
        await conn.execute(
            """insert into hrms_leave_ledger (tenant_id, employee_id, leave_type_id, cycle_start, entry, days, note,
                                              created_by)
               values ($1, $2, $3, $4, 'comp_off', $5, $6, $7)""",
            auth.tenant_id, row["employee_id"], lt["id"], cycle, row["days"],
            f"comp-off for {row['work_date']:%d %b %Y}", auth.user_id)
        await conn.execute(
            """update hrms_comp_off_requests set status = 'approved', leave_type_id = $2, decided_by = $3,
                      decided_at = now(), decision_note = $4 where id = $1""",
            comp_off_id, lt["id"], auth.user_id, body.note)
        return _out(await conn.fetchrow(_SELECT + " where c.id = $1", comp_off_id))


@router.post("/comp-off/{comp_off_id}/reject", response_model=CompOffOut)
async def reject(comp_off_id: UUID, body: CompOffReject,
                 auth: AuthContext = Depends(perm("hrms.leave.approve"))) -> CompOffOut:
    if not body.note.strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Say why it's rejected")
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        await _decide(conn, auth, comp_off_id)
        await conn.execute(
            """update hrms_comp_off_requests set status = 'rejected', decided_by = $2, decided_at = now(),
                      decision_note = $3 where id = $1""", comp_off_id, auth.user_id, body.note)
        return _out(await conn.fetchrow(_SELECT + " where c.id = $1", comp_off_id))


# ── Encashment ──────────────────────────────────────────────────────────────
def encash_amount(base_minor: int, days: Decimal) -> tuple[int, int]:
    """(per-day rate, amount) in paisa: salary ÷ 30 a day, each rounded half-up once."""
    per_day = int((Decimal(base_minor) / DAYS_PER_MONTH).quantize(Decimal(1), ROUND_HALF_UP))
    amount = int((Decimal(base_minor) * days / DAYS_PER_MONTH).quantize(Decimal(1), ROUND_HALF_UP))
    return per_day, amount


def _encash(r: asyncpg.Record, *, show_pay: bool = True) -> EncashOut:
    return EncashOut(id=str(r["id"]), employee_id=str(r["employee_id"]), leave_type_id=str(r["leave_type_id"]),
                     leave_type_name=r["leave_type_name"], days=float(r["days"]),
                     per_day_minor=r["per_day_minor"] if show_pay else None,
                     amount_minor=r["amount_minor"] if show_pay else None, one_off_id=str(r["one_off_id"]) if r["one_off_id"] else None,
                     note=r["note"], created_at=r["created_at"])


_ENCASH = """select x.*, lt.name as leave_type_name from hrms_leave_encashments x
               join hrms_leave_types lt on lt.id = x.leave_type_id"""


async def encash(conn: asyncpg.Connection, auth: AuthContext, employee_id: UUID, leave_type_id: UUID,
                 days: Decimal, note: str) -> asyncpg.Record:
    """Shared with the final settlement: checks the balance, pays and books it."""
    lt = await leave.resolve_type(conn, auth.tenant_id, type_id=leave_type_id)
    left = next((b.remaining for b in await leave.balances(conn, auth.tenant_id, str(employee_id))
                 if b.leave_type_id == str(lt["id"])), 0.0)
    if Decimal(str(left)) < days:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Only {left:g} day(s) of {lt['name']} are left")
    base = await conn.fetchval(
        """select base_minor from hrms_compensation where employee_id = $1 and effective_from <= current_date
            order by effective_from desc, seq desc limit 1""", employee_id)
    per_day, amount = encash_amount(int(base or 0), days)
    one_off = None
    if amount > 0:
        one_off = await conn.fetchval(
            """insert into pay_one_offs (tenant_id, employee_id, period, code, name, kind, amount_minor, taxable,
                                         note, created_by)
               values ($1, $2, $3, 'LEAVE_ENCASH', $4, 'earning', $5, true, $6, $7) returning id""",
            auth.tenant_id, employee_id, await payroll_data.next_pay_month(conn),
            f"Leave encashed: {days:g} day(s) {lt['name']}"[:120], amount, note, auth.user_id)
    today: date = await conn.fetchval("select current_date")
    cycle, _ = leave.cycle_bounds(today, lt["cycle_start_month"])
    await conn.execute(
        """insert into hrms_leave_ledger (tenant_id, employee_id, leave_type_id, cycle_start, entry, days, note,
                                          created_by)
           values ($1, $2, $3, $4, 'encash', $5, $6, $7)""",
        auth.tenant_id, employee_id, lt["id"], cycle, -days, note or "encashed", auth.user_id)
    eid = await conn.fetchval(
        """insert into hrms_leave_encashments (tenant_id, employee_id, leave_type_id, days, per_day_minor,
                                               amount_minor, one_off_id, note, created_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id""",
        auth.tenant_id, employee_id, lt["id"], days, per_day, amount, one_off, note, auth.user_id)
    row: asyncpg.Record = await conn.fetchrow(_ENCASH + " where x.id = $1", eid)
    return row


@router.post("/employees/{employee_id}/leave-encashments", response_model=EncashOut,
             status_code=status.HTTP_201_CREATED)
async def create_encashment(employee_id: UUID, body: EncashIn,
                            auth: AuthContext = Depends(perm("hrms.leave.adjust"))) -> EncashOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        if not await rbac.holds_key(conn, auth, "payroll.salary.update"):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Encashing leave is pay: it needs payroll.salary.update")
        await refs.ensure_visible(conn, "hrms_employees", employee_id)
        user = await conn.fetchval("select user_id from hrms_employees where id = $1 for update", employee_id)
        if user is not None and str(user) == auth.user_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You can't encash your own leave")
        return _encash(await encash(conn, auth, employee_id, body.leave_type_id, Decimal(str(body.days)), body.note))


@router.get("/employees/{employee_id}/leave-encashments", response_model=list[EncashOut])
async def list_encashments(employee_id: UUID, auth: AuthContext = Depends(perm("hrms.leave.read"))) -> list[EncashOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "hrms_employees", employee_id)
        show = await rbac.holds_key(conn, auth, "payroll.salary.read")
        rows = await conn.fetch(_ENCASH + " where x.employee_id = $1 order by x.created_at desc", employee_id)
    return [_encash(r, show_pay=show) for r in rows]
