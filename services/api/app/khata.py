"""Khata, customer credit (3C, migration 0079).

The customer_ledger is append-only and its sum is the balance: a khata
tender posts a 'sale' (+) in the sale's own transaction, a khata refund a
'refund' (−), money received a 'payment' (−). A credit limit, when set, is
checked as the sale posts; the contact row is locked first so two tills
can't both squeeze under the limit at once.
"""
from __future__ import annotations

from typing import Any

import asyncpg
from fastapi import HTTPException, status


async def balance(conn: asyncpg.Connection, contact_id: Any) -> int:
    return int(await conn.fetchval(
        "select coalesce(sum(amount_minor), 0) from customer_ledger where contact_id = $1", contact_id))


async def post_sale(conn: asyncpg.Connection, tenant_id: str, contact_id: Any, sale_id: Any, amount_minor: int,
                    user_id: str, over_limit_ok: bool = False) -> bool:
    """Posts the khata part of a sale. Returns whether it went over the
    customer's limit, which only an offline sale may (it already happened,
    so it is posted and flagged for review, D-23)."""
    c = await conn.fetchrow("select name, credit_limit_minor from contacts where id = $1 for update", contact_id)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
    owed = await balance(conn, contact_id)
    limit = c["credit_limit_minor"]
    over = limit is not None and owed + amount_minor > limit
    if over and not over_limit_ok:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"{c['name']} would owe Rs {(owed + amount_minor) / 100:,.2f}, over their khata limit of "
                            f"Rs {limit / 100:,.2f}. Take another payment method or ask a manager to raise the limit.")
    await conn.execute(
        """insert into customer_ledger (tenant_id, contact_id, kind, amount_minor, sale_id, user_id)
           values ($1, $2, 'sale', $3, $4, $5)""", tenant_id, contact_id, amount_minor, sale_id, user_id)
    return over


async def post_refund(conn: asyncpg.Connection, tenant_id: str, contact_id: Any, sale_id: Any, return_id: Any,
                      amount_minor: int, user_id: str) -> None:
    if amount_minor <= 0:
        return
    await conn.execute(
        """insert into customer_ledger (tenant_id, contact_id, kind, amount_minor, sale_id, return_id, user_id)
           values ($1, $2, 'refund', $3, $4, $5, $6)""",
        tenant_id, contact_id, -amount_minor, sale_id, return_id, user_id)
