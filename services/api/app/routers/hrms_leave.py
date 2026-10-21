"""Leave v2 endpoints (checklist 3F, D-44, migration 0068): leave types,
requests with half days, the manager → HR chain, the ledger, and the
employee's own leave under /me. The rules are in app/leave.py."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from .. import audit, db, hrorg, leave, refs
from ..deps import AuthContext, current_auth, current_employee
from ..models import (
    Decision,
    LeaveBalance,
    LeaveCreate,
    LeaveOut,
    LeavePolicyOut,
    LeavePolicyUpdate,
    LeaveTypeCreate,
    LeaveTypeOut,
    LeaveTypeUpdate,
    LedgerAdjust,
    LedgerEntryOut,
    RequestType,
)
from ..rbac import perm

router = APIRouter(prefix="/hrms", tags=["hrms-leave"])
portal = APIRouter(prefix="/me", tags=["portal"])

_TYPE_FIELDS = list(LeaveTypeCreate.model_fields)


def _type(r: Any) -> LeaveTypeOut:
    data = {k: r[k] for k in _TYPE_FIELDS}
    for k in ("days_per_year", "carry_cap_days", "allow_negative_days", "max_balance_days"):
        data[k] = float(data[k]) if data[k] is not None else None
    return LeaveTypeOut(id=str(r["id"]), **data)


# ── Types ───────────────────────────────────────────────────────────────────
@router.get("/leave-types", response_model=list[LeaveTypeOut])
async def list_leave_types(auth: AuthContext = Depends(perm("hrms.leave.read"))) -> list[LeaveTypeOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await leave.ensure_types(conn, auth.tenant_id)
        rows = await conn.fetch("select * from hrms_leave_types order by sort, name")
    return [_type(r) for r in rows]


@router.post("/leave-types", response_model=LeaveTypeOut, status_code=status.HTTP_201_CREATED)
async def create_leave_type(body: LeaveTypeCreate,
                            auth: AuthContext = Depends(perm("hrms.settings.manage"))) -> LeaveTypeOut:
    fields = body.model_dump()
    cols = ", ".join(fields)
    params = ", ".join(f"${i + 2}" for i in range(len(fields)))
    async with db.tenant_conn(auth.tenant_id) as conn:
        await leave.ensure_types(conn, auth.tenant_id)
        row = await conn.fetchrow(
            f"insert into hrms_leave_types (tenant_id, {cols}) values ($1, {params}) "
            "on conflict (tenant_id, code) do nothing returning *", auth.tenant_id, *fields.values())
        if row is None:
            raise HTTPException(status.HTTP_409_CONFLICT, f"A leave type with code {body.code!r} already exists.")
    return _type(row)


@router.patch("/leave-types/{type_id}", response_model=LeaveTypeOut)
async def update_leave_type(type_id: str, body: LeaveTypeUpdate,
                            auth: AuthContext = Depends(perm("hrms.settings.manage"))) -> LeaveTypeOut:
    """Edit a template or a type of your own. Changing days per year tops up
    or trims this year's grants with new ledger entries."""
    fields = {k: getattr(body, k) for k in body.model_fields_set}
    nullable = {"carry_expires_after_months", "max_balance_days", "max_consecutive_days"}
    fields = {k: v for k, v in fields.items() if v is not None or k in nullable}
    if not fields:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing to update")
    cols = ", ".join(f"{k}=${i + 2}" for i, k in enumerate(fields))
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow(f"update hrms_leave_types set {cols} where id=$1 returning *", type_id,
                                  *fields.values())
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Leave type not found")
        if "days_per_year" in fields:
            await leave.regrant(conn, type_id)
    return _type(row)


# ── The 0021 policy shape, kept for older clients ───────────────────────────
_POLICY_CODES = {"annual_days": "annual", "sick_days": "sick", "casual_days": "casual"}


async def _policy(conn: Any, tenant_id: str) -> LeavePolicyOut:
    await leave.ensure_types(conn, tenant_id)
    days = {r["code"]: int(r["days_per_year"]) for r in await conn.fetch(
        "select code, days_per_year from hrms_leave_types where code = any($1::text[])", list(_POLICY_CODES.values()))}
    return LeavePolicyOut(**{f: days.get(c, 0) for f, c in _POLICY_CODES.items()})


