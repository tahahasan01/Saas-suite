"""POS — products, checkout (sales), inventory. Guarded by the 'pos' section."""
from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime, timezone
from decimal import Decimal

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status

from .. import audit, csv_io, db, fbr, fbr_submit, pricing, refs
from ..deps import AuthContext
from ..models import (
    DrawerClose,
    DrawerOpen,
    DrawerOut,
    ForecastItem,
    ForecastOut,
    ImportResult,
    ImportRowError,
    MethodTotal,
    OccasionForecast,
    PoCreate,
    PoLineOut,
    PoOut,
    PoReceive,
    PosSummary,
    ProductCreate,
    ProductOut,
    ProductUpdate,
    RestockItem,
    RefundableLine,
    ReturnCreate,
    ReturnItemOut,
    ReturnOut,
    SaleCreate,
    SaleQuote,
    SaleQuoteRequest,
    SaleLookup,
    SaleItemOut,
    SaleOut,
    SupplierCreate,
    SupplierOut,
)
from ..rbac import perm, require, scope_of
from ..scopes import where

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


# Search: name/SKU/barcode/HS code fragments. The barcode equality keeps the
# exact-scan case on its index even though the ilike also covers it.
_PRODUCT_WHERE = """(active or $1)
   and ($2::text is null
        or name ilike '%'||$2||'%' or sku ilike '%'||$2||'%'
        or barcode = $2 or barcode ilike '%'||$2||'%' or hs_code ilike '%'||$2||'%')"""


@router.get("/products", response_model=list[ProductOut])
async def list_products(response: Response, q: str | None = None, include_archived: bool = False,
                        limit: int | None = Query(None, ge=1, le=500),
                        offset: int = Query(0, ge=0),
                        auth: AuthContext = Depends(require("pos", "read"))):
    """One page of the catalog; `X-Total-Count` is how many match in all.

    Archived products stay listable behind a flag — otherwise archiving is a
    one-way trip and the catalog can never be un-done. The default page size
    (50 for a search, 200 otherwise) is what the till and pickers have always
    received; the Products page pages with limit/offset so nothing past the
    first page is unreachable. Ties on name are broken by id so pages never
    overlap or skip a row.
    """
    q = q.strip() if q else None
    q = q or None
    if limit is None:
        limit = 50 if q else 200
    async with db.tenant_conn(auth.tenant_id) as conn:
        total = await conn.fetchval(
            f"select count(*) from pos_products where {_PRODUCT_WHERE}", include_archived, q)
        rows = await conn.fetch(
            f"""select * from pos_products where {_PRODUCT_WHERE}
                order by active desc, name, id limit $3 offset $4""",
            include_archived, q, limit, offset)
    response.headers["X-Total-Count"] = str(total)
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


def _fingerprint(body: SaleCreate) -> str:
    """What the cart *was*: a replay of the same client_uuid must match it."""
    canonical = {
        "items": sorted([str(i.product_id), float(i.qty)] for i in body.items),
        "discount_minor": body.discount_minor,
        "paid_minor": body.paid_minor,
        "payment_method": body.payment_method,
    }
    if body.contact_id is not None:  # only when set, so carts recorded before 0060 replay unchanged
        canonical["contact_id"] = str(body.contact_id)
    return hashlib.sha256(json.dumps(canonical, sort_keys=True).encode()).hexdigest()


