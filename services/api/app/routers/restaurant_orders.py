"""Restaurant orders and kitchen tickets (wave B, P22/P23/P39/P40, study 11,
migration 0094).

An order is dine-in at a table (one open order per table, at the table's
branch) or takeaway with a token (per branch and day). Items are added and
changed freely until they are sent. "Send to kitchen" makes one ticket
(KOT) per station with only what's new: the station is the one making the
item's category at the order's branch, else the counter. Cancelling a sent
item is a void: it needs a reason and restaurant.order.void (or a manager's
PIN) and sends a VOID ticket to the same station. Paying comes next slice.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from .. import approvals, db, rbac
from ..deps import AuthContext
from ..models import KotKind, OrderStatus, RestaurantOrderType
from ..rbac import perm

router = APIRouter(prefix="/restaurant", tags=["restaurant"])
COUNTER = "Counter"


class OrderIn(BaseModel):
    order_type: RestaurantOrderType
    table_id: UUID | None = None
    guests: int | None = Field(default=None, ge=1, le=100)
    note: str = Field(default="", max_length=300)


class LineIn(BaseModel):
    product_id: UUID
    qty: float = Field(gt=0, le=1000)
    note: str = Field(default="", max_length=200)


class LineUpdate(BaseModel):
    qty: float | None = Field(default=None, ge=0, le=1000)
    note: str | None = Field(default=None, max_length=200)


class VoidIn(BaseModel):
    qty: float = Field(gt=0, le=1000)
    reason: str = Field(default="", max_length=200)
    approver_id: UUID | None = None
    approver_pin: str | None = Field(default=None, max_length=12)


class OrderLineOut(BaseModel):
    id: str
    product_id: str
    name: str
    qty: float
    sent_qty: float
    unit_price_minor: int
    note: str


class KotLineOut(BaseModel):
    name: str
    qty: float
    note: str


class KotOut(BaseModel):
    id: str
    number: int
    kind: KotKind
    station_id: str | None
    station_name: str
    table_label: str | None
    token: int | None
    reason: str
    approved_by_name: str | None
    created_at: datetime
    lines: list[KotLineOut]


class OrderOut(BaseModel):
    id: str
    branch_id: str
    order_type: RestaurantOrderType
    table_id: str | None
    table_label: str | None
    token: int | None
    guests: int | None
    status: OrderStatus
    note: str
    opened_at: datetime
    opened_by_name: str | None
    total_minor: int
    lines: list[OrderLineOut]
    kots: list[KotOut]


_ORDER = """select o.*, t.label as table_label, u.name as opened_by_name from restaurant_orders o
              left join restaurant_tables t on t.id = o.table_id left join users u on u.id = o.opened_by"""

# Per order line: what the kitchen has (order tickets minus void tickets).
_SENT = """select kl.order_line_id,
                  coalesce(sum(case when k.kind = 'order' then kl.qty else -kl.qty end), 0) as sent
             from restaurant_kot_lines kl join restaurant_kots k on k.id = kl.kot_id
            where k.order_id = $1 group by kl.order_line_id"""


async def _get(conn: asyncpg.Connection, order_id: Any, *, lock: bool = False) -> asyncpg.Record:
    row = await conn.fetchrow(_ORDER + " where o.id = $1" + (" for update of o" if lock else ""), order_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return row


def _expect_open(o: asyncpg.Record) -> None:
    if o["status"] != "open":
        raise HTTPException(status.HTTP_409_CONFLICT, f"This order is already {o['status']}")


async def _sent(conn: asyncpg.Connection, order_id: Any) -> dict[Any, Decimal]:
    return {r["order_line_id"]: Decimal(r["sent"]) for r in await conn.fetch(_SENT, order_id)}


async def _out(conn: asyncpg.Connection, o: asyncpg.Record) -> OrderOut:
    sent = await _sent(conn, o["id"])
    lines = await conn.fetch("select * from restaurant_order_lines where order_id = $1 order by created_at, id", o["id"])
    kots = await conn.fetch(
        """select k.*, s.name as station_name, a.name as approved_by_name from restaurant_kots k
             left join restaurant_stations s on s.id = k.station_id left join users a on a.id = k.approved_by
            where k.order_id = $1 order by k.created_at, k.number""", o["id"])
    kot_lines: dict[Any, list[KotLineOut]] = {}
    for r in await conn.fetch(
            """select kl.kot_id, kl.name, kl.qty, kl.note from restaurant_kot_lines kl
                 join restaurant_kots k on k.id = kl.kot_id where k.order_id = $1 order by kl.name""", o["id"]):
        kot_lines.setdefault(r["kot_id"], []).append(KotLineOut(name=r["name"], qty=float(r["qty"]), note=r["note"]))
    total = sum(int((Decimal(r["qty"]) * r["unit_price_minor"]).to_integral_value()) for r in lines)
    return OrderOut(
        id=str(o["id"]), branch_id=str(o["branch_id"]), order_type=o["order_type"],
        table_id=str(o["table_id"]) if o["table_id"] else None, table_label=o["table_label"], token=o["token"],
        guests=o["guests"], status=o["status"], note=o["note"], opened_at=o["opened_at"],
        opened_by_name=o["opened_by_name"], total_minor=total,
        lines=[OrderLineOut(id=str(r["id"]), product_id=str(r["product_id"]), name=r["name"], qty=float(r["qty"]),
                            sent_qty=float(sent.get(r["id"], 0)), unit_price_minor=r["unit_price_minor"], note=r["note"])
               for r in lines],
        kots=[KotOut(id=str(k["id"]), number=k["number"], kind=k["kind"],
                     station_id=str(k["station_id"]) if k["station_id"] else None,
                     station_name=k["station_name"] or COUNTER, table_label=o["table_label"], token=o["token"],
                     reason=k["reason"], approved_by_name=k["approved_by_name"], created_at=k["created_at"],
                     lines=kot_lines.get(k["id"], []))
              for k in kots])


async def _station_for(conn: asyncpg.Connection, branch_id: Any, product_id: Any) -> Any:
    """The station making this product's category at the branch (first by
    name when several do); None = the counter."""
    return await conn.fetchval(
        """select s.id from pos_products p
             join restaurant_station_categories sc on sc.category_id = p.category_id
             join restaurant_stations s on s.id = sc.station_id
            where p.id = $1 and s.branch_id = $2 and s.active order by s.name limit 1""", product_id, branch_id)


async def _next_number(conn: asyncpg.Connection, table: str, column: str, branch_id: Any) -> int:
    """The next number at the branch today (local date): KOT numbers and
    takeaway tokens restart each morning. The advisory lock keeps two tills apart."""
    await conn.execute("select pg_advisory_xact_lock(hashtext($1 || $2::text))", table, str(branch_id))
    when = "opened_at" if table == "restaurant_orders" else "created_at"
    return int(await conn.fetchval(
        f"""select coalesce(max({column}), 0) + 1 from {table}
             where branch_id = $1
               and ({when} at time zone coalesce((select timezone from tenants where id = tenant_id), 'Asia/Karachi'))::date
                 = (now() at time zone coalesce((select timezone from tenants where id = current_setting('app.tenant_id')::uuid),
                                                 'Asia/Karachi'))::date""",
        branch_id))


async def _ticket(conn: asyncpg.Connection, auth: AuthContext, o: asyncpg.Record, kind: str,
                  items: list[tuple[Any, asyncpg.Record, Decimal]], *, reason: str = "",
                  approved_by: str | None = None) -> None:
    """One ticket per station for (station, order line, qty) items."""
    by_station: dict[Any, list[tuple[asyncpg.Record, Decimal]]] = {}
    for station, line, qty in items:
        by_station.setdefault(station, []).append((line, qty))
    for station, rows in sorted(by_station.items(), key=lambda kv: str(kv[0])):
        number = await _next_number(conn, "restaurant_kots", "number", o["branch_id"])
        kid = await conn.fetchval(
            """insert into restaurant_kots (tenant_id, branch_id, order_id, station_id, number, kind, reason,
                                            approved_by, created_by)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id""",
            auth.tenant_id, o["branch_id"], o["id"], station, number, kind, reason, approved_by, auth.user_id)
        await conn.executemany(
            """insert into restaurant_kot_lines (tenant_id, kot_id, order_line_id, name, qty, note)
               values ($1, $2, $3, $4, $5, $6)""",
            [(auth.tenant_id, kid, line["id"], line["name"], qty, line["note"]) for line, qty in rows])


class Approver(BaseModel):
    user_id: str
    name: str


@router.get("/approvers", response_model=list[Approver])
async def approvers(auth: AuthContext = Depends(perm("restaurant.order.create"))) -> list[Approver]:
    """Who can approve a void at this company: holds restaurant.order.void and
    has set a till PIN. Names only; the PIN is checked on the void itself."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            "select id, role_id, name from users where status = 'active' and pos_pin_hash is not null order by name")
        return [Approver(user_id=str(r["id"]), name=r["name"]) for r in rows
                if "restaurant.order.void" in await rbac.effective_permissions(conn, auth.tenant_id, r["role_id"],
                                                                                 str(r["id"]))]