@router.get("/leave/policy", response_model=LeavePolicyOut)
async def get_leave_policy(auth: AuthContext = Depends(perm("hrms.leave.read"))) -> LeavePolicyOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await _policy(conn, auth.tenant_id)


@router.put("/leave/policy", response_model=LeavePolicyOut)
async def update_leave_policy(body: LeavePolicyUpdate,
                              auth: AuthContext = Depends(perm("hrms.settings.manage"))) -> LeavePolicyOut:
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing to update")
    async with db.tenant_conn(auth.tenant_id) as conn:
        await leave.ensure_types(conn, auth.tenant_id)
        for f, days in fields.items():
            tid = await conn.fetchval("update hrms_leave_types set days_per_year=$2 where code=$1 returning id",
                                      _POLICY_CODES[f], days)
            if tid:
                await leave.regrant(conn, tid)
        return await _policy(conn, auth.tenant_id)


# ── Requests ────────────────────────────────────────────────────────────────
@router.get("/leave", response_model=list[LeaveOut])
async def list_leave(request_type: RequestType | None = None,
                     state: str | None = Query(default=None, alias="status", pattern=r"^[a-z_]{1,20}$"),
                     auth: AuthContext = Depends(perm("hrms.leave.read"))) -> list[LeaveOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            leave.LEAVE_SELECT + """ where ($1::text is null or l.request_type = $1)
                                       and ($2::text is null or l.status = $2)
                                     order by l.created_at desc limit 500""", request_type, state)
    return [leave.leave_out(r) for r in rows]


@router.post("/leave", response_model=LeaveOut, status_code=status.HTTP_201_CREATED)
async def create_leave(body: LeaveCreate, auth: AuthContext = Depends(perm("hrms.leave.request"))) -> LeaveOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "hrms_employees", body.employee_id)
        rid = await leave.create_request(conn, auth, body.employee_id, body)
        return leave.leave_out(await conn.fetchrow(leave.LEAVE_SELECT + " where l.id=$1", rid))


@router.get("/leave/balances", response_model=list[LeaveBalance])
async def leave_balances(employee_id: str, auth: AuthContext = Depends(perm("hrms.leave.read"))) -> list[LeaveBalance]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "hrms_employees", employee_id)
        return await leave.balances(conn, auth.tenant_id, employee_id)


@router.get("/leave/ledger", response_model=list[LedgerEntryOut])
async def leave_ledger(employee_id: str, leave_type_id: str | None = None,
                       auth: AuthContext = Depends(perm("hrms.leave.read"))) -> list[LedgerEntryOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "hrms_employees", employee_id)
        rows = await conn.fetch(
            """select g.*, lt.code from hrms_leave_ledger g join hrms_leave_types lt on lt.id = g.leave_type_id
                where g.employee_id=$1 and ($2::uuid is null or g.leave_type_id = $2::uuid)
                order by g.cycle_start desc, g.created_at desc limit 500""", employee_id, leave_type_id)
    return [LedgerEntryOut(id=str(r["id"]), leave_type_id=str(r["leave_type_id"]), leave_type=r["code"],
                           cycle_start=r["cycle_start"], entry=r["entry"], days=float(r["days"]),
                           period_key=r["period_key"],
                           ref_request_id=str(r["ref_request_id"]) if r["ref_request_id"] else None,
                           note=r["note"], created_at=r["created_at"]) for r in rows]