async def _replay_sale(tenant_id: str, client_uuid, fingerprint: str) -> SaleOut | None:
    """The sale already recorded for this cart, exactly as it was stored — or a
    409 if this client_uuid was recorded for a different cart."""
    async with db.tenant_conn(tenant_id) as conn:
        sale = await conn.fetchrow("select * from pos_sales where client_uuid=$1", client_uuid)
        if sale is None:
            return None
        if sale["payload_sha256"] and sale["payload_sha256"] != fingerprint:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "A sale with this cart id was already recorded with different items or amounts. "
                "Check today's sales before charging again.")
        rows = await conn.fetch(
            """select name, qty, price_minor, line_total_minor from pos_sale_items
                where sale_id=$1 order by name""", sale["id"])
        fbr_row = await conn.fetchrow(
            """select fbr_invoice_number, status from pos_fbr_invoices
                where sale_id=$1 and return_id is null""", sale["id"])
    return SaleOut(
        id=str(sale["id"]), subtotal_minor=sale["subtotal_minor"], discount_minor=sale["discount_minor"],
        total_minor=sale["total_minor"], paid_minor=sale["paid_minor"], change_minor=sale["change_minor"],
        payment_method=sale["payment_method"], item_count=sale["item_count"], created_at=sale["created_at"],
        items=[SaleItemOut(name=r["name"], qty=float(r["qty"]), price_minor=r["price_minor"],
                           line_total_minor=r["line_total_minor"]) for r in rows],
        tax_minor=sale["tax_minor"], rounding_minor=sale["rounding_minor"],
        amount_due_minor=sale["total_minor"] + sale["rounding_minor"],
        fbr_invoice_number=fbr_row["fbr_invoice_number"] if fbr_row else None,
        fbr_status=fbr_row["status"] if fbr_row else None,
        contact_id=str(sale["contact_id"]) if sale["contact_id"] else None)


@router.post("/sales", response_model=SaleOut, status_code=status.HTTP_201_CREATED)
async def checkout(body: SaleCreate, response: Response,
                   auth: AuthContext = Depends(require("pos", "write"))):
    fingerprint = _fingerprint(body)
    if body.client_uuid is not None:
        replay = await _replay_sale(auth.tenant_id, body.client_uuid, fingerprint)
        if replay is not None:
            response.status_code = status.HTTP_200_OK
            return replay
    try:
        return await _record_sale(body, auth, fingerprint)
    except asyncpg.UniqueViolationError:
        # A copy of this cart committed between our check and our insert; the
        # unique index refused the second sale, so answer with the first.
        replay = await _replay_sale(auth.tenant_id, body.client_uuid, fingerprint)
        if replay is None:
            raise
        response.status_code = status.HTTP_200_OK
        return replay


async def _price_cart(conn, tenant_id: str, items, discount_minor: int):
    """The one way a cart is priced, for a quote and for the sale itself:
    returns (lines as (product, qty, PricedLine), fbr settings, PricedSale)."""
    products = []
    for it in items:
        p = await conn.fetchrow(
            """select id, name, price_minor, hs_code, tax_rate, fbr_uom
                 from pos_products where id=$1 and active""", it.product_id)
        if p is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Product {it.product_id} not found")
        products.append((p, it.qty))

    fbr_cfg = await conn.fetchrow("select * from fbr_settings where tenant_id=$1", tenant_id)
    fbr_on = bool(fbr_cfg and fbr_cfg["enabled"])
    priced = pricing.price_sale(
        [(p["price_minor"], qty, Decimal(str(p["tax_rate"] or 0))) for p, qty in products],
        discount_minor, tax_on=fbr_on, inclusive=bool(fbr_on and fbr_cfg["prices_include_tax"]))
    return [(p, qty, pl) for (p, qty), pl in zip(products, priced.lines)], fbr_cfg, priced


async def _amount_due(conn, total_minor: int, payment_method: str) -> tuple[int, int]:
    """Cash is rounded to the tenant's unit; every other method pays exactly."""
    if payment_method != "cash":
        return total_minor, 0
    unit = await conn.fetchval(
        "select cash_rounding_minor from tenants where id = current_setting('app.tenant_id')::uuid")
    return pricing.cash_due(total_minor, unit or 0)


@router.post("/sales/quote", response_model=SaleQuote)
async def quote_sale(body: SaleQuoteRequest, auth: AuthContext = Depends(require("pos", "write"))):
    """Price a cart exactly as a sale would be priced, without recording it, so
    the till shows the server's own total (tax-exclusive prices included)."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        _, _, priced = await _price_cart(conn, auth.tenant_id, body.items, body.discount_minor)
        due, rounding = await _amount_due(conn, priced.total_minor, body.payment_method)
    return SaleQuote(subtotal_minor=priced.subtotal_minor, discount_minor=priced.discount_minor,
                     tax_minor=priced.tax_minor, total_minor=priced.total_minor,
                     rounding_minor=rounding, amount_due_minor=due)


async def _check_customer(conn, contact_id) -> None:
    """The named customer must be one of this tenant's live contacts."""
    if contact_id is None:
        return
    await refs.ensure_visible(conn, "contacts", contact_id)
    if await conn.fetchval("select archived_at is not null from contacts where id=$1", contact_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "That customer is archived")


