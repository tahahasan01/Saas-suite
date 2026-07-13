"""POS — products, checkout (sales), inventory. Guarded by the 'pos' section."""
from __future__ import annotations

import math

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from .. import db
from ..deps import AuthContext
from ..models import (
    ForecastItem,
    ForecastOut,
    OccasionForecast,
    PosSummary,
    ProductCreate,
    ProductOut,
    ProductUpdate,
    RestockItem,
    SaleCreate,
    SaleItemOut,
    SaleOut,
)
from ..rbac import require

_VELOCITY_SQL = """
with vel as (
  select si.product_id, coalesce(sum(si.qty), 0) as sold
  from pos_sale_items si join pos_sales s on s.id = si.sale_id
  where s.created_at > now() - interval '30 days'
  group by si.product_id
)
select p.id, p.name, p.unit, p.stock_qty, p.low_stock_at, coalesce(v.sold, 0) as sold_30d
from pos_products p left join vel v on v.product_id = p.id
where p.active
"""

router = APIRouter(prefix="/pos", tags=["pos"])


def _product(r: asyncpg.Record) -> ProductOut:
    return ProductOut(
        id=str(r["id"]), name=r["name"], sku=r["sku"], barcode=r["barcode"], category=r["category"],
        unit=r["unit"], price_minor=r["price_minor"], cost_minor=r["cost_minor"],
        stock_qty=float(r["stock_qty"]), low_stock_at=float(r["low_stock_at"]), active=r["active"])


