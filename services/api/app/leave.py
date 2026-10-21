"""Leave v2: types, the append-only ledger and the approval chain (D-44,
migration 0068, St03 §6.4, TRD §6.8).

* Balance = sum(days) in hrms_leave_ledger for (employee, type, leave year);
  nothing else stores one. Entries: `grant` (the year's days up front,
  prorated for a joiner with a join date), `accrual` (monthly), `carry_in` /
  `carry_expire`, `taken` (negative, on approval), `reversal` (on cancelling
  an approved request), `adjust` (HR, with a reason). Unique keys make every
  writer idempotent: running the entitlement job twice changes nothing.
* A request's length is working days for that employee — weekly off days
  and their holidays (federal, company, their province) don't count unless
  the type includes holidays; a half day counts 0.5. It is frozen at
  submission and recounted at approval.
* Approval: per type, none | manager | hr | manager_then_hr. The manager is
  the employee's manager's login; everyone deciding needs hrms.leave.approve
  (the link alone grants nothing). The employee never decides their own
  request, only pending requests are decided, the same person can't decide
  both steps, and a balance that doesn't cover the days blocks approval
  unless the type allows going negative.

For payroll: leave_in_period() / unpaid_leave_days() below.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Literal

import asyncpg
from fastapi import HTTPException, status

from . import audit, holidays, hrorg
from .deps import AuthContext
from .models import LeaveBalance, LeaveCreate, LeaveOut

ZERO = Decimal(0)
ONE = Decimal(1)
HALF = Decimal("0.5")
_ADJUSTING = ("grant", "accrual", "carry_in", "carry_expire", "adjust")


# ── Calendar arithmetic ─────────────────────────────────────────────────────
def cycle_bounds(d: date, start_month: int) -> tuple[date, date]:
    """The leave year containing `d` (it starts on the 1st of start_month)."""
    y = d.year if d.month >= start_month else d.year - 1
    return date(y, start_month, 1), date(y + 1, start_month, 1) - timedelta(days=1)


def add_months(d: date, n: int) -> date:
    m = d.month - 1 + n
    return date(d.year + m // 12, m % 12 + 1, 1)


def round_half(x: Decimal) -> Decimal:
    """To the nearest half day, halves up (St03: 3.25 -> 3.5)."""
    return (x * 2).quantize(ONE, ROUND_HALF_UP) / 2


def fmt(x: Decimal | float) -> str:
    v = float(x)
    return str(int(v)) if v == int(v) else f"{v:g}"


def check_halves(start: date, end: date, from_half: str | None, to_half: str | None, allowed: bool) -> None:
    if (from_half or to_half) and not allowed:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "This leave type is taken in whole days.")
    if start == end:
        if from_half and to_half and from_half != to_half:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                "Morning and afternoon is the whole day: leave the half-day option off.")
    elif from_half not in (None, "pm") or to_half not in (None, "am"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            "A longer leave can start after lunch (pm) and end at lunchtime (am).")


async def day_weights(conn: asyncpg.Connection, employee_id: Any, lt: asyncpg.Record, start: date, end: date,
                      from_half: str | None = None, to_half: str | None = None) -> dict[date, Decimal]:
    """Each day of the request that costs leave, and how much (1 or 0.5)."""
    off = set(await conn.fetchval(
        "select weekly_off_days from tenants where id = current_setting('app.tenant_id')::uuid") or [0])
    hol = await holidays.for_employee(conn, str(employee_id), start, end)
    out: dict[date, Decimal] = {}
    d = start
    while d <= end:
        if lt["include_holidays"]:
            w = ONE
        elif d.isoweekday() % 7 in off:          # ISO Mon=1..Sun=7 -> dow Sun=0
            w = ZERO
        elif d in hol:
            w = HALF if hol[d].half_day else ZERO
        else:
            w = ONE
        if start == end:
            if from_half or to_half:
                w = min(w, HALF)
        else:
            if d == start and from_half == "pm":
                w = min(w, HALF)
            if d == end and to_half == "am":
                w = min(w, HALF)
        if w > 0:
            out[d] = w
        d += timedelta(days=1)
    return out


# ── Types ───────────────────────────────────────────────────────────────────
async def ensure_types(conn: asyncpg.Connection, tenant_id: str) -> None:
    """The Pakistani templates, seeded on first use (signups after 0068).
    A type the tenant renamed or switched off is left as they set it."""
    await conn.execute("select hrms_seed_leave_types($1)", tenant_id)


async def resolve_type(conn: asyncpg.Connection, tenant_id: str, *, type_id: Any = None,
                       code: str | None = None) -> asyncpg.Record:
    await ensure_types(conn, tenant_id)
    if type_id is not None:
        lt = await conn.fetchrow("select * from hrms_leave_types where id=$1", type_id)
    else:
        lt = await conn.fetchrow("select * from hrms_leave_types where code=$1", code)
    if lt is None or not lt["active"]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown leave type.")
    return lt


# ── Entitlements: grant, accrual, carry-forward, expiry ─────────────────────
async def _sum(conn: asyncpg.Connection, employee_id: Any, type_id: Any, cycle_start: date,
               entries: tuple[str, ...] | None = None) -> Decimal:
    v = await conn.fetchval(
        """select coalesce(sum(days), 0) from hrms_leave_ledger
            where employee_id=$1 and leave_type_id=$2 and cycle_start=$3
              and ($4::text[] is null or entry = any($4::text[]))""",
        employee_id, type_id, cycle_start, list(entries) if entries else None)
    return Decimal(v)


async def _put(conn: asyncpg.Connection, emp: asyncpg.Record, lt: asyncpg.Record, cycle_start: date, entry: str,
               days: Decimal, key: str, note: str) -> None:
    await conn.execute(
        """insert into hrms_leave_ledger (tenant_id, employee_id, leave_type_id, cycle_start, entry, days,
                                          period_key, note)
           values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing""",
        emp["tenant_id"], emp["id"], lt["id"], cycle_start, entry, days, key, note)


def _eligible(emp: asyncpg.Record, lt: asyncpg.Record, cycle_start: date) -> date:
    """From when the employee earns this type. No join date: since before
    the leave year (the pre-ledger behaviour), unless a waiting period
    applies, which then runs from when they were added."""
    wait = timedelta(days=lt["accrual_start_after_days"])
    joined: date | None = emp["join_date"]
    added: date = emp["created_on"]
    if joined is not None:
        return joined + wait
    return added + wait if lt["accrual_start_after_days"] else cycle_start


def year_grant(emp: asyncpg.Record, lt: asyncpg.Record, cycle_start: date, cycle_end: date) -> Decimal:
    days = Decimal(lt["days_per_year"])
    eligible = _eligible(emp, lt, cycle_start)
    if lt["prorate_joiners"] and eligible > cycle_start:
        months = (cycle_end.year - eligible.year) * 12 + cycle_end.month - eligible.month + 1
        days = round_half(days * months / 12)
    return days


_EMP = """select id, tenant_id, join_date, created_at::date as created_on, status
            from hrms_employees where id = $1"""


async def ensure_entitlements(conn: asyncpg.Connection, employee_id: Any, on: date) -> None:
    """Bring one employee's ledger up to `on` for every active type that
    grants days: idempotent (the ledger's unique keys)."""
    emp = await conn.fetchrow(_EMP, employee_id)
    if emp is None or emp["status"] != "active":
        return
    for lt in await conn.fetch("select * from hrms_leave_types where active and grant_mode <> 'none'"):
        cs, ce = cycle_bounds(on, lt["cycle_start_month"])
        eligible = _eligible(emp, lt, cs)
        if eligible > ce or eligible > on:
            continue
        # Carry forward last year's unused days, before this year's grant.
        if lt["carry_forward"] != "none":
            prev = add_months(cs, -12)
            left = await _sum(conn, emp["id"], lt["id"], prev)
            has_prev = await conn.fetchval(
                "select 1 from hrms_leave_ledger where employee_id=$1 and leave_type_id=$2 and cycle_start=$3 limit 1",
                emp["id"], lt["id"], prev)
            if has_prev and left > 0:
                carry = left if lt["carry_forward"] == "all" else min(left, Decimal(lt["carry_cap_days"]))
                if carry > 0:
                    await _put(conn, emp, lt, cs, "carry_in", carry, f"carry:{cs}", f"Carried forward from {prev:%Y}")
        if lt["grant_mode"] == "annual_upfront":
            await _put(conn, emp, lt, cs, "grant", year_grant(emp, lt, cs, ce), f"cycle:{cs}",
                       f"{lt['name']} for the year from {cs:%d %b %Y}")
        elif not await conn.fetchval(
                """select 1 from hrms_leave_ledger where employee_id=$1 and leave_type_id=$2 and cycle_start=$3
                    and entry='grant' limit 1""", emp["id"], lt["id"], cs):
            # Monthly accrual, on the 1st, for each month from eligibility
            # to `on` — skipped in a year already granted up front.
            per = (Decimal(lt["days_per_year"]) / 12).quantize(Decimal("0.01"), ROUND_HALF_UP)
            m = max(cs, eligible if eligible.day == 1 else add_months(eligible, 1))
            while m <= on:
                amount = per
                if lt["max_balance_days"] is not None:
                    room = Decimal(lt["max_balance_days"]) - await _sum(conn, emp["id"], lt["id"], cs)
                    amount = max(ZERO, min(per, room))
                await _put(conn, emp, lt, cs, "accrual", amount, f"{m:%Y-%m}", f"Accrued for {m:%b %Y}")
                m = add_months(m, 1)
        # Carried days not used within the expiry window lapse.
        if lt["carry_expires_after_months"] and on >= add_months(cs, lt["carry_expires_after_months"]):
            carried = await _sum(conn, emp["id"], lt["id"], cs, ("carry_in",))
            if carried > 0:
                used = -await _sum(conn, emp["id"], lt["id"], cs, ("taken", "reversal"))
                balance = await _sum(conn, emp["id"], lt["id"], cs)
                lapse = min(max(ZERO, carried - used), max(ZERO, balance))
                await _put(conn, emp, lt, cs, "carry_expire", -lapse, f"carry_expire:{cs}",
                           "Carried-forward days not used in time")


async def run_entitlements(conn: asyncpg.Connection, on: date | None = None) -> int:
    """The daily job, per tenant: every active employee's ledger up to
    today (grants at the start of a leave year, the monthly accrual,
    carry-forward and expiry). Returns how many employees it looked at."""
    on = on or await conn.fetchval("select current_date")
    tenant = await conn.fetchval("select current_setting('app.tenant_id')")
    await ensure_types(conn, tenant)
    ids = [r["id"] for r in await conn.fetch("select id from hrms_employees where status='active' order by id")]
    for eid in ids:
        await ensure_entitlements(conn, eid, on)
    return len(ids)


async def regrant(conn: asyncpg.Connection, lt_id: Any, on: date | None = None) -> None:
    """After a type's days per year change, top up (or trim) this year's
    up-front grant for everyone already granted — as new entries; the ledger
    is never rewritten."""
    on = on or await conn.fetchval("select current_date")
    lt = await conn.fetchrow("select * from hrms_leave_types where id=$1", lt_id)
    if lt is None or lt["grant_mode"] != "annual_upfront":
        return
    cs, ce = cycle_bounds(on, lt["cycle_start_month"])
    for r in await conn.fetch(
            """select employee_id, sum(days) as have from hrms_leave_ledger
                where leave_type_id=$1 and cycle_start=$2 and entry='grant' group by employee_id""", lt["id"], cs):
        emp = await conn.fetchrow(_EMP, r["employee_id"])
        delta = year_grant(emp, lt, cs, ce) - Decimal(r["have"])
        if delta != 0:
            await _put(conn, emp, lt, cs, "grant", delta, f"regrant:{cs}:{uuid.uuid4().hex[:12]}",
                       f"Days per year changed to {fmt(lt['days_per_year'])}")


# ── Balances ────────────────────────────────────────────────────────────────
async def balances(conn: asyncpg.Connection, tenant_id: str, employee_id: Any,
                   on: date | None = None) -> list[LeaveBalance]:
    on = on or await conn.fetchval("select current_date")
    await ensure_types(conn, tenant_id)
    await ensure_entitlements(conn, employee_id, on)
    out = []
    for lt in await conn.fetch(
            "select * from hrms_leave_types where active and requires_balance order by sort, name"):
        cs, ce = cycle_bounds(on, lt["cycle_start_month"])
        total = await _sum(conn, employee_id, lt["id"], cs)
        used = -await _sum(conn, employee_id, lt["id"], cs, ("taken", "reversal"))
        pending = await conn.fetchval(
            """select coalesce(sum(duration_days), 0) from hrms_leave_requests
                where employee_id=$1 and leave_type_id=$2 and status='pending' and from_date between $3 and $4""",
            employee_id, lt["id"], cs, ce)
        out.append(LeaveBalance(leave_type=lt["code"], name=lt["name"], leave_type_id=str(lt["id"]),
                                quota=float(total + used), used=float(used), remaining=float(total),
                                pending=float(pending), cycle_start=cs, cycle_end=ce))
    return out


# ── Requests ────────────────────────────────────────────────────────────────
LEAVE_SELECT = """select l.*, e.name as employee_name, lt.name as leave_type_name, lt.paid
                    from hrms_leave_requests l
                    join hrms_employees e on e.id = l.employee_id
                    left join hrms_leave_types lt on lt.id = l.leave_type_id"""


def leave_out(r: asyncpg.Record) -> LeaveOut:
    return LeaveOut(
        id=str(r["id"]), employee_id=str(r["employee_id"]), employee_name=r["employee_name"],
        request_type=r["request_type"], leave_type=r["leave_type"], from_date=r["from_date"],
        to_date=r["to_date"], reason=r["reason"], status=r["status"],
        leave_type_id=str(r["leave_type_id"]) if r["leave_type_id"] else None,
        leave_type_name=r["leave_type_name"] or r["leave_type"], paid=bool(r["paid"]) if r["paid"] is not None else True,
        from_half=r["from_half"], to_half=r["to_half"],
        duration_days=float(r["duration_days"]) if r["duration_days"] is not None else None,
        approval_step=r["approval_step"])


async def _manager_user(conn: asyncpg.Connection, employee_id: Any) -> Any:
    return await conn.fetchval(
        """select m.user_id from hrms_employees e join hrms_employees m on m.id = e.manager_id
            where e.id = $1""", employee_id)


async def create_request(conn: asyncpg.Connection, auth: AuthContext, employee_id: str,
                         body: LeaveCreate) -> str:
    """File a request for `employee_id` (HR on their behalf, or the employee
    through /me). Returns its id."""
    if body.to_date < body.from_date:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "to_date cannot be before from_date")
    code = "wfh" if body.request_type == "wfh" and body.leave_type == "annual" else body.leave_type
    lt = await resolve_type(conn, auth.tenant_id, type_id=body.leave_type_id, code=code)
    check_halves(body.from_date, body.to_date, body.from_half, body.to_half, lt["allow_half_day"])
    if lt["max_consecutive_days"] and (body.to_date - body.from_date).days + 1 > lt["max_consecutive_days"]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            f"{lt['name']} is at most {lt['max_consecutive_days']} days at a time.")
    # One request at a time per employee, so the overlap check holds.
    await conn.execute("select 1 from hrms_employees where id=$1 for update", employee_id)
    blackout = await holidays.blackout_for(conn, employee_id, body.from_date, body.to_date)
    if blackout:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"Leave can't be taken during {blackout.name} "
                            f"({blackout.date_from:%d %b} – {blackout.date_to:%d %b}).")
    # One person cannot be in two states on the same day.
    clash = await conn.fetchrow(
        """select from_date, to_date from hrms_leave_requests
            where employee_id=$1 and status in ('pending','approved')
              and from_date <= $3 and to_date >= $2 limit 1""",
        employee_id, body.from_date, body.to_date)
    if clash:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"Overlaps an existing request ({clash['from_date']} → {clash['to_date']}).")
    weights = await day_weights(conn, employee_id, lt, body.from_date, body.to_date, body.from_half, body.to_half)
    duration = sum(weights.values(), ZERO)
    if duration == 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            "Those dates are all days off or holidays — there's nothing to take.")
    if lt["approval"] == "none":
        step = "hr"
    elif lt["approval"] in ("manager", "manager_then_hr") and await _manager_user(conn, employee_id):
        step = "manager"
    else:
        step = "hr"
    rid = await conn.fetchval(
        """insert into hrms_leave_requests (tenant_id, employee_id, request_type, leave_type, leave_type_id,
                                            from_date, to_date, from_half, to_half, duration_days, reason,
                                            approval_step, requested_by)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id""",
        auth.tenant_id, employee_id, lt["counts_as"], lt["code"], lt["id"], body.from_date, body.to_date,
        body.from_half, body.to_half, duration, body.reason, step, auth.user_id)
    if lt["approval"] == "none":
        req = await conn.fetchrow("select * from hrms_leave_requests where id=$1", rid)
        await _approve_final(conn, auth, req, lt)
    return str(rid)