@router.post("/leave/ledger/adjust", response_model=list[LeaveBalance], status_code=status.HTTP_201_CREATED)
async def adjust_ledger(body: LedgerAdjust,
                        auth: AuthContext = Depends(perm("hrms.leave.adjust"))) -> list[LeaveBalance]:
    """HR corrects a balance with a reason; audited. Never your own."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        emp_user = await conn.fetchval("select user_id from hrms_employees where id=$1", body.employee_id)
        if emp_user is None and not await conn.fetchval("select 1 from hrms_employees where id=$1", body.employee_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
        if emp_user is not None and str(emp_user) == auth.user_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You can't adjust your own leave balance.")
        lt = await conn.fetchrow("select * from hrms_leave_types where id=$1", body.leave_type_id)
        if lt is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Leave type not found")
        today = await conn.fetchval("select current_date")
        cs, _ = leave.cycle_bounds(today, lt["cycle_start_month"])
        await conn.execute(
            """insert into hrms_leave_ledger (tenant_id, employee_id, leave_type_id, cycle_start, entry, days, note,
                                              created_by)
               values ($1,$2,$3,$4,'adjust',$5,btrim($6),$7)""",
            auth.tenant_id, body.employee_id, body.leave_type_id, cs, body.days, body.note, auth.user_id)
        await audit.event(conn, "hrms.leave.adjust", "hrms_employees", str(body.employee_id),
                          data={"leave_type": lt["code"], "days": body.days, "note": body.note})
        return await leave.balances(conn, auth.tenant_id, str(body.employee_id))


@router.post("/leave/{leave_id}/cancel", response_model=LeaveOut)
async def hr_cancel_leave(leave_id: str, auth: AuthContext = Depends(current_auth)) -> LeaveOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        emp = await conn.fetchval("select employee_id from hrms_leave_requests where id=$1", leave_id)
        if emp is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Leave request not found")
        await hrorg.approver_role(conn, auth, str(emp), requested_by=None, key="hrms.leave.approve")
        await leave.cancel(conn, auth, leave_id)
        return leave.leave_out(await conn.fetchrow(leave.LEAVE_SELECT + " where l.id=$1", leave_id))


@router.post("/leave/{leave_id}/{decision}", response_model=LeaveOut)
async def decide_leave(leave_id: str, decision: str, body: Decision | None = None,
                       auth: AuthContext = Depends(current_auth)) -> LeaveOut:
    """Approve or reject the current step. Needs hrms.leave.approve; the
    employee's manager decides the manager step, anyone else with the key
    decides as HR. Never your own leave; only pending requests."""
    if decision not in ("approve", "reject"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "decision must be approve or reject")
    async with db.tenant_conn(auth.tenant_id) as conn:
        await leave.decide(conn, auth, leave_id, decision, (body or Decision()).note)
        return leave.leave_out(await conn.fetchrow(leave.LEAVE_SELECT + " where l.id=$1", leave_id))


# ── The employee's own (/me) ────────────────────────────────────────────────
@portal.get("/leave", response_model=list[LeaveOut])
async def my_leave(auth: AuthContext = Depends(current_auth),
                   employee_id: str = Depends(current_employee)) -> list[LeaveOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(leave.LEAVE_SELECT + " where l.employee_id=$1 order by l.created_at desc",
                                employee_id)
    return [leave.leave_out(r) for r in rows]


@portal.get("/leave/balances", response_model=list[LeaveBalance])
async def my_balances(auth: AuthContext = Depends(current_auth),
                      employee_id: str = Depends(current_employee)) -> list[LeaveBalance]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await leave.balances(conn, auth.tenant_id, employee_id)


@portal.get("/leave-types", response_model=list[LeaveTypeOut])
async def my_leave_types(auth: AuthContext = Depends(current_auth),
                         employee_id: str = Depends(current_employee)) -> list[LeaveTypeOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await leave.ensure_types(conn, auth.tenant_id)
        rows = await conn.fetch("select * from hrms_leave_types where active order by sort, name")
    return [_type(r) for r in rows]


@portal.post("/leave", response_model=LeaveOut, status_code=status.HTTP_201_CREATED)
async def my_request_leave(body: LeaveCreate, auth: AuthContext = Depends(current_auth),
                           employee_id: str = Depends(current_employee)) -> LeaveOut:
    """An employee requests their own leave: the employee_id in the body is
    ignored and forced to the caller."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        rid = await leave.create_request(conn, auth, employee_id, body)
        return leave.leave_out(await conn.fetchrow(leave.LEAVE_SELECT + " where l.id=$1", rid))


@portal.post("/leave/{leave_id}/cancel", response_model=LeaveOut)
async def my_cancel_leave(leave_id: str, auth: AuthContext = Depends(current_auth),
                          employee_id: str = Depends(current_employee)) -> LeaveOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await leave.cancel(conn, auth, leave_id, own_employee=employee_id)
        return leave.leave_out(await conn.fetchrow(leave.LEAVE_SELECT + " where l.id=$1", leave_id))
