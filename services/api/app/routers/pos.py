"""POS — products, checkout (sales), inventory. Guarded by the 'pos' section."""
from __future__ import annotations

import math
from decimal import Decimal

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from .. import csv_io, db, fbr, fbr_submit
from ..deps import AuthContext
from ..models import (
    ForecastItem,
    ForecastOut,
    ImportResult,
    ImportRowError,
    OccasionForecast,
    PosSummary,
    ProductCreate,
    ProductOut,
    ProductUpdate,
    RestockItem,
    ReturnableLine,
    ReturnCreate,
    ReturnItemOut,
    ReturnOut,
    SaleCreate,
    SaleDetail,
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
        stock_qty=float(r["stock_qty"]), low_stock_at=float(r["low_stock_at"]), active=r["active"],
        hs_code=r["hs_code"], tax_rate=float(r["tax_rate"]), fbr_uom=r["fbr_uom"])


@router.get("/products", response_model=list[ProductOut])
async def list_products(q: str | None = None, include_archived: bool = False,
                        auth: AuthContext = Depends(require("pos", "read"))):
    """Archived products stay listable behind a flag — otherwise archiving is a
    one-way trip and the catalog can never be un-done."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        if q:
            rows = await conn.fetch(
                """select * from pos_products where (active or $2)
                   and (name ilike '%'||$1||'%' or sku ilike '%'||$1||'%' or barcode = $1)
                   order by active desc, name limit 50""", q, include_archived)
        else:
            rows = await conn.fetch(
                "select * from pos_products where (active or $1) order by active desc, name limit 200",
                include_archived)
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
            """insert into pos_products (tenant_id, name, sku, barcode, category, unit, price_minor,
                                         cost_minor, stock_qty, low_stock_at, hs_code, tax_rate, fbr_uom)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *""",
            auth.tenant_id, body.name, body.sku, body.barcode, body.category, body.unit,
            body.price_minor, body.cost_minor, body.stock_qty, body.low_stock_at,
            body.hs_code, body.tax_rate, body.fbr_uom)
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
        subtotal = tax_total = 0
        lines = []
        for it in body.items:
            p = await conn.fetchrow(
                """select id, name, price_minor, hs_code, tax_rate, fbr_uom
                     from pos_products where id=$1 and active""", it.product_id)
            if p is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, f"Product {it.product_id} not found")
            line_total = round(p["price_minor"] * it.qty)
            subtotal += line_total
            lines.append((p, it.qty, line_total))
        total = max(0, subtotal - body.discount_minor)
        change = max(0, body.paid_minor - total)

        fbr_cfg = await conn.fetchrow("select * from fbr_settings where tenant_id=$1", auth.tenant_id)
        if fbr_cfg and fbr_cfg["enabled"]:
            for p, _qty, line_total in lines:
                _, line_tax = fbr.split_tax(line_total, Decimal(str(p["tax_rate"] or 0)),
                                            fbr_cfg["prices_include_tax"])
                tax_total += line_tax

        sale_id = await conn.fetchval(
            """insert into pos_sales (tenant_id, cashier_id, subtotal_minor, discount_minor, total_minor,
                                      paid_minor, change_minor, payment_method, item_count, tax_minor)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id""",
            auth.tenant_id, auth.user_id, subtotal, body.discount_minor, total,
            body.paid_minor, change, body.payment_method, len(lines), tax_total)
        items = []
        for p, qty, line_total in lines:
            await conn.execute(
                """insert into pos_sale_items (tenant_id, sale_id, product_id, name, qty, price_minor, line_total_minor)
                   values ($1,$2,$3,$4,$5,$6,$7)""",
                auth.tenant_id, sale_id, p["id"], p["name"], qty, p["price_minor"], line_total)
            await conn.execute("update pos_products set stock_qty = stock_qty - $1 where id=$2", qty, p["id"])
            items.append(SaleItemOut(name=p["name"], qty=qty, price_minor=p["price_minor"], line_total_minor=line_total))
        sale = await conn.fetchrow("select * from pos_sales where id=$1", sale_id)

    fbr_number = fbr_status = None
    if fbr_cfg and fbr_cfg["enabled"]:
        # The sale is already committed. FBR transmission happens after, and its
        # failure is recorded rather than raised: a government outage must never
        # stop a shop from selling. Anything not submitted is retried by jobs.py.
        result = await fbr_submit.submit_sale(auth.tenant_id, str(sale_id), fbr_cfg, lines)
        fbr_number, fbr_status = result.invoice_number, ("submitted" if result.ok else "pending")

    return SaleOut(
        id=str(sale["id"]), subtotal_minor=sale["subtotal_minor"], discount_minor=sale["discount_minor"],
        total_minor=sale["total_minor"], paid_minor=sale["paid_minor"], change_minor=sale["change_minor"],
        payment_method=sale["payment_method"], item_count=sale["item_count"], created_at=sale["created_at"],
        items=items, tax_minor=sale["tax_minor"], fbr_invoice_number=fbr_number, fbr_status=fbr_status)


# ── CSV import / export ─────────────────────────────────────────────────────
@router.post("/products/import", response_model=ImportResult)
async def import_products(request: Request, skip_duplicates: bool = True,
                          auth: AuthContext = Depends(require("pos", "write"))) -> ImportResult:
    """Bulk-load the catalog from CSV. A shop's stock list almost always already
    exists in Excel — retyping 500 SKUs by hand is how trials die."""
    rows = csv_io.read_rows(await request.body(), csv_io.PRODUCT_HEADERS)

    created = skipped = 0
    errors: list[ImportRowError] = []
    async with db.tenant_conn(auth.tenant_id) as conn:
        for i, row in enumerate(rows, start=2):
            name, barcode, sku = row.get("name", ""), row.get("barcode", ""), row.get("sku", "")
            if not name:
                errors.append(ImportRowError(row=i, error="Missing name"))
                continue
            if skip_duplicates and await conn.fetchval(
                """select 1 from pos_products
                    where ($1 <> '' and barcode = $1) or ($2 <> '' and sku = $2) or lower(name) = lower($3)
                    limit 1""", barcode, sku, name):
                skipped += 1
                continue
            tax_rate = min(100.0, max(0.0, csv_io.parse_number(row.get("tax_rate", ""))))
            await conn.execute(
                """insert into pos_products (tenant_id, name, sku, barcode, category, price_minor,
                                             cost_minor, stock_qty, hs_code, tax_rate)
                   values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)""",
                auth.tenant_id, name, sku, barcode, row.get("category", ""),
                csv_io.parse_money_minor(row.get("price", "")),
                csv_io.parse_money_minor(row.get("cost", "")),
                csv_io.parse_number(row.get("stock", "")),
                row.get("hs_code", ""), tax_rate)
            created += 1
    return ImportResult(created=created, skipped_duplicates=skipped, errors=errors[:50])


@router.get("/products/export")
async def export_products(auth: AuthContext = Depends(require("pos", "read"))) -> Response:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            """select name, sku, barcode, category, (price_minor / 100.0) as price,
                      (cost_minor / 100.0) as cost, stock_qty as stock, hs_code, tax_rate
                 from pos_products where active order by name""")
    body = csv_io.to_csv(
        ["name", "sku", "barcode", "category", "price", "cost", "stock", "hs_code", "tax_rate"],
        [dict(r) for r in rows])
    return Response(body, media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="products.csv"'})


# ── Returns ─────────────────────────────────────────────────────────────────
# What each line of a sale has left to give back. The left join + coalesce is
# the guard against refunding three of two items across separate visits.
_RETURNABLE = """
select i.id as sale_item_id, i.product_id, i.name, i.qty as qty_sold, i.price_minor,
       coalesce((select sum(r.qty) from pos_return_items r where r.sale_item_id = i.id), 0) as qty_returned,
       -- Carried through for the FBR debit note: a note without an HS code is
       -- rejected with error 0052.
       coalesce(p.hs_code, '') as hs_code,
       coalesce(p.tax_rate, 0) as tax_rate,
       coalesce(p.fbr_uom, 'Numbers, pieces, units') as fbr_uom
  from pos_sale_items i
  left join pos_products p on p.id = i.product_id
 where i.sale_id = $1
 order by i.name
