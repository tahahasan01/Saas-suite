"""Catalog v2 endpoints (3C, migration 0075): categories, packaging barcodes,
the tenant's weight/price barcode rules, variant groups and the stock
ledger. Stock itself only moves through app/catalog.py."""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field

from .. import catalog, db
from ..deps import AuthContext
from ..models import AdjustReason, BarcodeRuleKind, ProductOut, TileColor
from ..rbac import perm
from .pos import _held, _product

router = APIRouter(prefix="/pos", tags=["pos"])


# ── Categories ───────────────────────────────────────────────────────────────
class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    position: int = 0
    color: TileColor | None = None


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    position: int | None = None
    active: bool | None = None
    color: TileColor | Literal[""] | None = None     # "" clears it


class CategoryOut(BaseModel):
    id: str
    name: str
    position: int
    active: bool
    product_count: int
    color: str | None = None


def _category(r: asyncpg.Record) -> CategoryOut:
    return CategoryOut(id=str(r["id"]), name=r["name"], position=r["position"], active=r["active"],
                       product_count=r["product_count"], color=r["color"])


_CATEGORIES = """select c.*, (select count(*) from pos_products p where p.category_id = c.id and p.active)
                        as product_count from pos_categories c"""


@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(include_retired: bool = False,
                          auth: AuthContext = Depends(perm("products.product.read"))) -> list[CategoryOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(_CATEGORIES + " where c.active or $1 order by c.position, c.name", include_retired)
    return [_category(r) for r in rows]


@router.post("/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(body: CategoryIn, auth: AuthContext = Depends(perm("products.product.update"))) -> CategoryOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        try:
            cid = await conn.fetchval(
                "insert into pos_categories (tenant_id, name, position, color) values ($1, $2, $3, $4) returning id",
                auth.tenant_id, body.name.strip(), body.position, body.color)
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, "A category with that name already exists")
        return _category(await conn.fetchrow(_CATEGORIES + " where c.id = $1", cid))


@router.patch("/categories/{category_id}", response_model=CategoryOut)
async def update_category(category_id: str, body: CategoryUpdate,
                          auth: AuthContext = Depends(perm("products.product.update"))) -> CategoryOut:
    fields = body.model_dump(exclude_none=True)
    if fields.get("color") == "":
        fields["color"] = None
    async with db.tenant_conn(auth.tenant_id) as conn:
        if fields:
            sets = ", ".join(f"{k} = ${i}" for i, k in enumerate(fields, 2))
            try:
                done = await conn.execute(f"update pos_categories set {sets} where id = $1", category_id,
                                          *fields.values())
            except asyncpg.UniqueViolationError:
                raise HTTPException(status.HTTP_409_CONFLICT, "A category with that name already exists")
            if done == "UPDATE 0":
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
            if "name" in fields:   # the label the till shows
                await conn.execute("update pos_products set category = $2 where category_id = $1",
                                   category_id, fields["name"])
        row = await conn.fetchrow(_CATEGORIES + " where c.id = $1", category_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    return _category(row)


# ── Variants ─────────────────────────────────────────────────────────────────
@router.get("/products/{product_id}/variants", response_model=list[ProductOut])
async def variants(product_id: str,
                   auth: AuthContext = Depends(perm("products.product.read"))) -> list[ProductOut]:
    """The product's group: the group's first product and everything pointing at it."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        head = await conn.fetchval("select coalesce(group_id, id) from pos_products where id = $1", product_id)
        if head is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
        rows = await conn.fetch(
            "select * from pos_products where (id = $1 or group_id = $1) and active order by name", head)
        held = await _held(conn, auth)
    return [_product(r, held) for r in rows]


# ── Packaging barcodes ───────────────────────────────────────────────────────
class BarcodeIn(BaseModel):
    barcode: str = Field(pattern=r"^[0-9A-Za-z-]{3,40}$")
    qty: float = Field(default=1, gt=0, le=100000)
    label: str = Field(default="", max_length=60)


class BarcodeOut(BaseModel):
    id: str
    barcode: str
    qty: float
    label: str


@router.get("/products/{product_id}/barcodes", response_model=list[BarcodeOut])
async def list_barcodes(product_id: str,
                        auth: AuthContext = Depends(perm("products.product.read"))) -> list[BarcodeOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch("select * from pos_product_barcodes where product_id = $1 order by qty", product_id)
    return [BarcodeOut(id=str(r["id"]), barcode=r["barcode"], qty=float(r["qty"]), label=r["label"]) for r in rows]


@router.post("/products/{product_id}/barcodes", response_model=BarcodeOut, status_code=status.HTTP_201_CREATED)
async def add_barcode(product_id: str, body: BarcodeIn,
                      auth: AuthContext = Depends(perm("products.product.update"))) -> BarcodeOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        if not await conn.fetchval("select 1 from pos_products where id = $1", product_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
        # One barcode, one product: neither another product's own barcode nor a package's.
        if await conn.fetchval("select 1 from pos_products where barcode = $1", body.barcode):
            raise HTTPException(status.HTTP_409_CONFLICT, "That barcode already belongs to a product")
        try:
            row = await conn.fetchrow(
                """insert into pos_product_barcodes (tenant_id, product_id, barcode, qty, label)
                   values ($1, $2, $3, $4, $5) returning *""",
                auth.tenant_id, product_id, body.barcode, body.qty, body.label)
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, "That barcode already belongs to a product")
    return BarcodeOut(id=str(row["id"]), barcode=row["barcode"], qty=float(row["qty"]), label=row["label"])


@router.delete("/products/{product_id}/barcodes/{barcode_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_barcode(product_id: str, barcode_id: str,
                         auth: AuthContext = Depends(perm("products.product.update"))) -> Response:
    async with db.tenant_conn(auth.tenant_id) as conn:
        done = await conn.execute("delete from pos_product_barcodes where id = $1 and product_id = $2",
                                  barcode_id, product_id)
    if done == "DELETE 0":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Barcode not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Weight / price barcode rules ─────────────────────────────────────────────
class RuleIn(BaseModel):
    prefix: str = Field(pattern=r"^2[0-9]$")
    kind: BarcodeRuleKind
    value_decimals: int = Field(default=3, ge=0, le=3)
    active: bool = True


class RuleOut(RuleIn):
    id: str


@router.get("/barcode-rules", response_model=list[RuleOut])
async def list_rules(auth: AuthContext = Depends(perm("products.product.read"))) -> list[RuleOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch("select * from pos_barcode_rules order by prefix")
    return [RuleOut(id=str(r["id"]), prefix=r["prefix"], kind=r["kind"], value_decimals=r["value_decimals"],
                    active=r["active"]) for r in rows]


@router.post("/barcode-rules", response_model=RuleOut, status_code=status.HTTP_201_CREATED)
async def add_rule(body: RuleIn, auth: AuthContext = Depends(perm("products.product.update"))) -> RuleOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        try:
            rid = await conn.fetchval(
                """insert into pos_barcode_rules (tenant_id, prefix, kind, value_decimals, active)
                   values ($1, $2, $3, $4, $5) returning id""",
                auth.tenant_id, body.prefix, body.kind, body.value_decimals, body.active)
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, f"There is already a rule for prefix {body.prefix}")
    return RuleOut(id=str(rid), **body.model_dump())


@router.delete("/barcode-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_rule(rule_id: str, auth: AuthContext = Depends(perm("products.product.update"))) -> Response:
    async with db.tenant_conn(auth.tenant_id) as conn:
        done = await conn.execute("delete from pos_barcode_rules where id = $1", rule_id)
    if done == "DELETE 0":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rule not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Stock ledger ─────────────────────────────────────────────────────────────
class AdjustmentIn(BaseModel):
    product_id: UUID
    qty_delta: float = Field(ge=-1_000_000, le=1_000_000)
    reason: AdjustReason
    note: str = Field(default="", max_length=300)


class AdjustmentOut(BaseModel):
    product_id: str
    stock_qty: float


class MoveOut(BaseModel):
    id: str
    product_id: str
    product_name: str
    qty_delta: float
    reason: str
    ref_id: str | None
    note: str
    user_name: str | None
    created_at: datetime


@router.post("/stock/adjustments", response_model=AdjustmentOut, status_code=status.HTTP_201_CREATED)
async def adjust(body: AdjustmentIn, auth: AuthContext = Depends(perm("products.stock.adjust"))) -> AdjustmentOut:
    if body.qty_delta == 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "An adjustment needs a quantity")
    async with db.tenant_conn(auth.tenant_id) as conn:
        after = await catalog.move(conn, auth.tenant_id, body.product_id, body.qty_delta, body.reason,
                                   note=body.note, user_id=auth.user_id)
        if after is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "This product doesn't track stock")
    return AdjustmentOut(product_id=str(body.product_id), stock_qty=float(after))


@router.get("/stock/moves", response_model=list[MoveOut])
async def moves(product_id: str | None = None, limit: int = Query(100, ge=1, le=500),
                auth: AuthContext = Depends(perm("products.product.read"))) -> list[MoveOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            """select m.*, p.name as product_name, u.name as user_name
                 from pos_stock_moves m join pos_products p on p.id = m.product_id
                 left join users u on u.id = m.user_id
                where ($1::uuid is null or m.product_id = $1)
                order by m.created_at desc, m.id limit $2""", product_id, limit)
    return [MoveOut(id=str(r["id"]), product_id=str(r["product_id"]), product_name=r["product_name"],
                    qty_delta=float(r["qty_delta"]), reason=r["reason"],
                    ref_id=str(r["ref_id"]) if r["ref_id"] else None, note=r["note"], user_name=r["user_name"],
                    created_at=r["created_at"]) for r in rows]
