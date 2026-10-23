"""Stock transfers between branches or warehouses (wave B, study 06 §6.6,
D-88, migration 0092).

A draft lists what goes from one branch to another and moves nothing.
Dispatching takes every line out of the sender in one transaction (all or
nothing: a line short of stock stops it); the goods are then in transit.
Receiving puts what actually arrived into the receiver; sent − received is
the line's variance, lost on the way. Staff of either branch see the
transfer (its own branch policy); sending needs products.transfer.manage,
receiving products.transfer.receive.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from .. import catalog, db, sequences
from ..deps import AuthContext
from ..models import TransferStatus
from ..rbac import perm

router = APIRouter(prefix="/pos", tags=["pos"])

sequences.register_default("stock.transfer", name="Stock transfers", pattern="TR-{FY}-{N}", gapless=False)


class TransferLineIn(BaseModel):
    product_id: UUID
    qty: float = Field(gt=0, le=1_000_000)


class TransferIn(BaseModel):
    from_branch_id: UUID
    to_branch_id: UUID
    lines: list[TransferLineIn] = Field(min_length=1, max_length=500)
    note: str = Field(default="", max_length=300)


class ReceivedLine(BaseModel):
    line_id: UUID
    qty_received: float = Field(ge=0, le=1_000_000)


class ReceiveIn(BaseModel):
    lines: list[ReceivedLine] = Field(default_factory=list, max_length=500)   # empty: everything arrived


class TransferLineOut(BaseModel):
    id: str
    product_id: str
    product_name: str
    unit: str
    qty_sent: float
    qty_received: float | None
    variance: float | None


class TransferOut(BaseModel):
    id: str
    number: str
    from_branch_id: str
    from_branch: str
    to_branch_id: str
    to_branch: str
    status: TransferStatus
    note: str
    created_at: datetime
    dispatched_at: datetime | None
    received_at: datetime | None
    lines: list[TransferLineOut]


_SELECT = """select t.*, fb.name as from_name, tb.name as to_name from stock_transfers t
               join branches fb on fb.id = t.from_branch_id join branches tb on tb.id = t.to_branch_id"""


async def _out(conn: asyncpg.Connection, t: asyncpg.Record) -> TransferOut:
    lines = await conn.fetch(
        """select l.*, p.name, p.unit from stock_transfer_lines l join pos_products p on p.id = l.product_id
            where l.transfer_id = $1 order by p.name""", t["id"])
    return TransferOut(
        id=str(t["id"]), number=t["number"], from_branch_id=str(t["from_branch_id"]), from_branch=t["from_name"],
        to_branch_id=str(t["to_branch_id"]), to_branch=t["to_name"], status=t["status"], note=t["note"],
        created_at=t["created_at"], dispatched_at=t["dispatched_at"], received_at=t["received_at"],
        lines=[TransferLineOut(
            id=str(r["id"]), product_id=str(r["product_id"]), product_name=r["name"], unit=r["unit"],
            qty_sent=float(r["qty_sent"]),
            qty_received=float(r["qty_received"]) if r["qty_received"] is not None else None,
            variance=float(r["qty_sent"] - r["qty_received"]) if r["qty_received"] is not None else None)
            for r in lines])


async def _get(conn: asyncpg.Connection, transfer_id: Any, *, lock: bool = False) -> asyncpg.Record:
    row = await conn.fetchrow(_SELECT + " where t.id = $1" + (" for update of t" if lock else ""), transfer_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transfer not found")
    return row


def _expect(row: asyncpg.Record, wanted: str) -> None:
    if row["status"] != wanted:
        raise HTTPException(status.HTTP_409_CONFLICT, f"This transfer is already {row['status']}")


@router.get("/transfers", response_model=list[TransferOut])
async def list_transfers(status_filter: TransferStatus | None = None,
                         auth: AuthContext = Depends(perm("products.product.read"))) -> list[TransferOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(_SELECT + """ where ($1::text is null or t.status = $1)
                                             order by t.status = 'dispatched' desc, t.created_at desc limit 200""",
                                status_filter)
        return [await _out(conn, r) for r in rows]


@router.get("/transfers/{transfer_id}", response_model=TransferOut)
async def get_transfer(transfer_id: UUID, auth: AuthContext = Depends(perm("products.product.read"))) -> TransferOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await _out(conn, await _get(conn, transfer_id))


@router.post("/transfers", response_model=TransferOut, status_code=status.HTTP_201_CREATED)
async def create_transfer(body: TransferIn, auth: AuthContext = Depends(perm("products.transfer.manage"))) -> TransferOut:
    if body.from_branch_id == body.to_branch_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A transfer goes between two different branches")
    ids = [ln.product_id for ln in body.lines]
    if len(set(ids)) != len(ids):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Each product goes on one line")
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        for b in (body.from_branch_id, body.to_branch_id):
            if not await conn.fetchval("select 1 from branches where id = $1 and app_branch_visible(id)", b):
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Branch not found")
        tracked = await conn.fetchval(
            "select count(*) from pos_products where id = any($1::uuid[]) and track_stock", ids)
        if tracked != len(ids):     # unknown, another company's (RLS), or a service with no stock
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found, or it doesn't track stock")
        number = (await sequences.next_number(conn, "stock.transfer")).number
        tid = await conn.fetchval(
            """insert into stock_transfers (tenant_id, number, from_branch_id, to_branch_id, note, created_by)
               values ($1, $2, $3, $4, $5, $6) returning id""",
            auth.tenant_id, number, body.from_branch_id, body.to_branch_id, body.note, auth.user_id)
        await conn.executemany(
            "insert into stock_transfer_lines (tenant_id, transfer_id, product_id, qty_sent) values ($1, $2, $3, $4)",
            [(auth.tenant_id, tid, ln.product_id, Decimal(str(ln.qty))) for ln in body.lines])
        return await _out(conn, await _get(conn, tid))


@router.post("/transfers/{transfer_id}/dispatch", response_model=TransferOut)
async def dispatch(transfer_id: UUID, auth: AuthContext = Depends(perm("products.transfer.manage"))) -> TransferOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        t = await _get(conn, transfer_id, lock=True)
        _expect(t, "draft")
        for ln in await conn.fetch("select * from stock_transfer_lines where transfer_id = $1", transfer_id):
            await catalog.move(conn, auth.tenant_id, ln["product_id"], -ln["qty_sent"], "transfer_out",
                               branch_id=t["from_branch_id"], ref_id=transfer_id, user_id=auth.user_id,
                               note=f"To {t['to_name']} ({t['number']})")
        await conn.execute(
            """update stock_transfers set status = 'dispatched', dispatched_by = $2, dispatched_at = now()
                where id = $1""", transfer_id, auth.user_id)
        return await _out(conn, await _get(conn, transfer_id))


@router.post("/transfers/{transfer_id}/receive", response_model=TransferOut)
async def receive(transfer_id: UUID, body: ReceiveIn,
                  auth: AuthContext = Depends(perm("products.transfer.receive"))) -> TransferOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        t = await _get(conn, transfer_id, lock=True)
        _expect(t, "dispatched")
        lines = {r["id"]: r for r in await conn.fetch(
            "select * from stock_transfer_lines where transfer_id = $1", transfer_id)}
        got = {ln.line_id: Decimal(str(ln.qty_received)) for ln in body.lines}
        if set(got) - set(lines):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Transfer line not found")
        for line_id, ln in lines.items():
            qty = got.get(line_id, ln["qty_sent"])
            if qty > ln["qty_sent"]:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                    "More can't arrive than was sent: record the extra as an adjustment")
            if qty > 0:
                await catalog.move(conn, auth.tenant_id, ln["product_id"], qty, "transfer_in",
                                   branch_id=t["to_branch_id"], ref_id=transfer_id, user_id=auth.user_id,
                                   note=f"From {t['from_name']} ({t['number']})")
            await conn.execute("update stock_transfer_lines set qty_received = $2 where id = $1", line_id, qty)
        await conn.execute(
            "update stock_transfers set status = 'received', received_by = $2, received_at = now() where id = $1",
            transfer_id, auth.user_id)
        return await _out(conn, await _get(conn, transfer_id))


@router.post("/transfers/{transfer_id}/cancel", response_model=TransferOut)
async def cancel(transfer_id: UUID, auth: AuthContext = Depends(perm("products.transfer.manage"))) -> TransferOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        t = await _get(conn, transfer_id, lock=True)
        _expect(t, "draft")      # once dispatched, the goods are on the road: receive them, then adjust
        await conn.execute("update stock_transfers set status = 'cancelled' where id = $1", transfer_id)
        return await _out(conn, await _get(conn, transfer_id))