"""


@router.get("/sales/{sale_id}", response_model=SaleDetail)
async def get_sale(sale_id: str, auth: AuthContext = Depends(require("pos", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        sale = await conn.fetchrow("select * from pos_sales where id=$1", sale_id)
        if sale is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Sale not found")
        lines = await conn.fetch(_RETURNABLE, sale_id)
        fbr_row = await conn.fetchrow(
            "select fbr_invoice_number, status from pos_fbr_invoices where sale_id=$1 and return_id is null",
            sale_id)
    returnable = [ReturnableLine(
        sale_item_id=str(r["sale_item_id"]),
        product_id=str(r["product_id"]) if r["product_id"] else None,
        name=r["name"], qty_sold=float(r["qty_sold"]), qty_returned=float(r["qty_returned"]),
        qty_returnable=float(r["qty_sold"]) - float(r["qty_returned"]), price_minor=r["price_minor"],
    ) for r in lines]
    return SaleDetail(
        id=str(sale["id"]), subtotal_minor=sale["subtotal_minor"], discount_minor=sale["discount_minor"],
        total_minor=sale["total_minor"], paid_minor=sale["paid_minor"], change_minor=sale["change_minor"],
        payment_method=sale["payment_method"], item_count=sale["item_count"], created_at=sale["created_at"],
        tax_minor=sale["tax_minor"],
        fbr_invoice_number=fbr_row["fbr_invoice_number"] if fbr_row else None,
        fbr_status=fbr_row["status"] if fbr_row else None,
        items=[SaleItemOut(name=r["name"], qty=float(r["qty_sold"]), price_minor=r["price_minor"],
                           line_total_minor=round(r["price_minor"] * float(r["qty_sold"])))
               for r in lines],
        returnable=returnable)


@router.post("/sales/{sale_id}/returns", response_model=ReturnOut, status_code=status.HTTP_201_CREATED)
async def create_return(sale_id: str, body: ReturnCreate,
                        auth: AuthContext = Depends(require("pos", "write"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        if await conn.fetchval("select 1 from pos_sales where id=$1", sale_id) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Sale not found")
        available = {str(r["sale_item_id"]): r for r in await conn.fetch(_RETURNABLE, sale_id)}

        refund = tax_total = 0
        lines = []
        for want in body.items:
            row = available.get(want.sale_item_id)
            if row is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "That item isn't on this sale")
            left = float(row["qty_sold"]) - float(row["qty_returned"])
            if want.qty > left:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    f"Only {left:g} of {row['name']} can be returned — {row['qty_returned']:g} already came back.")
            line_refund = round(row["price_minor"] * want.qty)
            refund += line_refund
            lines.append((row, want.qty, line_refund))

        fbr_cfg = await conn.fetchrow("select * from fbr_settings where tenant_id=$1", auth.tenant_id)
        if fbr_cfg and fbr_cfg["enabled"]:
            for row, qty, line_refund in lines:
                rate = await conn.fetchval(
                    "select coalesce(tax_rate, 0) from pos_products where id=$1", row["product_id"]) or 0
                _, line_tax = fbr.split_tax(line_refund, Decimal(str(rate)), fbr_cfg["prices_include_tax"])
                tax_total += line_tax

        return_id = await conn.fetchval(
            """insert into pos_returns (tenant_id, sale_id, cashier_id, reason, refund_minor, tax_minor)
               values ($1,$2,$3,$4,$5,$6) returning id""",
            auth.tenant_id, sale_id, auth.user_id, body.reason, refund, tax_total)

        items = []
        for row, qty, line_refund in lines:
            await conn.execute(
                """insert into pos_return_items (tenant_id, return_id, sale_item_id, product_id,
                                                 name, qty, line_refund_minor)
                   values ($1,$2,$3,$4,$5,$6,$7)""",
                auth.tenant_id, return_id, row["sale_item_id"], row["product_id"], row["name"], qty, line_refund)
            # Damaged goods come back to the shop but not to the shelf.
            if body.restock and row["product_id"]:
                await conn.execute("update pos_products set stock_qty = stock_qty + $1 where id=$2",
                                   qty, row["product_id"])
            items.append(ReturnItemOut(name=row["name"], qty=qty, line_refund_minor=line_refund))

        original = await conn.fetchrow(
            """select fbr_invoice_number from pos_fbr_invoices
                where sale_id=$1 and return_id is null and status='submitted'""", sale_id)
        created_at = await conn.fetchval("select created_at from pos_returns where id=$1", return_id)

    fbr_number = fbr_status = None
    if fbr_cfg and fbr_cfg["enabled"] and original and original["fbr_invoice_number"]:
        # FBR models a return as a Debit Note against the original invoice. Only
        # possible once the sale itself was filed — a return cannot reference an
        # invoice number FBR never issued.
        result = await fbr_submit.submit_return(
            auth.tenant_id, str(return_id), fbr_cfg, lines, original["fbr_invoice_number"])
        fbr_number, fbr_status = result.invoice_number, ("submitted" if result.ok else "pending")

    return ReturnOut(id=str(return_id), sale_id=sale_id, reason=body.reason, refund_minor=refund,
                     tax_minor=tax_total, created_at=created_at, items=items,
                     fbr_invoice_number=fbr_number, fbr_status=fbr_status)


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