async def _approve_final(conn: asyncpg.Connection, auth: AuthContext, req: asyncpg.Record,
                         lt: asyncpg.Record) -> None:
    weights = await day_weights(conn, req["employee_id"], lt, req["from_date"], req["to_date"],
                                req["from_half"], req["to_half"])
    if lt["requires_balance"]:
        by_cycle: dict[date, Decimal] = {}
        for d, w in weights.items():
            cs, _ = cycle_bounds(d, lt["cycle_start_month"])
            by_cycle[cs] = by_cycle.get(cs, ZERO) + w
        today = await conn.fetchval("select current_date")
        for cs, need in sorted(by_cycle.items()):
            # This year: up to today. A future year: its up-front grant. A past one: its end.
            _, ce = cycle_bounds(cs, lt["cycle_start_month"])
            await ensure_entitlements(conn, req["employee_id"], min(max(today, cs), ce))
            total = await _sum(conn, req["employee_id"], lt["id"], cs)
            used = -await _sum(conn, req["employee_id"], lt["id"], cs, ("taken", "reversal"))
            if need > total + Decimal(lt["allow_negative_days"]):
                year = "this year" if lt["cycle_start_month"] == 1 else "this leave year"
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    f"That's {fmt(need)} working days of {lt['name'].lower()}, but only "
                    f"{fmt(max(ZERO, total))} of {fmt(total + used)} remain {year}.")
            await conn.execute(
                """insert into hrms_leave_ledger (tenant_id, employee_id, leave_type_id, cycle_start, entry, days,
                                                  ref_request_id, note, created_by)
                   values ($1,$2,$3,$4,'taken',$5,$6,$7,$8)""",
                req["tenant_id"], req["employee_id"], lt["id"], cs, -need, req["id"],
                f"{req['from_date']:%d %b} – {req['to_date']:%d %b %Y}", auth.user_id)
    await conn.execute(
        """update hrms_leave_requests set status='approved', decided_by=$2, approval_step='done', duration_days=$3
            where id=$1""", req["id"], auth.user_id, sum(weights.values(), ZERO))


