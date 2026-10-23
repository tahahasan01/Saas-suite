"""Stock counts that don't clobber sales (wave B, study 06 §6.6, D-88,
migration 0093).

A count is opened for a branch (the caller's, or one they name) and
optionally one category. Counters enter what they find; each line
snapshots the branch's stock at that moment. Applying posts counted −
snapshot per line as a 'count' move at the count's branch, so a sale made
between counting a shelf and applying the count still counts. Entering
numbers needs products.stock.count; opening, applying and cancelling need
products.stock.adjust.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from .. import catalog, db
from ..deps import AuthContext
from ..models import CountStatus
from ..rbac import perm

router = APIRouter(prefix="/pos", tags=["pos"])


class CountIn(BaseModel):
    branch_id: UUID | None = None      # None: the caller's branch
    category_id: UUID | None = None    # None: every tracked product
    note: str = Field(default="", max_length=300)


class CountLineIn(BaseModel):
    product_id: UUID
    counted_qty: float = Field(ge=0, le=1_000_000)


class CountLineOut(BaseModel):
    product_id: str
    product_name: str
    unit: str
    system_qty: float
    counted_qty: float
    difference: float
    counted_at: datetime


class ToCount(BaseModel):
    product_id: str
    product_name: str
    unit: str


class CountOut(BaseModel):
    id: str
    branch_id: str
    branch_name: str
    category_id: str | None
    category_name: str | None
    status: CountStatus
    note: str
    started_at: datetime
    applied_at: datetime | None
    lines: list[CountLineOut]
    to_count: list[ToCount]


_SELECT = """select c.*, b.name as branch_name, cat.name as category_name from stock_counts c
               join branches b on b.id = c.branch_id left join pos_categories cat on cat.id = c.category_id"""


async def _get(conn: asyncpg.Connection, count_id: Any, *, lock: bool = False) -> asyncpg.Record:
    row = await conn.fetchrow(_SELECT + " where c.id = $1" + (" for update of c" if lock else ""), count_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Count not found")
    return row


async def _out(conn: asyncpg.Connection, c: asyncpg.Record) -> CountOut:
    lines = await conn.fetch(
        """select l.*, p.name, p.unit from stock_count_lines l join pos_products p on p.id = l.product_id
            where l.count_id = $1 order by p.name""", c["id"])
    todo = [] if c["status"] != "open" else await conn.fetch(
        """select p.id, p.name, p.unit from pos_products p
            where p.active and p.track_stock and ($2::uuid is null or p.category_id = $2)
              and not exists (select 1 from stock_count_lines l where l.count_id = $1 and l.product_id = p.id)
            order by p.name limit 1000""", c["id"], c["category_id"])
    return CountOut(
        id=str(c["id"]), branch_id=str(c["branch_id"]), branch_name=c["branch_name"],
        category_id=str(c["category_id"]) if c["category_id"] else None, category_name=c["category_name"],
        status=c["status"], note=c["note"], started_at=c["started_at"], applied_at=c["applied_at"],
        lines=[CountLineOut(product_id=str(r["product_id"]), product_name=r["name"], unit=r["unit"],
                            system_qty=float(r["system_qty"]), counted_qty=float(r["counted_qty"]),
                            difference=float(r["counted_qty"] - r["system_qty"]), counted_at=r["counted_at"])
               for r in lines],
        to_count=[ToCount(product_id=str(r["id"]), product_name=r["name"], unit=r["unit"]) for r in todo])


def _open(c: asyncpg.Record) -> None:
    if c["status"] != "open":
        raise HTTPException(status.HTTP_409_CONFLICT, f"This count is already {c['status']}")


@router.get("/counts", response_model=list[CountOut])
async def list_counts(auth: AuthContext = Depends(perm("products.product.read"))) -> list[CountOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(_SELECT + " order by c.status = 'open' desc, c.started_at desc limit 100")
        return [await _out(conn, r) for r in rows]


@router.get("/counts/{count_id}", response_model=CountOut)
async def get_count(count_id: UUID, auth: AuthContext = Depends(perm("products.product.read"))) -> CountOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await _out(conn, await _get(conn, count_id))


@router.post("/counts", response_model=CountOut, status_code=status.HTTP_201_CREATED)
async def open_count(body: CountIn, auth: AuthContext = Depends(perm("products.stock.adjust"))) -> CountOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        if body.branch_id is not None and not await conn.fetchval(
                "select 1 from branches where id = $1 and app_branch_visible(id)", body.branch_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Branch not found")
        if body.category_id is not None and not await conn.fetchval(
                "select 1 from pos_categories where id = $1", body.category_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
        cid = await conn.fetchval(
            """insert into stock_counts (tenant_id, branch_id, category_id, note, started_by)
               values ($1, coalesce($2, app_current_branch($1)), $3, $4, $5) returning id""",
            auth.tenant_id, body.branch_id, body.category_id, body.note, auth.user_id)
        return await _out(conn, await _get(conn, cid))


@router.put("/counts/{count_id}/lines", response_model=CountOut)
async def count_line(count_id: UUID, body: CountLineIn,
                     auth: AuthContext = Depends(perm("products.stock.count"))) -> CountOut:
    """What was found for one product; counting it again replaces the line
    and takes a fresh snapshot."""
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        c = await _get(conn, count_id, lock=True)
        _open(c)
        p = await conn.fetchrow("select id, track_stock, category_id from pos_products where id = $1", body.product_id)
        if p is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
        if not p["track_stock"]:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "This product doesn't track stock")
        if c["category_id"] is not None and p["category_id"] != c["category_id"]:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "This product isn't in the count's category")
        system = await conn.fetchval(
            "select qty from pos_stock_levels where product_id = $1 and branch_id = $2", body.product_id, c["branch_id"])
        await conn.execute(
            """insert into stock_count_lines (tenant_id, count_id, product_id, system_qty, counted_qty, counted_by)
               values ($1, $2, $3, $4, $5, $6)
               on conflict (count_id, product_id) do update
                  set system_qty = excluded.system_qty, counted_qty = excluded.counted_qty,
                      counted_by = excluded.counted_by, counted_at = now()""",
            auth.tenant_id, count_id, body.product_id, system or Decimal(0), Decimal(str(body.counted_qty)),
            auth.user_id)
        return await _out(conn, await _get(conn, count_id))


@router.post("/counts/{count_id}/apply", response_model=CountOut)
async def apply_count(count_id: UUID, auth: AuthContext = Depends(perm("products.stock.adjust"))) -> CountOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        c = await _get(conn, count_id, lock=True)
        _open(c)
        for ln in await conn.fetch("select * from stock_count_lines where count_id = $1", count_id):
            diff = ln["counted_qty"] - ln["system_qty"]
            if diff != 0:
                # A count is the truth even when it means less than sold since: allow it.
                await catalog.move(conn, auth.tenant_id, ln["product_id"], diff, "count", branch_id=c["branch_id"],
                                   ref_id=count_id, user_id=auth.user_id, allow_negative=True,
                                   note=f"Stock count at {c['branch_name']}")
        await conn.execute("update stock_counts set status = 'applied', applied_by = $2, applied_at = now() where id = $1",
                           count_id, auth.user_id)
        return await _out(conn, await _get(conn, count_id))


@router.post("/counts/{count_id}/cancel", response_model=CountOut)
async def cancel_count(count_id: UUID, auth: AuthContext = Depends(perm("products.stock.adjust"))) -> CountOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        c = await _get(conn, count_id, lock=True)
        _open(c)
        await conn.execute("update stock_counts set status = 'cancelled' where id = $1", count_id)
        return await _out(conn, await _get(conn, count_id))