@router.get("/products", response_model=list[ProductOut])
async def list_products(q: str | None = None, auth: AuthContext = Depends(require("pos", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        if q:
            rows = await conn.fetch(
                """select * from pos_products where active
                   and (name ilike '%'||$1||'%' or sku ilike '%'||$1||'%' or barcode = $1)
                   order by name limit 50""", q)
        else:
            rows = await conn.fetch("select * from pos_products where active order by name limit 200")
    return [_product(r) for r in rows]


@router.get("/products/lookup", response_model=ProductOut)
async def lookup(barcode: str, auth: AuthContext = Depends(require("pos", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow("select * from pos_products where barcode=$1 and active", barcode)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No product with that barcode")
    return _product(row)


@router.post("/products", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def create_product(body: ProductCreate, auth: AuthContext = Depends(require("pos", "write"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow(
            """insert into pos_products (tenant_id, name, sku, barcode, category, unit, price_minor, cost_minor, stock_qty, low_stock_at)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *""",
            auth.tenant_id, body.name, body.sku, body.barcode, body.category, body.unit,
            body.price_minor, body.cost_minor, body.stock_qty, body.low_stock_at)
    return _product(row)


@router.patch("/products/{product_id}", response_model=ProductOut)
async def update_product(product_id: str, body: ProductUpdate, auth: AuthContext = Depends(require("pos", "write"))):
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing to update")
    async with db.tenant_conn(auth.tenant_id) as conn:
        cols = ", ".join(f"{k}=${i+2}" for i, k in enumerate(fields))
        row = await conn.fetchrow(
            f"update pos_products set {cols}, updated_at=now() where id=$1 returning *", product_id, *fields.values())
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    return _product(row)


@router.post("/sales", response_model=SaleOut, status_code=status.HTTP_201_CREATED)
async def checkout(body: SaleCreate, auth: AuthContext = Depends(require("pos", "write"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        subtotal = 0
        lines = []
        for it in body.items:
            p = await conn.fetchrow("select id, name, price_minor from pos_products where id=$1 and active", it.product_id)
            if p is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, f"Product {it.product_id} not found")
            line_total = round(p["price_minor"] * it.qty)
            subtotal += line_total
            lines.append((p, it.qty, line_total))
        total = max(0, subtotal - body.discount_minor)
        change = max(0, body.paid_minor - total)
        sale_id = await conn.fetchval(
            """insert into pos_sales (tenant_id, cashier_id, subtotal_minor, discount_minor, total_minor,
                                      paid_minor, change_minor, payment_method, item_count)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id""",
            auth.tenant_id, auth.user_id, subtotal, body.discount_minor, total,
            body.paid_minor, change, body.payment_method, len(lines))
        items = []
        for p, qty, line_total in lines:
            await conn.execute(
                """insert into pos_sale_items (tenant_id, sale_id, product_id, name, qty, price_minor, line_total_minor)
                   values ($1,$2,$3,$4,$5,$6,$7)""",
                auth.tenant_id, sale_id, p["id"], p["name"], qty, p["price_minor"], line_total)
            await conn.execute("update pos_products set stock_qty = stock_qty - $1 where id=$2", qty, p["id"])
            items.append(SaleItemOut(name=p["name"], qty=qty, price_minor=p["price_minor"], line_total_minor=line_total))
        sale = await conn.fetchrow("select * from pos_sales where id=$1", sale_id)
    return SaleOut(
        id=str(sale["id"]), subtotal_minor=sale["subtotal_minor"], discount_minor=sale["discount_minor"],
        total_minor=sale["total_minor"], paid_minor=sale["paid_minor"], change_minor=sale["change_minor"],
        payment_method=sale["payment_method"], item_count=sale["item_count"], created_at=sale["created_at"], items=items)


@router.get("/summary", response_model=PosSummary)
async def summary(auth: AuthContext = Depends(require("pos", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow(
            """select
                 (select count(*) from pos_products where active) as products,
                 (select count(*) from pos_products where active and low_stock_at > 0 and stock_qty <= low_stock_at) as low,
                 (select count(*) from pos_sales where created_at::date = current_date) as sales_today,
                 (select coalesce(sum(total_minor),0) from pos_sales where created_at::date = current_date) as sales_total
            """)
    return PosSummary(products_count=row["products"], low_stock_count=row["low"],
                      sales_today_count=row["sales_today"], sales_today_total_minor=row["sales_total"])


@router.get("/restock", response_model=list[RestockItem])
async def restock(auth: AuthContext = Depends(require("pos", "read"))):
    """Velocity-based reorder advice: flag products running out relative to how
    fast they sell (30-day velocity), plus anything below its low-stock line."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(_VELOCITY_SQL)
    out: list[RestockItem] = []
    for r in rows:
        stock, low, sold = float(r["stock_qty"]), float(r["low_stock_at"]), float(r["sold_30d"])
        vel = sold / 30.0
        if vel > 0:
            days_left = stock / vel
            if days_left < 10:  # under ~10 days of cover
                rec = max(0, math.ceil(vel * 30 - stock))  # restock to ~30 days
                out.append(RestockItem(product_id=str(r["id"]), name=r["name"], unit=r["unit"],
                                       stock_qty=stock, daily_velocity=round(vel, 2), days_left=round(days_left, 1),
                                       recommend_qty=rec, reason=f"Selling ~{vel:.1f}/day · ~{days_left:.0f} days left"))
        elif low > 0 and stock <= low:
            out.append(RestockItem(product_id=str(r["id"]), name=r["name"], unit=r["unit"], stock_qty=stock,
                                   daily_velocity=0, days_left=None, recommend_qty=math.ceil(max(0, low * 2 - stock)),
                                   reason="Below low-stock threshold"))
    out.sort(key=lambda x: (x.days_left if x.days_left is not None else 999))
    return out


@router.get("/forecast", response_model=ForecastOut)
async def forecast(auth: AuthContext = Depends(require("pos", "read"))):
    """60-day look-ahead: upcoming occasions with projected demand per product
    from recent velocity × event duration × expected uplift."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        vel_rows = await conn.fetch(_VELOCITY_SQL)
        occasions = await conn.fetch(
            """select name, event_date, uplift_pct, duration_days,
                      (event_date - current_date) as days_until
               from occasion_calendar
               where region='PK' and event_date between current_date and current_date + interval '60 days'
               order by event_date""")
    # products sorted by velocity, top movers only
    movers = sorted(
        ({"id": str(r["id"]), "name": r["name"], "stock": float(r["stock_qty"]), "vel": float(r["sold_30d"]) / 30.0}
         for r in vel_rows if float(r["sold_30d"]) > 0),
        key=lambda x: x["vel"], reverse=True)[:5]

    result: list[OccasionForecast] = []
    for occ in occasions:
        items = []
        for m in movers:
            projected = math.ceil(m["vel"] * occ["duration_days"] * (1 + occ["uplift_pct"] / 100))
            items.append(ForecastItem(product_id=m["id"], name=m["name"], current_stock=m["stock"],
                                      projected_units=projected, recommend_qty=max(0, projected - int(m["stock"]))))
        result.append(OccasionForecast(occasion=occ["name"], event_date=occ["event_date"].isoformat(),
                                       days_until=occ["days_until"], uplift_pct=occ["uplift_pct"], items=items))
    return ForecastOut(occasions=result)