async def decide(conn: asyncpg.Connection, auth: AuthContext, leave_id: str, decision: str, note: str = "") -> None:
    """Approve or reject one step of a request (see the module docstring)."""
    # Locked so two approvers can't both decide it.
    req = await conn.fetchrow("select * from hrms_leave_requests where id=$1 for update", leave_id)
    if req is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Leave request not found")
    # HR often files on someone's behalf, so the filer may decide; the
    # employee never (TR-SEC-33).
    role = await hrorg.approver_role(conn, auth, str(req["employee_id"]), requested_by=None,
                                     key="hrms.leave.approve")
    if req["status"] != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, f"This request was already {req['status']}.")
    # Decisions for one employee run one at a time: two requests that each
    # fit the remaining balance must not both pass the check.
    await conn.execute("select 1 from hrms_employees where id=$1 for update", req["employee_id"])
    step = req["approval_step"] or "hr"
    if step == "hr" and await conn.fetchval(
            "select 1 from hrms_leave_approvals where request_id=$1 and approver_user_id=$2", leave_id, auth.user_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "You approved the manager step; someone else must give the HR approval.")
    recorded = "manager" if step == "manager" and role == "manager" else "hr"
    lt = await conn.fetchrow("select * from hrms_leave_types where id=$1", req["leave_type_id"])
    await conn.execute(
        """insert into hrms_leave_approvals (tenant_id, request_id, step, approver_user_id, decision, note)
           values ($1,$2,$3,$4,$5,$6)""",
        req["tenant_id"], leave_id, recorded, auth.user_id, "approved" if decision == "approve" else "rejected", note)
    if decision == "reject":
        await conn.execute(
            "update hrms_leave_requests set status='rejected', decided_by=$2, approval_step='done' where id=$1",
            leave_id, auth.user_id)
    elif recorded == "manager" and lt is not None and lt["approval"] == "manager_then_hr":
        await conn.execute("update hrms_leave_requests set approval_step='hr' where id=$1", leave_id)
        await audit.event(conn, "hrms.leave.manager_approve", "leave_request", leave_id)
        return
    else:
        if lt is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "This request has no leave type; ask an admin.")
        await _approve_final(conn, auth, req, lt)
    new_status: Literal["approved", "rejected"] = "approved" if decision == "approve" else "rejected"
    # The row diff is audited by trigger; the decision is a semantic event
    # and an entry on the request's timeline.
    await audit.track(conn, entity_type="leave_request", entity_id=leave_id, kind=new_status,
                      event=f"hrms.leave.{decision}")