# ── Orders ──────────────────────────────────────────────────────────────────
@router.get("/orders", response_model=list[OrderOut])
async def list_orders(status_filter: OrderStatus = Query("open", alias="status"),
                      auth: AuthContext = Depends(perm("restaurant.order.read"))) -> list[OrderOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(_ORDER + " where o.status = $1 order by o.opened_at limit 300", status_filter)
        return [await _out(conn, r) for r in rows]


@router.get("/orders/{order_id}", response_model=OrderOut)
async def get_order(order_id: UUID, auth: AuthContext = Depends(perm("restaurant.order.read"))) -> OrderOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await _out(conn, await _get(conn, order_id))


@router.post("/orders", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
async def open_order(body: OrderIn, auth: AuthContext = Depends(perm("restaurant.order.create"))) -> OrderOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        table = None
        if body.order_type == "dine_in":
            if body.table_id is None:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A dine-in order needs a table")
            table = await conn.fetchrow("select id, label, branch_id, active from restaurant_tables where id = $1",
                                        body.table_id)
            if table is None or not table["active"]:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Table not found")
            branch, token = table["branch_id"], None
        else:
            if body.table_id is not None:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A takeaway order has no table")
            branch = await conn.fetchval("select app_current_branch(current_setting('app.tenant_id')::uuid)")
            token = await _next_number(conn, "restaurant_orders", "token", branch)
        try:
            oid = await conn.fetchval(
                """insert into restaurant_orders (tenant_id, branch_id, order_type, table_id, token, guests, note,
                                                  opened_by)
                   values ($1, $2, $3, $4, $5, $6, $7, $8) returning id""",
                auth.tenant_id, branch, body.order_type, body.table_id, token, body.guests, body.note, auth.user_id)
        except asyncpg.UniqueViolationError:
            label = table["label"] if table else ""
            raise HTTPException(status.HTTP_409_CONFLICT, f"Table {label} already has an open order")
        return await _out(conn, await _get(conn, oid))


@router.post("/orders/{order_id}/lines", response_model=OrderOut)
async def add_line(order_id: UUID, body: LineIn,
                   auth: AuthContext = Depends(perm("restaurant.order.create"))) -> OrderOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        o = await _get(conn, order_id, lock=True)
        _expect_open(o)
        p = await conn.fetchrow("select id, name, price_minor, active from pos_products where id = $1", body.product_id)
        if p is None or not p["active"]:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
        await conn.execute(
            """insert into restaurant_order_lines (tenant_id, order_id, product_id, name, unit_price_minor, qty, note,
                                                   created_by)
               values ($1, $2, $3, $4, $5, $6, $7, $8)""",
            auth.tenant_id, order_id, p["id"], p["name"], p["price_minor"], Decimal(str(body.qty)), body.note.strip(),
            auth.user_id)
        return await _out(conn, o)


async def _line(conn: asyncpg.Connection, line_id: Any) -> tuple[asyncpg.Record, asyncpg.Record]:
    line = await conn.fetchrow("select * from restaurant_order_lines where id = $1 for update", line_id)
    if line is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order line not found")
    o = await _get(conn, line["order_id"], lock=True)      # the order's branch policy decides visibility
    _expect_open(o)
    return line, o


@router.patch("/order-lines/{line_id}", response_model=OrderOut)
async def update_line(line_id: UUID, body: LineUpdate,
                      auth: AuthContext = Depends(perm("restaurant.order.create"))) -> OrderOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        line, o = await _line(conn, line_id)
        fields: dict[str, Any] = {}
        if body.qty is not None:
            qty = Decimal(str(body.qty))
            if qty < (await _sent(conn, o["id"])).get(line["id"], Decimal(0)):
                raise HTTPException(status.HTTP_409_CONFLICT, "Already sent to the kitchen: void it instead")
            fields["qty"] = qty
        if body.note is not None:
            fields["note"] = body.note.strip()
        if fields:
            sets = ", ".join(f"{k} = ${i}" for i, k in enumerate(fields, 2))
            await conn.execute(f"update restaurant_order_lines set {sets} where id = $1", line_id, *fields.values())
        return await _out(conn, o)


@router.post("/orders/{order_id}/send", response_model=OrderOut)
async def send_to_kitchen(order_id: UUID, auth: AuthContext = Depends(perm("restaurant.order.create"))) -> OrderOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        o = await _get(conn, order_id, lock=True)
        _expect_open(o)
        sent = await _sent(conn, order_id)
        items = []
        for line in await conn.fetch("select * from restaurant_order_lines where order_id = $1 order by created_at",
                                     order_id):
            new = Decimal(line["qty"]) - sent.get(line["id"], Decimal(0))
            if new > 0:
                items.append((await _station_for(conn, o["branch_id"], line["product_id"]), line, new))
        if not items:
            raise HTTPException(status.HTTP_409_CONFLICT, "Nothing new to send to the kitchen")
        await _ticket(conn, auth, o, "order", items)
        return await _out(conn, o)


@router.post("/order-lines/{line_id}/void", response_model=OrderOut)
async def void_line(line_id: UUID, body: VoidIn,
                    auth: AuthContext = Depends(perm("restaurant.order.create"))) -> OrderOut:
    """Unsent quantity goes quietly; anything the kitchen already has needs
    a reason and restaurant.order.void (or a manager's PIN), and a VOID
    ticket tells that station."""
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        line, o = await _line(conn, line_id)
        await approvals.ensure_known(conn, body.approver_id)   # a named approver is ours, needed or not
        qty, have = Decimal(str(body.qty)), Decimal(line["qty"])
        if qty > have:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Only {have.normalize():f} on the order")
        sent = (await _sent(conn, o["id"])).get(line["id"], Decimal(0))
        from_sent = max(Decimal(0), qty - (have - sent))
        if from_sent > 0:
            reason = body.reason.strip()
            if len(reason) < 3:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                    "Say why: the kitchen already has this item")
            approver = await approvals.approve(
                conn, auth, {"restaurant.order.void"}, body.approver_id, body.approver_pin,
                ask="Cancelling an item the kitchen has needs a manager to approve with their PIN")
            station = await _station_for(conn, o["branch_id"], line["product_id"])
            await _ticket(conn, auth, o, "void", [(station, line, from_sent)], reason=reason,
                          approved_by=approver)
        await conn.execute("update restaurant_order_lines set qty = qty - $2 where id = $1", line_id, qty)
        return await _out(conn, o)


@router.post("/orders/{order_id}/cancel", response_model=OrderOut)
async def cancel_order(order_id: UUID, auth: AuthContext = Depends(perm("restaurant.order.create"))) -> OrderOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        o = await _get(conn, order_id, lock=True)
        _expect_open(o)
        if any(v > 0 for v in (await _sent(conn, order_id)).values()):
            raise HTTPException(status.HTTP_409_CONFLICT, "The kitchen has items from this order: void them first")
        await conn.execute("update restaurant_orders set status = 'cancelled', closed_at = now() where id = $1",
                           order_id)
        return await _out(conn, await _get(conn, order_id))
