"""Catalog v2 and the stock ledger (3C, migration 0075).

Stock only moves through `move()`, always at one branch (0091): it locks the
product and that branch's level, refuses to take the branch below zero
unless the tenant allows it (M10), updates the level and the company total
(stock_qty) and appends the matching pos_stock_moves row, all in the
caller's transaction. A product that doesn't track stock (a service) never
moves.

`scan()` turns whatever the scanner read into (product, quantity): the
product's own barcode, a packaging barcode (a carton of 12), or a weight /
price barcode from a scale per the tenant's rules.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

import asyncpg
from fastapi import HTTPException, status

from .models import StockMoveReason


def _qty(x: float | Decimal | int) -> Decimal:
    return x if isinstance(x, Decimal) else Decimal(str(x))


async def category_for(conn: asyncpg.Connection, tenant_id: str, *, category_id: Any = None,
                       name: str | None = None) -> tuple[Any, str]:
    """(category_id, its name) from an id, or found/created from a name; the
    name is kept on the product as its label (the till's old text field)."""
    if category_id is not None:
        label = await conn.fetchval("select name from pos_categories where id = $1", category_id)
        if label is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
        return category_id, label
    name = (name or "").strip()
    if not name:
        return None, ""
    row = await conn.fetchrow("select id, name from pos_categories where lower(btrim(name)) = lower($1)", name)
    if row is None:
        row = await conn.fetchrow(
            """insert into pos_categories (tenant_id, name) values ($1, $2)
               on conflict (tenant_id, lower(btrim(name))) do update set name = pos_categories.name
               returning id, name""", tenant_id, name)
    return row["id"], row["name"]


async def ensure_group(conn: asyncpg.Connection, group_id: Any) -> None:
    if group_id is not None and not await conn.fetchval("select 1 from pos_products where id = $1", group_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Variant group not found")


async def here(conn: asyncpg.Connection) -> Any:
    """The caller's working branch: the one named in X-Branch-Ids, else the default."""
    return await conn.fetchval("select app_current_branch(current_setting('app.tenant_id')::uuid)")


async def move(conn: asyncpg.Connection, tenant_id: str, product_id: Any, delta: float | Decimal, reason: StockMoveReason,
               *, branch_id: Any = None, ref_id: Any = None, note: str = "", user_id: str | None = None,
               allow_negative: bool | None = None) -> Decimal | None:
    """Move stock by `delta` at `branch_id` (default: the caller's branch) and
    keep the ledger. Returns that branch's new stock, or None for a product
    that doesn't track stock."""
    d = _qty(delta)
    p = await conn.fetchrow("select name, stock_qty, track_stock from pos_products where id = $1 for update",
                            product_id)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    if not p["track_stock"] or d == 0:
        return None
    if branch_id is not None and not await conn.fetchval(
            "select 1 from branches where id = $1 and app_branch_visible(id)", branch_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Branch not found")
    branch = branch_id or await here(conn)
    await conn.execute(
        """insert into pos_stock_levels (tenant_id, product_id, branch_id) values ($1, $2, $3)
           on conflict (product_id, branch_id) do nothing""", tenant_id, product_id, branch)
    level = await conn.fetchval(
        "select qty from pos_stock_levels where product_id = $1 and branch_id = $2 for update", product_id, branch)
    if level is None:      # a branch the caller can't see
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Branch not found")
    after = Decimal(level) + d
    if after < 0:
        if allow_negative is None:
            allow_negative = bool(await conn.fetchval(
                "select allow_negative_stock from tenants where id = current_setting('app.tenant_id')::uuid"))
        if not allow_negative:
            where = await conn.fetchval("select name from branches where id = $1", branch)
            raise HTTPException(status.HTTP_409_CONFLICT,
                                f"Not enough stock of {p['name']} at {where}: {Decimal(level).normalize():f} on hand")
    await conn.execute("update pos_stock_levels set qty = $3, updated_at = now() where product_id = $1 and branch_id = $2",
                       product_id, branch, after)
    await conn.execute("update pos_products set stock_qty = stock_qty + $2, updated_at = now() where id = $1",
                       product_id, d)
    await conn.execute(
        """insert into pos_stock_moves (tenant_id, product_id, branch_id, qty_delta, reason, ref_id, note, user_id)
           values ($1, $2, $3, $4, $5, $6, $7, $8)""", tenant_id, product_id, branch, d, reason, ref_id, note, user_id)
    return after


async def opening(conn: asyncpg.Connection, tenant_id: str, product_id: Any, qty: float, user_id: str | None) -> None:
    """A new product's stock on hand opens its ledger, at the caller's branch."""
    if qty:
        branch = await here(conn)
        rows = await conn.execute(
            """insert into pos_stock_moves (tenant_id, product_id, branch_id, qty_delta, reason, note, user_id)
               select $1, id, $4, stock_qty, 'opening', 'Stock when the product was added', $3
                 from pos_products where id = $2 and track_stock and stock_qty <> 0""",
            tenant_id, product_id, user_id, branch)
        if rows != "INSERT 0 0":
            await conn.execute(
                """insert into pos_stock_levels (tenant_id, product_id, branch_id, qty)
                   select $1, id, $3, stock_qty from pos_products where id = $2""", tenant_id, product_id, branch)


def _ean13_ok(code: str) -> bool:
    if len(code) != 13 or not code.isdigit():
        return False
    s = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(code[:12]))
    return (10 - s % 10) % 10 == int(code[12])


async def scan(conn: asyncpg.Connection, code: str) -> tuple[asyncpg.Record, Decimal] | None:
    code = code.strip()
    row: asyncpg.Record | None = await conn.fetchrow(
        "select * from pos_products where barcode = $1 and active", code)
    if row is not None:
        return row, Decimal(1)
    pack = await conn.fetchrow(
        """select p.*, b.qty as scan_qty from pos_product_barcodes b join pos_products p on p.id = b.product_id
            where b.barcode = $1 and p.active""", code)
    if pack is not None:
        return pack, Decimal(pack["scan_qty"])
    if _ean13_ok(code):
        rule = await conn.fetchrow("select * from pos_barcode_rules where prefix = $1 and active", code[:2])
        if rule is not None:
            item, value = code[2:7], Decimal(int(code[7:12])) / (Decimal(10) ** rule["value_decimals"])
            p = await conn.fetchrow("select * from pos_products where sku = $1 and active", item)
            if p is not None:
                if rule["kind"] == "weight":
                    return p, value
                if p["price_minor"] > 0:
                    qty = (value * 100 / Decimal(p["price_minor"])).quantize(Decimal("0.001"))
                    return p, qty
    return None