async def cancel(conn: asyncpg.Connection, auth: AuthContext, leave_id: str, *,
                 own_employee: str | None = None) -> None:
    """Withdraw a request. Pending: just cancelled. Approved: its days come
    back as `reversal` entries — by HR, or by the employee before it starts;
    never once its days are in a locked payroll run (offset with an
    adjustment instead)."""
    req = await conn.fetchrow("select * from hrms_leave_requests where id=$1 for update", leave_id)
    if req is None or (own_employee is not None and str(req["employee_id"]) != own_employee):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Leave request not found")
    if req["status"] not in ("pending", "approved"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"This request was already {req['status']}.")
    if req["status"] == "approved":
        today = await conn.fetchval("select current_date")
        if own_employee is not None and req["from_date"] <= today:
            raise HTTPException(status.HTTP_409_CONFLICT, "This leave has started. Ask HR to change it.")
        if await conn.fetchval(
                """select 1 from hrms_attendance where employee_id=$1 and locked
                    and work_date between $2 and $3 limit 1""", req["employee_id"], req["from_date"], req["to_date"]):
            raise HTTPException(status.HTTP_409_CONFLICT,
                                "Part of this leave is in a locked payroll run. Adjust the balance instead.")
        await conn.execute(
            """insert into hrms_leave_ledger (tenant_id, employee_id, leave_type_id, cycle_start, entry, days,
                                              ref_request_id, note, created_by)
               select tenant_id, employee_id, leave_type_id, cycle_start, 'reversal', -days, ref_request_id,
                      'Cancelled', $2
                 from hrms_leave_ledger where ref_request_id=$1 and entry='taken'
               on conflict do nothing""", leave_id, auth.user_id)
    await conn.execute(
        """update hrms_leave_requests set status='cancelled', cancelled_at=now(), cancelled_by=$2,
                  approval_step='done' where id=$1""", leave_id, auth.user_id)
    await audit.event(conn, "hrms.leave.cancel", "leave_request", leave_id)


