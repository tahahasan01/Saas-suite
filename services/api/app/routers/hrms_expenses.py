"""Expense claims reimbursed through payroll (wave C, H13, St12, 0102).

Employees claim on /me with receipts they uploaded; HR
(`hrms.expense.manage`) can claim for someone. An approver
(`hrms.expense.approve`) approves up to the claimed total or rejects with a
reason, never a claim they made or entered. Approval creates a non-taxable
EXPENSE one-off in the month payroll will next pay, so the reimbursement
rides on the payslip; the claim reads as paid once that run is paid.
"""
from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID, uuid4

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status

from .. import db, files, payroll_data, rbac, refs
from ..deps import AuthContext, current_auth, current_employee
from ..models import (ExpenseApprove, ExpenseClaimFor, ExpenseClaimIn, ExpenseClaimOut, ExpenseLineIn,
                      ExpenseLineOut, ExpenseReject, ExpenseStatus)
from ..rbac import perm

router = APIRouter(prefix="/hrms", tags=["hrms"])
portal = APIRouter(prefix="/me", tags=["portal"])

_ENTITY = "hrms_expense_line"

_SELECT = """select c.*, e.name as employee_name, e.user_id as claimant_user, o.period as pay_month,
                    (o.status = 'applied' and r.status in ('paid', 'locked')) as paid
               from hrms_expense_claims c join hrms_employees e on e.id = c.employee_id
               left join pay_one_offs o on o.id = c.one_off_id
               left join payroll_runs r on r.id = o.run_id"""


async def _out(conn: asyncpg.Connection, row: asyncpg.Record) -> ExpenseClaimOut:
    lines = await conn.fetch("select * from hrms_expense_lines where claim_id = $1 order by sort", row["id"])
    return ExpenseClaimOut(
        id=str(row["id"]), employee_id=str(row["employee_id"]), employee_name=row["employee_name"],
        title=row["title"], status=row["status"], total_minor=row["total_minor"],
        approved_minor=row["approved_minor"], one_off_id=str(row["one_off_id"]) if row["one_off_id"] else None,
        pay_month=row["pay_month"], paid=bool(row["paid"]), decision_note=row["decision_note"],
        decided_at=row["decided_at"], created_at=row["created_at"],
        lines=[ExpenseLineOut(id=str(x["id"]), spent_on=x["spent_on"], category=x["category"],
                              description=x["description"], amount_minor=x["amount_minor"],
                              receipt_file_id=str(x["receipt_file_id"]) if x["receipt_file_id"] else None)
               for x in lines])


async def _fetch(conn: asyncpg.Connection, claim_id: Any) -> ExpenseClaimOut:
    row = await conn.fetchrow(_SELECT + " where c.id = $1", claim_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Expense claim not found")
    return await _out(conn, row)


async def _create(conn: asyncpg.Connection, auth: AuthContext, employee_id: Any, title: str,
                  lines: list[ExpenseLineIn]) -> UUID:
    today: date = await conn.fetchval("select current_date")
    if any(x.spent_on > today for x in lines):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "An expense can't be dated in the future")
    cid = await conn.fetchval(
        """insert into hrms_expense_claims (tenant_id, employee_id, title, total_minor, submitted_by)
           values ($1, $2, btrim($3), $4, $5) returning id""",
        auth.tenant_id, employee_id, title, sum(x.amount_minor for x in lines), auth.user_id)
    for i, x in enumerate(lines):
        lid = uuid4()
        # The receipt must be the caller's own fresh upload; claiming it first
        # (before the line points at it) makes it the line's, readable by the
        # claimant and approvers, and refuses anyone else's file.
        if x.receipt_file_id is not None and await files.attach(
                conn, str(x.receipt_file_id), entity=_ENTITY, entity_id=str(lid), field="receipt",
                user_id=auth.user_id) is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Upload the receipt again, then send the claim")
        await conn.execute(
            """insert into hrms_expense_lines (id, tenant_id, claim_id, spent_on, category, description, amount_minor,
                                               receipt_file_id, sort)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9)""",
            lid, auth.tenant_id, cid, x.spent_on, x.category, x.description, x.amount_minor, x.receipt_file_id, i)
    return UUID(str(cid))


async def _receipt_reader(conn: asyncpg.Connection, user_id: str, row: asyncpg.Record) -> bool:
    """A receipt opens for the person claiming and for expense readers."""
    owner = await conn.fetchval(
        """select e.user_id from hrms_expense_lines l join hrms_expense_claims c on c.id = l.claim_id
             join hrms_employees e on e.id = c.employee_id where l.id = $1::uuid""", row["entity_id"])
    if owner is not None and str(owner) == user_id:
        return True
    u = await conn.fetchrow("select role_id from users where id = $1", user_id)
    held = await rbac.effective_permissions(conn, str(row["tenant_id"]), u["role_id"] if u else None, user_id)
    return "hrms.expense.read" in held


files.register_reader(_ENTITY, _receipt_reader)