async def _record_sale(body: SaleCreate, auth: AuthContext, fingerprint: str) -> SaleOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await _check_customer(conn, body.contact_id)
        lines, fbr_cfg, priced = await _price_cart(conn, auth.tenant_id, body.items, body.discount_minor)
        total = priced.total_minor
        due, rounding = await _amount_due(conn, total, body.payment_method)
        # 0 means the exact amount was tendered (card, wallet, bank). Anything
        # less than what's due is a short payment, never a silent zero change.
        paid = body.paid_minor or due
        if paid < due:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                f"Payment is short by Rs {(due - paid) / 100:,.2f} (due Rs {due / 100:,.2f}).")
        change = paid - due

        sale_id = await conn.fetchval(
            """insert into pos_sales (tenant_id, cashier_id, subtotal_minor, discount_minor, total_minor,
                                      paid_minor, change_minor, payment_method, item_count, tax_minor,
                                      client_uuid, payload_sha256, rounding_minor, contact_id)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id""",
            auth.tenant_id, auth.user_id, priced.subtotal_minor, priced.discount_minor, total,
            paid, change, body.payment_method, len(lines), priced.tax_minor,
            body.client_uuid, fingerprint, rounding, body.contact_id)
        fbr_on = bool(fbr_cfg and fbr_cfg["enabled"])
        inclusive = bool(fbr_on and fbr_cfg["prices_include_tax"])
        items = []
        for p, qty, pl in lines:
            # The line snapshots what FBR needs as it is right now (0034): a retry,
            # a debit note or a refund later reads these, never the product.
            await conn.execute(
                """insert into pos_sale_items (tenant_id, sale_id, product_id, name, qty, price_minor,
                                               line_total_minor, discount_minor, tax_minor, total_minor,
                                               excl_minor, hs_code, fbr_uom, tax_rate, tax_inclusive,
                                               snapshot_source)
                   values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'sale')""",
                auth.tenant_id, sale_id, p["id"], p["name"], qty, p["price_minor"],
                pl.gross_minor, pl.discount_minor, pl.tax_minor, pl.total_minor,
                pl.excl_minor, p["hs_code"] or "", p["fbr_uom"],
                # The rate that applied: none while tax is off, whatever the product says.
                (p["tax_rate"] or 0) if fbr_on else 0, inclusive)
            await conn.execute("update pos_products set stock_qty = stock_qty - $1 where id=$2", qty, p["id"])
            items.append(SaleItemOut(name=p["name"], qty=qty, price_minor=p["price_minor"],
                                     line_total_minor=pl.gross_minor))
        sale = await conn.fetchrow("select * from pos_sales where id=$1", sale_id)
        outbox_id = None
        if fbr_on:
            # Outbox row, with the frozen FBR document, in the sale's own
            # transaction: if the process dies before transmission, the worker
            # still finds this sale (P0-4, D-09).
            outbox_id = await fbr_submit.enqueue_sale(conn, auth.tenant_id, str(sale_id), fbr_cfg)

    fbr_number = fbr_status = None
    if outbox_id is not None:
        # The sale is already committed. FBR transmission happens after, and its
        # failure is recorded rather than raised: a government outage must never
        # stop a shop from selling. Anything not filed is retried by jobs.py.
        result = await fbr_submit.deliver_now(outbox_id)
        fbr_number, fbr_status = result.invoice_number, fbr_submit.status_after(result)

    return SaleOut(
        id=str(sale["id"]), subtotal_minor=sale["subtotal_minor"], discount_minor=sale["discount_minor"],
        total_minor=sale["total_minor"], paid_minor=sale["paid_minor"], change_minor=sale["change_minor"],
        payment_method=sale["payment_method"], item_count=sale["item_count"], created_at=sale["created_at"],
        items=items, tax_minor=sale["tax_minor"], rounding_minor=sale["rounding_minor"],
        amount_due_minor=sale["total_minor"] + sale["rounding_minor"], fbr_invoice_number=fbr_number, fbr_status=fbr_status,
        contact_id=str(sale["contact_id"]) if sale["contact_id"] else None)


