"""Provident fund members and balances (0113; see app/provident_fund.py).

A balance is pay: payroll.salary.read sees it, payroll.salary.update enrols
people and records entries (never on their own fund). Members see their own
fund on /me.
"""
from __future__ import annotations

from datetime import date
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from .. import db, provident_fund, refs
from ..deps import AuthContext, current_auth, current_employee
from ..payroll_models import PfBalance, PfEntryIn, PfHistoryRow, PfMembershipIn
from ..rbac import perm

router = APIRouter(prefix="/payroll", tags=["payroll"])
portal = APIRouter(prefix="/me", tags=["portal"])


async def _balance(conn: asyncpg.Connection, employee_id: UUID | str, *, with_history: bool = True) -> PfBalance:
    e = await conn.fetchrow("select pf_member, pf_joined_on from hrms_employees where id = $1", employee_id)
    b = await provident_fund.balance(conn, employee_id)
    rows = await provident_fund.history(conn, employee_id) if with_history else []
    return PfBalance(employee_id=str(employee_id), member=e["pf_member"], joined_on=e["pf_joined_on"],
                     employee_minor=b.employee_minor, employer_minor=b.employer_minor,
                     vested_employer_minor=b.vested_employer_minor,
                     history=[PfHistoryRow(on=r["on"], what=r["what"], employee_minor=int(r["employee_minor"]),
                                           employer_minor=int(r["employer_minor"])) for r in rows])


async def _not_own(conn: asyncpg.Connection, auth: AuthContext, employee_id: UUID) -> None:
    owner = await conn.fetchval("select user_id from hrms_employees where id = $1", employee_id)
    if owner is not None and str(owner) == auth.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Someone else has to change your own provident fund")


@router.get("/pf/{employee_id}", response_model=PfBalance)
async def get_fund(employee_id: UUID, auth: AuthContext = Depends(perm("payroll.salary.read"))) -> PfBalance:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "hrms_employees", employee_id)
        return await _balance(conn, employee_id)


@router.put("/pf/{employee_id}", response_model=PfBalance)
async def set_membership(employee_id: UUID, body: PfMembershipIn,
                         auth: AuthContext = Depends(perm("payroll.salary.update"))) -> PfBalance:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        await refs.ensure_visible(conn, "hrms_employees", employee_id)
        await _not_own(conn, auth, employee_id)
        joined: date | None = None
        if body.member:
            joined = body.joined_on or await conn.fetchval("select current_date")
        await conn.execute(
            """update hrms_employees set pf_member = $2,
                      pf_joined_on = case when $2 then coalesce(pf_joined_on, $3) else pf_joined_on end
                where id = $1""", employee_id, body.member, joined)
        if body.member and body.joined_on is not None:
            await conn.execute("update hrms_employees set pf_joined_on = $2 where id = $1", employee_id, body.joined_on)
        return await _balance(conn, employee_id)


@router.post("/pf/{employee_id}/entries", response_model=PfBalance, status_code=status.HTTP_201_CREATED)
async def add_entry(employee_id: UUID, body: PfEntryIn,
                    auth: AuthContext = Depends(perm("payroll.salary.update"))) -> PfBalance:
    """An opening balance (money brought in), a withdrawal (paid out to the
    member while they stay) or an adjustment. A withdrawal is entered as
    amounts taken out and can't take more than is there."""
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        await refs.ensure_visible(conn, "hrms_employees", employee_id)
        await _not_own(conn, auth, employee_id)
        await conn.execute("select 1 from hrms_employees where id = $1 for update", employee_id)
        ee, er = body.employee_minor, body.employer_minor
        if body.kind == "withdrawal":
            if ee < 0 or er < 0:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Enter how much is taken out")
            ee, er = -ee, -er
        if body.kind == "opening" and (ee < 0 or er < 0):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "An opening balance can't be negative")
        if ee == 0 and er == 0:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Enter an amount")
        b = await provident_fund.balance(conn, employee_id)
        if b.employee_minor + ee < 0 or b.employer_minor + er < 0:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That's more than is in the fund")
        await conn.execute(
            """insert into pay_pf_entries (tenant_id, employee_id, kind, employee_minor, employer_minor, note, created_by)
               values ($1, $2, $3, $4, $5, $6, $7)""",
            auth.tenant_id, employee_id, body.kind, ee, er, body.note, auth.user_id)
        return await _balance(conn, employee_id)


@portal.get("/pf", response_model=PfBalance)
async def my_fund(auth: AuthContext = Depends(current_auth), employee_id: str = Depends(current_employee)) -> PfBalance:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await _balance(conn, employee_id)
