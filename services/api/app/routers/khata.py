"""Khata endpoints (3C, migration 0079): who owes what, a customer's
statement, payments received and credit limits. Sales and refunds post to
the ledger from routers/pos.py."""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from .. import db, khata, pos_sessions
from ..deps import AuthContext
from ..rbac import perm

router = APIRouter(prefix="/khata", tags=["khata"])


class BalanceRow(BaseModel):
    contact_id: str
    name: str
    phone: str
    balance_minor: int
    credit_limit_minor: int | None
    last_entry_at: datetime


class Entry(BaseModel):
    id: str
    kind: str
    amount_minor: int
    balance_after_minor: int
    sale_id: str | None
    receipt_no: str | None
    method: str | None
    note: str
    created_at: datetime


class Account(BaseModel):
    contact_id: str
    name: str
    balance_minor: int
    credit_limit_minor: int | None
    entries: list[Entry]


class LimitIn(BaseModel):
    credit_limit_minor: int | None = Field(ge=0, le=10**12)


class PaymentIn(BaseModel):
    amount_minor: int = Field(gt=0, le=10**12)
    method: Literal["cash", "card", "jazzcash", "easypaisa", "raast", "bank", "cheque"]
    register_id: UUID | None = None      # cash: the till whose open session takes it (required)
    reference: str = Field(default="", max_length=80)   # non-cash: the transfer / cheque number (required)
    note: str = Field(default="", max_length=200)


@router.get("", response_model=list[BalanceRow])
async def balances(owing_only: bool = True, limit: int = Query(200, ge=1, le=500),
                   auth: AuthContext = Depends(perm("khata.ledger.read"))) -> list[BalanceRow]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            """select c.id, c.name, c.phone_raw, c.credit_limit_minor, sum(l.amount_minor)::bigint as balance,
                      max(l.created_at) as last_at
                 from customer_ledger l join contacts c on c.id = l.contact_id
                group by c.id having (not $1 or sum(l.amount_minor) <> 0)
                order by balance desc limit $2""", owing_only, limit)
    return [BalanceRow(contact_id=str(r["id"]), name=r["name"], phone=r["phone_raw"] or "", balance_minor=r["balance"],
                       credit_limit_minor=r["credit_limit_minor"], last_entry_at=r["last_at"]) for r in rows]


async def _account(conn: asyncpg.Connection, contact_id: str) -> Account:
    c = await conn.fetchrow("select id, name, credit_limit_minor from contacts where id = $1", contact_id)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
    rows = await conn.fetch(
        """select l.*, s.receipt_no from customer_ledger l left join pos_sales s on s.id = l.sale_id
            where l.contact_id = $1 order by l.created_at, l.id""", contact_id)
    running, entries = 0, []
    for r in rows:
        running += r["amount_minor"]
        entries.append(Entry(id=str(r["id"]), kind=r["kind"], amount_minor=r["amount_minor"], balance_after_minor=running,
                             sale_id=str(r["sale_id"]) if r["sale_id"] else None, receipt_no=r["receipt_no"],
                             method=r["method"], note=r["note"], created_at=r["created_at"]))
    return Account(contact_id=str(c["id"]), name=c["name"], balance_minor=running,
                   credit_limit_minor=c["credit_limit_minor"], entries=entries)


@router.get("/{contact_id}", response_model=Account)
async def statement(contact_id: str, auth: AuthContext = Depends(perm("khata.ledger.read"))) -> Account:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await _account(conn, contact_id)


@router.patch("/{contact_id}", response_model=Account)
async def set_limit(contact_id: str, body: LimitIn, auth: AuthContext = Depends(perm("khata.limit.manage"))) -> Account:
    async with db.tenant_conn(auth.tenant_id) as conn:
        done = await conn.execute("update contacts set credit_limit_minor = $2 where id = $1", contact_id,
                                  body.credit_limit_minor)
        if done == "UPDATE 0":
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
        return await _account(conn, contact_id)


@router.post("/{contact_id}/payments", response_model=Account, status_code=status.HTTP_201_CREATED)
async def receive_payment(contact_id: str, body: PaymentIn,
                          auth: AuthContext = Depends(perm("khata.payment.record"))) -> Account:
    async with db.tenant_conn(auth.tenant_id) as conn:
        name = await conn.fetchval("select name from contacts where id = $1 for update", contact_id)
        if name is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
        owed = await khata.balance(conn, contact_id)
        if body.amount_minor > owed:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                f"{name} owes Rs {max(owed, 0) / 100:,.2f}; take no more than that")
        # No silent write-offs (security review): cash must land in an open
        # drawer, and any other payment must say which transfer it was.
        if body.method == "cash" and body.register_id is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Cash must be taken at a till: choose the register")
        if body.method != "cash" and len(body.reference.strip()) < 3:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                "Give the transfer, wallet or cheque reference for this payment")
        session_id = None
        if body.register_id is not None:
            reg = await pos_sessions.register(conn, body.register_id)
            session_id = await pos_sessions.open_session_id(conn, reg["id"])
            if session_id is None:
                raise HTTPException(status.HTTP_409_CONFLICT, f"{reg['name']} has no open session to take this into")
            if body.method == "cash":
                await conn.execute(
                    """insert into pos_cash_moves (tenant_id, session_id, kind, amount_minor, reason, user_id)
                       values ($1, $2, 'pay_in', $3, $4, $5)""",
                    auth.tenant_id, session_id, body.amount_minor, f"Khata payment: {name}"[:200], auth.user_id)
        await conn.execute(
            """insert into customer_ledger (tenant_id, contact_id, kind, amount_minor, method, session_id, note, user_id)
               values ($1, $2, 'payment', $3, $4, $5, $6, $7)""",
            auth.tenant_id, contact_id, -body.amount_minor, body.method, session_id,
            " · ".join(x for x in (body.reference.strip(), body.note.strip()) if x)[:300], auth.user_id)
        return await _account(conn, contact_id)