# ── Suppliers & purchase orders ──────────────────────────────────────────────
@router.get("/suppliers", response_model=list[SupplierOut])
async def list_suppliers(auth: AuthContext = Depends(require("pos", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch("select * from pos_suppliers order by name")
    return [SupplierOut(id=str(r["id"]), name=r["name"], phone=r["phone"],
                        email=r["email"], notes=r["notes"]) for r in rows]


@router.post("/suppliers", response_model=SupplierOut, status_code=status.HTTP_201_CREATED)
async def create_supplier(body: SupplierCreate, auth: AuthContext = Depends(require("pos", "write"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        r = await conn.fetchrow(
            """insert into pos_suppliers (tenant_id, name, phone, email, notes)
               values ($1,$2,$3,$4,$5) returning *""",
            auth.tenant_id, body.name, body.phone, body.email, body.notes)
    return SupplierOut(id=str(r["id"]), name=r["name"], phone=r["phone"],
                       email=r["email"], notes=r["notes"])


async def _po_out(conn, po) -> PoOut:
    items = await conn.fetch("select * from pos_po_items where po_id=$1 order by name", po["id"])
    supplier = await conn.fetchval(
        "select name from pos_suppliers where id=$1", po["supplier_id"]) if po["supplier_id"] else None
    return PoOut(
        id=str(po["id"]), supplier_id=str(po["supplier_id"]) if po["supplier_id"] else None,
        supplier_name=supplier, status=po["status"], notes=po["notes"],
        created_at=po["created_at"], received_at=po["received_at"],
        total_cost_minor=sum(round(i["cost_minor"] * float(i["qty"])) for i in items),
        items=[PoLineOut(id=str(i["id"]), product_id=str(i["product_id"]) if i["product_id"] else None,
                         name=i["name"], qty=float(i["qty"]), cost_minor=i["cost_minor"],
                         received_qty=float(i["received_qty"])) for i in items])


@router.post("/purchase-orders", response_model=PoOut, status_code=status.HTTP_201_CREATED)
async def create_po(body: PoCreate, auth: AuthContext = Depends(require("pos", "write"))):
    """Created straight into 'ordered' — the SME phones the order in; this
    record exists so the delivery can be received against it."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "pos_suppliers", body.supplier_id)
        po = await conn.fetchrow(
            """insert into pos_purchase_orders (tenant_id, supplier_id, created_by, notes)
               values ($1,$2,$3,$4) returning *""",
            auth.tenant_id, body.supplier_id, auth.user_id, body.notes)
        for line in body.items:
            p = await conn.fetchrow(
                "select name, cost_minor from pos_products where id=$1", line.product_id)
            if p is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, f"Product {line.product_id} not found")
            await conn.execute(
                """insert into pos_po_items (tenant_id, po_id, product_id, name, qty, cost_minor)
                   values ($1,$2,$3,$4,$5,$6)""",
                auth.tenant_id, po["id"], line.product_id, p["name"], line.qty,
                # Fall back to the product's known cost so the PO total is real.
                line.cost_minor or p["cost_minor"])
        return await _po_out(conn, po)


@router.get("/purchase-orders", response_model=list[PoOut])
async def list_pos(auth: AuthContext = Depends(require("pos", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            "select * from pos_purchase_orders order by created_at desc limit 50")
        return [await _po_out(conn, r) for r in rows]


@router.post("/purchase-orders/{po_id}/receive", response_model=PoOut)
async def receive_po(po_id: str, body: PoReceive, auth: AuthContext = Depends(require("pos", "write"))):
    """Goods arrive. Stock rises here and nowhere else on the inbound side.

    Partial deliveries are the norm, so lines carry received_qty and the PO only
    flips to 'received' once every line is complete. Over-receiving is refused —
    a delivery larger than the order is a paperwork problem to resolve, not a
    number to absorb silently.
    """
    async with db.tenant_conn(auth.tenant_id) as conn:
        po = await conn.fetchrow("select * from pos_purchase_orders where id=$1", po_id)
        if po is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Purchase order not found")
        if po["status"] != "ordered":
            raise HTTPException(status.HTTP_409_CONFLICT, f"This order is {po['status']}.")

        for want in body.items:
            line = await conn.fetchrow(
                "select * from pos_po_items where id=$1 and po_id=$2", want.po_item_id, po_id)
            if line is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "That line isn't on this order")
            outstanding = float(line["qty"]) - float(line["received_qty"])
            if want.qty > outstanding:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    f"Only {outstanding:g} of {line['name']} is outstanding on this order.")
            await conn.execute(
                "update pos_po_items set received_qty = received_qty + $1 where id=$2",
                want.qty, line["id"])
            if line["product_id"]:
                # Last-cost costing: the price you actually just paid.
                await conn.execute(
                    """update pos_products
                          set stock_qty = stock_qty + $1,
                              cost_minor = case when $2 > 0 then $2 else cost_minor end,
                              updated_at = now()
                        where id=$3""",
                    want.qty, line["cost_minor"], line["product_id"])

        done = await conn.fetchval(
            "select bool_and(received_qty >= qty) from pos_po_items where po_id=$1", po_id)
        if done:
            po = await conn.fetchrow(
                "update pos_purchase_orders set status='received', received_at=now() where id=$1 returning *",
                po_id)
        return await _po_out(conn, po)


@router.post("/purchase-orders/{po_id}/cancel", response_model=PoOut)
async def cancel_po(po_id: str, auth: AuthContext = Depends(require("pos", "write"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        received = await conn.fetchval(
            "select coalesce(sum(received_qty), 0) from pos_po_items where po_id=$1", po_id)
        if received and float(received) > 0:
            raise HTTPException(status.HTTP_409_CONFLICT,
                                "Goods were already received against this order — it can't be cancelled.")
        po = await conn.fetchrow(
            "update pos_purchase_orders set status='cancelled' where id=$1 and status='ordered' returning *",
            po_id)
        if po is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No open order with that id")
        return await _po_out(conn, po)


# ── Cash drawer ──────────────────────────────────────────────────────────────
# Money that went into the till: the amount due (total + cash rounding), not
# the invoice value — otherwise every rounded sale is a false variance.
_CASH_SALES = """
select coalesce(sum(total_minor + rounding_minor), 0) as total, count(*) as n from pos_sales
 where payment_method = 'cash' and created_at >= $1 and created_at <= $2
"""
# Refunds leave the drawer only if the money went in through it: returns against
# card/wallet sales are reversed on that rail, not handed out of the till.
_CASH_REFUNDS = """
select coalesce(sum(r.refund_minor), 0) as total from pos_returns r
  join pos_sales s on s.id = r.sale_id
 where s.payment_method = 'cash' and r.created_at >= $1 and r.created_at <= $2
"""
_BY_METHOD = """
select payment_method, count(*) as n, coalesce(sum(total_minor + rounding_minor), 0) as total
  from pos_sales where created_at >= $1 and created_at <= $2
 group by payment_method order by total desc
"""


async def _drawer_out(conn, row) -> DrawerOut:
    window_end = row["closed_at"] or datetime.now(timezone.utc)
    cash = await conn.fetchrow(_CASH_SALES, row["opened_at"], window_end)
    refunds = await conn.fetchval(_CASH_REFUNDS, row["opened_at"], window_end)
    by_method = await conn.fetch(_BY_METHOD, row["opened_at"], window_end)
    # Frozen at close; live while open.
    expected = row["expected_minor"] if row["expected_minor"] is not None else (
        row["opening_float_minor"] + cash["total"] - refunds)
    opener = await conn.fetchval("select name from users where id=$1", row["opened_by"])
    return DrawerOut(
        id=str(row["id"]), status=row["status"], opened_at=row["opened_at"], opened_by=opener,
        opening_float_minor=row["opening_float_minor"], expected_minor=expected,
        cash_sales_minor=cash["total"], cash_refunds_minor=refunds,
        sales_by_method=[MethodTotal(payment_method=r["payment_method"], count=r["n"],
                                     total_minor=r["total"]) for r in by_method],
        closed_at=row["closed_at"], counted_minor=row["counted_minor"],
        variance_minor=(row["counted_minor"] - expected) if row["counted_minor"] is not None else None,
        notes=row["notes"])


@router.post("/drawer/open", response_model=DrawerOut, status_code=status.HTTP_201_CREATED)
async def open_drawer(body: DrawerOpen, auth: AuthContext = Depends(require("pos", "write"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        try:
            row = await conn.fetchrow(
                """insert into pos_drawers (tenant_id, opened_by, opening_float_minor)
                   values ($1,$2,$3) returning *""",
                auth.tenant_id, auth.user_id, body.opening_float_minor)
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT,
                                "A drawer is already open — close it before starting a new one.")
        return await _drawer_out(conn, row)


@router.get("/drawer/current", response_model=DrawerOut | None)
async def current_drawer(auth: AuthContext = Depends(require("pos", "read"))):
    # None when no shift is open: that's the till's normal state between
    # shifts, not an error.
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow("select * from pos_drawers where status='open'")
        return None if row is None else await _drawer_out(conn, row)


@router.post("/drawer/close", response_model=DrawerOut)
async def close_drawer(body: DrawerClose, auth: AuthContext = Depends(require("pos", "write"))):
    """Freezes the expected figure at close: the shift's reconciliation is
    evidence, and a later sale edit must not silently rewrite a signed-off
    variance."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow("select * from pos_drawers where status='open'")
        if row is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "No drawer is open.")
        now = datetime.now(timezone.utc)
        cash = await conn.fetchrow(_CASH_SALES, row["opened_at"], now)
        refunds = await conn.fetchval(_CASH_REFUNDS, row["opened_at"], now)
        expected = row["opening_float_minor"] + cash["total"] - refunds
        closed = await conn.fetchrow(
            """update pos_drawers
                  set status='closed', closed_by=$2, closed_at=$3,
                      expected_minor=$4, counted_minor=$5, notes=$6
                where id=$1 returning *""",
            row["id"], auth.user_id, now, expected, body.counted_minor, body.notes)
        return await _drawer_out(conn, closed)


@router.get("/drawer/history", response_model=list[DrawerOut])
async def drawer_history(auth: AuthContext = Depends(require("pos", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            "select * from pos_drawers where status='closed' order by closed_at desc limit 30")
        return [await _drawer_out(conn, r) for r in rows]


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
        await audit.event(conn, "export.products", "pos_products", data={"rows": len(rows)})
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
       i.total_minor,
       coalesce((select sum(r.qty) from pos_return_items r where r.sale_item_id = i.id), 0) as qty_returned,
       coalesce((select sum(r.line_refund_minor) from pos_return_items r
                  where r.sale_item_id = i.id), 0) as refunded_minor,
       -- The line's sale-time snapshot (0034), carried through for the debit
       -- note and the refund's tax — never the product as edited since.
       i.hs_code, i.tax_rate, i.fbr_uom
  from pos_sale_items i
 where i.sale_id = $1
 order by i.name
"""


@router.get("/sales/{sale_id}", response_model=SaleLookup)
async def get_sale(sale_id: str, auth: AuthContext = Depends(perm("pos.sale.read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        scope = await scope_of(conn, auth, "pos.sale.read")   # own = the cashier's own sales (D-04)
        sale = await conn.fetchrow(
            f"select * from pos_sales s where s.id=$1 and {where('pos.sale', scope, 's')}", sale_id)
        if sale is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Sale not found")
        lines = await conn.fetch(_RETURNABLE, sale_id)
        fbr_row = await conn.fetchrow(
            "select fbr_invoice_number, status from pos_fbr_invoices where sale_id=$1 and return_id is null",
            sale_id)
        already = await conn.fetchval(
            "select coalesce(sum(refund_minor), 0) from pos_returns where sale_id=$1", sale_id)
    returnable = [RefundableLine(
        sale_item_id=str(r["sale_item_id"]),
        product_id=str(r["product_id"]) if r["product_id"] else None,
        name=r["name"], qty_sold=float(r["qty_sold"]), qty_returned=float(r["qty_returned"]),
        qty_returnable=float(r["qty_sold"]) - float(r["qty_returned"]), price_minor=r["price_minor"],
        paid_minor=r["total_minor"], refunded_minor=r["refunded_minor"],
    ) for r in lines]
    return SaleLookup(
        id=str(sale["id"]), subtotal_minor=sale["subtotal_minor"], discount_minor=sale["discount_minor"],
        total_minor=sale["total_minor"], paid_minor=sale["paid_minor"], change_minor=sale["change_minor"],
        payment_method=sale["payment_method"], item_count=sale["item_count"], created_at=sale["created_at"],
        tax_minor=sale["tax_minor"], rounding_minor=sale["rounding_minor"],
        amount_due_minor=sale["total_minor"] + sale["rounding_minor"],
        fbr_invoice_number=fbr_row["fbr_invoice_number"] if fbr_row else None,
        fbr_status=fbr_row["status"] if fbr_row else None,
        contact_id=str(sale["contact_id"]) if sale["contact_id"] else None,
        items=[SaleItemOut(name=r["name"], qty=float(r["qty_sold"]), price_minor=r["price_minor"],
                           line_total_minor=round(r["price_minor"] * float(r["qty_sold"])))
               for r in lines],
        returnable=returnable,
        refundable_minor=max(0, sale["total_minor"] + sale["rounding_minor"] - already))


@router.post("/sales/{sale_id}/returns", response_model=ReturnOut, status_code=status.HTTP_201_CREATED)
async def create_return(sale_id: str, body: ReturnCreate,
                        auth: AuthContext = Depends(perm("pos.sale.refund"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        # Lock the sale: two returns of its last unit must be checked one after
        # the other, or both see it as still returnable. Out of scope = 404.
        scope = await scope_of(conn, auth, "pos.sale.refund")
        sale = await conn.fetchrow(
            f"select total_minor, rounding_minor from pos_sales s where s.id=$1 and {where('pos.sale', scope, 's')} "
            "for update", sale_id)
        if sale is None:
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
            # The customer's share of what they paid for the line (after discount,
            # with tax) — never the list price.
            line_refund = pricing.refund_for(
                row["total_minor"], float(row["qty_sold"]), row["refunded_minor"],
                float(row["qty_returned"]), want.qty)
            refund += line_refund
            lines.append((row, want.qty, line_refund))

        # Line shares come from the invoice value; with cash rounding the
        # customer may have paid a little less. Never refund more, in total,
        # than was actually paid for the sale.
        already = await conn.fetchval(
            "select coalesce(sum(refund_minor), 0) from pos_returns where sale_id=$1", sale_id)
        refundable = max(0, sale["total_minor"] + sale["rounding_minor"] - already)
        if refundable == 0:
            raise HTTPException(status.HTTP_409_CONFLICT, "Everything paid for this sale has been refunded.")
        excess = refund - refundable
        # Take any excess off the lines from the last one back, never pushing a
        # line below zero (one small line can be smaller than the excess).
        for i in range(len(lines) - 1, -1, -1):
            if excess <= 0:
                break
            row, qty, amount = lines[i]
            cut = min(excess, amount)
            lines[i] = (row, qty, amount - cut)
            excess -= cut
            refund -= cut

        fbr_cfg = await conn.fetchrow("select * from fbr_settings where tenant_id=$1", auth.tenant_id)
        if fbr_cfg and fbr_cfg["enabled"]:
            for row, _qty, line_refund in lines:
                # A refund is an amount the customer paid, so tax is inside it —
                # at the rate the sale charged, not the product's rate today.
                _, line_tax = fbr.split_tax(line_refund, Decimal(str(row["tax_rate"])), True)
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

        outbox_id = None
        if fbr_cfg and fbr_cfg["enabled"]:
            # Queued even when the sale isn't filed yet: the outbox row depends
            # on the sale's, and the worker files the debit note once the sale
            # has an FBR number to reference.
            outbox_id = await fbr_submit.enqueue_return(
                conn, auth.tenant_id, sale_id, str(return_id), fbr_cfg)
        created_at = await conn.fetchval("select created_at from pos_returns where id=$1", return_id)

    fbr_number = fbr_status = None
    if outbox_id is not None:
        # FBR models a return as a Debit Note against the original invoice; the
        # fast path only takes the row if the sale is already filed.
        result = await fbr_submit.deliver_now(outbox_id)
        fbr_number, fbr_status = result.invoice_number, fbr_submit.status_after(result)

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