async def team_pending(conn: asyncpg.Connection, user_id: str) -> list[LeaveOut]:
    """Pending leave from the caller's direct reports, at the manager step."""
    rows = await conn.fetch(
        LEAVE_SELECT + """ join hrms_employees m on m.id = e.manager_id
                           where l.status = 'pending' and l.approval_step = 'manager' and m.user_id = $1
                           order by l.from_date""", user_id)
    return [leave_out(r) for r in rows]


# ── For payroll ─────────────────────────────────────────────────────────────
@dataclass
class PeriodLeave:
    """Approved leave inside a pay period, in working days (half = 0.5)."""
    paid: Decimal = ZERO
    unpaid: Decimal = ZERO
    wfh: Decimal = ZERO
    # day -> ('paid' | 'unpaid' | 'wfh', 1 or 0.5)
    days: dict[date, tuple[str, Decimal]] = field(default_factory=dict)


async def leave_in_period(conn: asyncpg.Connection, employee_id: str, start: date, end: date) -> PeriodLeave:
    """Approved leave and WFH for one employee between start and end
    (inclusive), counted on their own working-day calendar."""
    out = PeriodLeave()
    for r in await conn.fetch(
            """select l.*, lt.paid, lt.counts_as, lt.include_holidays
                 from hrms_leave_requests l join hrms_leave_types lt on lt.id = l.leave_type_id
                where l.employee_id=$1 and l.status='approved' and l.from_date <= $3 and l.to_date >= $2
                order by l.from_date""", employee_id, start, end):
        weights = await day_weights(conn, employee_id, r, r["from_date"], r["to_date"], r["from_half"], r["to_half"])
        kind = "wfh" if r["counts_as"] == "wfh" else ("paid" if r["paid"] else "unpaid")
        for d, w in weights.items():
            if start <= d <= end:
                out.days[d] = (kind, w)
                setattr(out, kind, getattr(out, kind) + w)
    return out


async def unpaid_leave_days(conn: asyncpg.Connection, employee_id: str, start: date, end: date) -> Decimal:
    """Approved unpaid leave days for one employee in [start, end] — what
    payroll deducts. Half days count 0.5. Call inside the tenant's
    connection (RLS)."""
    return (await leave_in_period(conn, employee_id, start, end)).unpaid