# ── HR side ─────────────────────────────────────────────────────────────────
@router.get("/expenses", response_model=list[ExpenseClaimOut])
async def list_claims(status_filter: ExpenseStatus | None = Query(None, alias="status"),
                      employee_id: UUID | None = None,
                      auth: AuthContext = Depends(perm("hrms.expense.read"))) -> list[ExpenseClaimOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            _SELECT + """ where ($1::text is null or c.status = $1) and ($2::uuid is null or c.employee_id = $2)
                          order by c.status = 'submitted' desc, c.created_at desc limit 300""",
            status_filter, employee_id)
        return [await _out(conn, r) for r in rows]


@router.post("/expenses", response_model=ExpenseClaimOut, status_code=status.HTTP_201_CREATED)
async def claim_for(body: ExpenseClaimFor, auth: AuthContext = Depends(perm("hrms.expense.manage"))) -> ExpenseClaimOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        await refs.ensure_visible(conn, "hrms_employees", body.employee_id)
        cid = await _create(conn, auth, body.employee_id, body.title, body.lines)
        return await _fetch(conn, cid)


@router.get("/expenses/{expense_id}", response_model=ExpenseClaimOut)
async def get_claim(expense_id: UUID, auth: AuthContext = Depends(perm("hrms.expense.read"))) -> ExpenseClaimOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await _fetch(conn, expense_id)


async def _decide(conn: asyncpg.Connection, auth: AuthContext, expense_id: UUID) -> asyncpg.Record:
    row = await conn.fetchrow(_SELECT + " where c.id = $1 for update of c", expense_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Expense claim not found")
    # Paying yourself, or approving what you typed in, needs a second person.
    mine = row["claimant_user"] is not None and str(row["claimant_user"]) == auth.user_id
    if mine or (row["submitted_by"] is not None and str(row["submitted_by"]) == auth.user_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Someone else has to decide a claim you made or entered")
    if row["status"] != "submitted":
        raise HTTPException(status.HTTP_409_CONFLICT, f"This claim was already {row['status']}")
    return row


@router.post("/expenses/{expense_id}/approve", response_model=ExpenseClaimOut)
async def approve(expense_id: UUID, body: ExpenseApprove,
                  auth: AuthContext = Depends(perm("hrms.expense.approve"))) -> ExpenseClaimOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        row = await _decide(conn, auth, expense_id)
        amount = body.approved_minor if body.approved_minor is not None else row["total_minor"]
        if amount > row["total_minor"]:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "You can't approve more than was claimed")
        one_off = await conn.fetchval(
            """insert into pay_one_offs (tenant_id, employee_id, period, code, name, kind, amount_minor, taxable,
                                         note, created_by)
               values ($1, $2, $3, 'EXPENSE', $4, 'earning', $5, false, $6, $7) returning id""",
            auth.tenant_id, row["employee_id"], await payroll_data.next_pay_month(conn), f"Expenses: {row['title']}"[:120], amount,
            f"expense claim {expense_id}", auth.user_id)
        await conn.execute(
            """update hrms_expense_claims set status = 'approved', approved_minor = $2, one_off_id = $3,
                      decided_by = $4, decided_at = now(), decision_note = $5 where id = $1""",
            expense_id, amount, one_off, auth.user_id, body.note)
        return await _fetch(conn, expense_id)


@router.post("/expenses/{expense_id}/reject", response_model=ExpenseClaimOut)
async def reject(expense_id: UUID, body: ExpenseReject,
                 auth: AuthContext = Depends(perm("hrms.expense.approve"))) -> ExpenseClaimOut:
    if not body.note.strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Say why it's rejected")
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        await _decide(conn, auth, expense_id)
        await conn.execute(
            """update hrms_expense_claims set status = 'rejected', decided_by = $2, decided_at = now(),
                      decision_note = $3 where id = $1""", expense_id, auth.user_id, body.note)
        return await _fetch(conn, expense_id)


# ── The employee's own claims (/me) ─────────────────────────────────────────
@portal.get("/expenses", response_model=list[ExpenseClaimOut])
async def my_claims(auth: AuthContext = Depends(current_auth),
                    employee_id: str = Depends(current_employee)) -> list[ExpenseClaimOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(_SELECT + " where c.employee_id = $1 order by c.created_at desc limit 100", employee_id)
        return [await _out(conn, r) for r in rows]


@portal.post("/expenses", response_model=ExpenseClaimOut, status_code=status.HTTP_201_CREATED)
async def make_claim(body: ExpenseClaimIn, auth: AuthContext = Depends(current_auth),
                     employee_id: str = Depends(current_employee)) -> ExpenseClaimOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        cid = await _create(conn, auth, employee_id, body.title, body.lines)
        return await _fetch(conn, cid)


@portal.post("/expenses/{expense_id}/cancel", response_model=ExpenseClaimOut)
async def cancel_mine(expense_id: UUID, auth: AuthContext = Depends(current_auth),
                      employee_id: str = Depends(current_employee)) -> ExpenseClaimOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        row = await conn.fetchrow(
            "select status from hrms_expense_claims where id = $1 and employee_id = $2 for update",
            expense_id, employee_id)
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Expense claim not found")
        if row["status"] != "submitted":
            raise HTTPException(status.HTTP_409_CONFLICT, f"This claim was already {row['status']}")
        await conn.execute("update hrms_expense_claims set status = 'cancelled' where id = $1", expense_id)
        return await _fetch(conn, expense_id)
