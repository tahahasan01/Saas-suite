"""POS — products, checkout (sales), inventory. Guarded by the 'pos' section."""
from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status

from .. import (audit, cashiers, catalog, csv_io, db, fbr, fbr_submit, field_guards, khata, pins, pos_sessions, pricing, rbac,
               refs, sequences)
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
    PaymentLine,
    PoCreate,
    PoLineOut,
    PoOut,
    PoReceive,
    PosSummary,
    ProductCreate,
    ProductOut,
    ProductUpdate,
    RefundableLine,
    RestockItem,
    ReturnCreate,
    ReturnItemOut,
    ReturnOut,
    SaleCreate,
    SaleItemOut,
    SaleLookup,
    SaleOut,
    SaleQuote,
    SaleQuoteRequest,
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


def _product(r: asyncpg.Record, held: dict[str, str], scan_qty: float | None = None) -> ProductOut:
    """A product as the caller may see it: cost only with products.cost.read."""
    out = field_guards.redact("products.product", {
        "id": str(r["id"]), "name": r["name"], "sku": r["sku"], "barcode": r["barcode"], "category": r["category"],
        "unit": r["unit"], "price_minor": r["price_minor"], "cost_minor": r["cost_minor"],
        "stock_qty": float(r["stock_qty"]), "low_stock_at": float(r["low_stock_at"]), "active": r["active"],
        "hs_code": r["hs_code"], "tax_rate": float(r["tax_rate"]), "fbr_uom": r["fbr_uom"],
        "category_id": str(r["category_id"]) if r["category_id"] else None, "track_stock": r["track_stock"],
        "group_id": str(r["group_id"]) if r["group_id"] else None, "attributes": dict(r["attributes"] or {}),
    }, held)
    return ProductOut(**{"cost_minor": None, **out}, scan_qty=scan_qty)


async def _held(conn, auth: AuthContext) -> dict[str, str]:
    return dict(await rbac.effective_permissions(conn, auth.tenant_id, auth.role_id, auth.user_id))


# Search: name/SKU/barcode/HS code fragments. The barcode equality keeps the
# exact-scan case on its index even though the ilike also covers it.
_PRODUCT_WHERE = """(active or $1)
   and ($2::text is null
        or name ilike '%'||$2||'%' or sku ilike '%'||$2||'%'
        or barcode = $2 or barcode ilike '%'||$2||'%' or hs_code ilike '%'||$2||'%')"""


@router.get("/products", response_model=list[ProductOut])
async def list_products(response: Response, q: str | None = None, include_archived: bool = False,
                        category_id: str | None = None,
                        limit: int | None = Query(None, ge=1, le=500),
                        offset: int = Query(0, ge=0),
                        auth: AuthContext = Depends(perm("products.product.read"))):
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
            f"""select count(*) from pos_products
                 where {_PRODUCT_WHERE} and ($3::uuid is null or category_id = $3)""",
            include_archived, q, category_id)
        rows = await conn.fetch(
            f"""select * from pos_products where {_PRODUCT_WHERE} and ($5::uuid is null or category_id = $5)
                order by active desc, name, id limit $3 offset $4""",
            include_archived, q, limit, offset, category_id)
        held = await _held(conn, auth)
    response.headers["X-Total-Count"] = str(total)
    return [_product(r, held) for r in rows]


@router.get("/products/lookup", response_model=ProductOut)
async def lookup(barcode: str, auth: AuthContext = Depends(perm("products.product.read"))):
    """What the scanner read: the product and how much one scan counts as (a
    carton barcode, or a weight/price label from a scale)."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        found = await catalog.scan(conn, barcode)
        held = await _held(conn, auth)
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No product with that barcode")
    row, qty = found
    return _product(row, held, scan_qty=float(qty))


@router.post("/products", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def create_product(body: ProductCreate, auth: AuthContext = Depends(perm("products.product.create"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        held = await _held(conn, auth)
        if body.cost_minor:
            field_guards.check_write("products.product", ["cost_minor"], held)
        category_id, label = await catalog.category_for(conn, auth.tenant_id, category_id=body.category_id,
                                                        name=body.category)
        await catalog.ensure_group(conn, body.group_id)
        row = await conn.fetchrow(
            """insert into pos_products (tenant_id, name, sku, barcode, category, unit, price_minor,
                                         cost_minor, stock_qty, low_stock_at, hs_code, tax_rate, fbr_uom,
                                         category_id, track_stock, group_id, attributes)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning *""",
            auth.tenant_id, body.name, body.sku, body.barcode, label, body.unit,
            body.price_minor, body.cost_minor, body.stock_qty if body.track_stock else 0, body.low_stock_at,
            body.hs_code, body.tax_rate, body.fbr_uom, category_id, body.track_stock, body.group_id,
            body.attributes)
        await catalog.opening(conn, auth.tenant_id, row["id"], body.stock_qty, auth.user_id)
    return _product(row, held)


@router.patch("/products/{product_id}", response_model=ProductOut)
async def update_product(product_id: str, body: ProductUpdate,
                         auth: AuthContext = Depends(perm("products.product.update"))):
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nothing to update")
    async with db.tenant_conn(auth.tenant_id) as conn:
        held = await _held(conn, auth)
        field_guards.check_write("products.product", fields, held)
        if "category_id" in fields or "category" in fields:
            fields["category_id"], fields["category"] = await catalog.category_for(
                conn, auth.tenant_id, category_id=fields.get("category_id"), name=fields.get("category"))
        if "group_id" in fields:
            await catalog.ensure_group(conn, fields["group_id"])
        # Setting stock on hand is a count: it goes through the ledger and
        # needs the same key as any other adjustment.
        counted = fields.pop("stock_qty", None)
        if counted is not None and "products.stock.adjust" not in held:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Requires products.stock.adjust to change stock")
        if fields:
            cols = ", ".join(f"{k}=${i+2}" for i, k in enumerate(fields))
            row = await conn.fetchrow(
                f"update pos_products set {cols}, updated_at=now() where id=$1 returning *", product_id,
                *fields.values())
        else:
            row = await conn.fetchrow("select * from pos_products where id=$1", product_id)
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
        if counted is not None and row["track_stock"]:
            await catalog.move(conn, auth.tenant_id, product_id, Decimal(str(counted)) - Decimal(row["stock_qty"]),
                               "count", note="Stock set on the product", user_id=auth.user_id)
            row = await conn.fetchrow("select * from pos_products where id=$1", product_id)
    return _product(row, held)


def _fingerprint(body: SaleCreate) -> str:
    """What the cart *was*: a replay of the same client_uuid must match it."""
    canonical: dict[str, Any] = {
        "items": sorted([str(i.product_id), float(i.qty)] for i in body.items),
        **({"lines": sorted([str(i.product_id), float(i.qty), i.discount_minor, i.discount_pct, i.price_minor]
                            for i in body.items)}
           if any(i.discount_minor or i.discount_pct or i.price_minor is not None for i in body.items) else {}),
        "discount_minor": body.discount_minor,
        "paid_minor": body.paid_minor,
        "payment_method": body.payment_method,
    }
    if body.contact_id is not None:  # only when set, so carts recorded before 0060 replay unchanged
        canonical["contact_id"] = str(body.contact_id)
    if body.payments:                # likewise for split tender (0076)
        canonical["payments"] = sorted([p.method, p.amount_minor] for p in body.payments)
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
        pays = await _payments(conn, sale["id"])
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
        contact_id=str(sale["contact_id"]) if sale["contact_id"] else None,
        session_id=str(sale["session_id"]) if sale["session_id"] else None, payments=pays,
        receipt_no=sale["receipt_no"], status=sale["status"], void_reason=sale["void_reason"])


async def _payments(conn, sale_id) -> list[PaymentLine]:
    return [PaymentLine(method=r["method"], amount_minor=r["amount_minor"], tendered_minor=r["tendered_minor"],
                        change_minor=r["change_minor"], reference=r["reference"])
            for r in await conn.fetch("select * from pos_payments where sale_id=$1 order by method = 'cash', method",
                                      sale_id)]


@router.post("/sales", response_model=SaleOut, status_code=status.HTTP_201_CREATED)
async def checkout(body: SaleCreate, response: Response,
                   x_cashier_token: str | None = Header(default=None, alias="X-Cashier-Token"),
                   auth: AuthContext = Depends(perm("pos.sale.create"))):
    fingerprint = _fingerprint(body)
    if body.client_uuid is not None:
        replay = await _replay_sale(auth.tenant_id, body.client_uuid, fingerprint)
        if replay is not None:
            response.status_code = status.HTTP_200_OK
            return replay
    try:
        return await _record_sale(body, auth, fingerprint, x_cashier_token)
    except asyncpg.UniqueViolationError:
        # A copy of this cart committed between our check and our insert; the
        # unique index refused the second sale, so answer with the first.
        replay = await _replay_sale(auth.tenant_id, body.client_uuid, fingerprint)
        if replay is None:
            raise
        response.status_code = status.HTTP_200_OK
        return replay


async def _price_cart(conn, tenant_id: str, items, discount_minor: int, archived_ok: bool = False):
    """The one way a cart is priced, for a quote and for the sale itself:
    returns (lines as (product, qty, PricedLine, unit price), fbr settings,
    PricedSale). A line may override the unit price and carry a discount
    (an amount or a percentage of the line)."""
    products = []
    for it in items:
        p = await conn.fetchrow(
            """select id, name, price_minor, hs_code, tax_rate, fbr_uom, active
                 from pos_products where id=$1 and (active or $2)""", it.product_id, archived_ok)
        if p is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Product {it.product_id} not found")
        unit = p["price_minor"] if getattr(it, "price_minor", None) is None else it.price_minor
        products.append((p, it.qty, unit))

    discounts = []
    for (p, qty, unit), it in zip(products, items):
        gross = pricing.round_half_up(Decimal(unit) * Decimal(str(qty)))
        d = getattr(it, "discount_minor", None) or 0
        if getattr(it, "discount_pct", None):
            d = pricing.round_half_up(Decimal(gross) * Decimal(str(it.discount_pct)) / 100)
        if d > gross:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                f"The discount on {p['name']} is more than the line")
        discounts.append(d)

    fbr_cfg = await conn.fetchrow("select * from fbr_settings where tenant_id=$1", tenant_id)
    fbr_on = bool(fbr_cfg and fbr_cfg["enabled"])
    priced = pricing.price_sale(
        [(unit, qty, Decimal(str(p["tax_rate"] or 0))) for p, qty, unit in products],
        discount_minor, tax_on=fbr_on, inclusive=bool(fbr_on and fbr_cfg["prices_include_tax"]),
        line_discounts=discounts)
    return [(p, qty, pl, unit) for (p, qty, unit), pl in zip(products, priced.lines)], fbr_cfg, priced


async def _approve_lines(conn, auth: AuthContext, body: SaleCreate, lines) -> str | None:
    """A line discount needs pos.sale.discount, a price override
    pos.price.override: the cashier's own, or a manager's PIN. Returns who
    approved (None when nothing needed it)."""
    # A discount on the whole cart is a discount like a line's (security review).
    needs = {"pos.sale.discount"} if body.discount_minor > 0 else set()
    for it, (p, _qty, _pl, unit) in zip(body.items, lines):
        if it.discount_minor or it.discount_pct:
            needs.add("pos.sale.discount")
        if it.price_minor is not None and unit != p["price_minor"]:
            needs.add("pos.price.override")
    if not needs:
        return None
    held = await rbac.effective_permissions(conn, auth.tenant_id, auth.role_id, auth.user_id)
    if needs <= set(held):
        return auth.user_id
    if body.approver_id is None or not body.approver_pin:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "A discount or price change needs a manager to approve with their PIN")
    mgr = await conn.fetchrow("select id, role_id, pos_pin_hash from users where id = $1 and status = 'active'",
                              body.approver_id)
    mgr_held = await rbac.effective_permissions(conn, auth.tenant_id, mgr["role_id"], str(mgr["id"])) if mgr else {}
    if mgr is None or not needs <= set(mgr_held):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "That person can't approve this")
    key = f"user:{mgr['id']}"
    if await pins.daily_off(key) or await pins.check_approval(key, f"user:{auth.user_id}", mgr["pos_pin_hash"],
                                                              body.approver_pin):
        raise pins.switched_off()
    return str(mgr["id"])


async def _amount_due(conn, total_minor: int, payment_method: str, register_id=None) -> tuple[int, int]:
    """Cash is rounded to the register's unit (else the company's); every
    other method pays exactly."""
    if payment_method != "cash":
        return total_minor, 0
    reg = await pos_sessions.register(conn, register_id)
    return pricing.cash_due(total_minor, await pos_sessions.rounding_unit(conn, reg))


@router.post("/sales/quote", response_model=SaleQuote)
async def quote_sale(body: SaleQuoteRequest, auth: AuthContext = Depends(perm("pos.sale.create"))):
    """Price a cart exactly as a sale would be priced, without recording it, so
    the till shows the server's own total (tax-exclusive prices included)."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        _, _, priced = await _price_cart(conn, auth.tenant_id, body.items, body.discount_minor)
        due, rounding = await _amount_due(conn, priced.total_minor, body.payment_method, body.register_id)
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


@dataclass
class Offline:
    """An offline till's sale (3D): it already happened and was paid, so
    what the online path refuses is recorded and flagged instead (D-23)."""
    created_at: datetime
    offline_ref: str
    client_total_minor: int
    reasons: list[str] = field(default_factory=list)


# How far a till's clock may drift before its sale time isn't trusted.
_SKEW_AHEAD = timedelta(minutes=10)
_SKEW_BEHIND = timedelta(days=30)


async def _flag(off: Offline | None, reason: str, step: Any) -> Any:
    """Online: the step's refusal stands. Offline: note why and go on (None)."""
    try:
        return await step() if callable(step) else step
    except HTTPException:
        if off is None:
            raise
        off.reasons.append(reason)
        return None


async def _record_sale(body: SaleCreate, auth: AuthContext, fingerprint: str,
                       cashier_token: str | None = None, offline: Offline | None = None) -> SaleOut:
    off = offline
    async with db.tenant_conn(auth.tenant_id) as conn:
        await _check_customer(conn, body.contact_id)
        lines, fbr_cfg, priced = await _price_cart(conn, auth.tenant_id, body.items, body.discount_minor,
                                                   archived_ok=off is not None)
        if off and any(not p["active"] for p, *_ in lines):
            off.reasons.append("archived_product")
        approved_by = await _flag(off, "unapproved_discount", lambda: _approve_lines(conn, auth, body, lines))
        total = priced.total_minor
        reg = await pos_sessions.register(conn, body.register_id)
        if not reg["active"]:
            if off is None:
                raise HTTPException(status.HTTP_409_CONFLICT, "This register is switched off")
            off.reasons.append("register_off")
        unit = await pos_sessions.rounding_unit(conn, reg)
        # 0 means the exact amount was tendered (card, wallet, bank). Anything
        # less than what's due is a short payment, never a silent zero change.
        try:
            plan = pos_sessions.tenders(total, unit, body.payments, body.payment_method, body.paid_minor,
                                        list(reg["payment_methods"]))
        except HTTPException:
            if off is None:
                raise
            # Taken offline for less than the server's price: recorded as paid
            # in full by its first method, and the shortfall goes to review.
            off.reasons.append("underpaid")
            method = body.payments[0].method if body.payments else body.payment_method
            plan = pos_sessions.tenders(total, unit, None, method, 0, None)
        if off and abs(off.client_total_minor - (plan.paid_minor - plan.change_minor)) > len(lines):
            off.reasons.append("price_mismatch")   # 1 paisa a line of tolerance (St01 risk 3)
        sold_at: datetime | None = None
        if off:
            now = datetime.now(timezone.utc)
            sold_at = off.created_at if now - _SKEW_BEHIND <= off.created_at <= now + _SKEW_AHEAD else now
            if sold_at is not off.created_at:
                off.reasons.append("clock_skew")
        if any(t.method == "khata" for t in plan.tenders) and body.contact_id is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Khata needs a customer: add who is buying")
        if body.device_id is not None and not await conn.fetchval(
                "select 1 from pos_devices where id=$1 and register_id=$2", body.device_id, reg["id"]):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Device not found on this register")
        if off is None:
            session_id = await pos_sessions.open_session_id(conn, reg["id"])
        else:
            # The session that was open when it sold; one closed since still
            # takes it, as late-synced on its Z-report.
            s = await conn.fetchrow(
                """select id, status from pos_sessions where register_id = $1 and opened_at <= $2
                     and (closed_at is null or closed_at >= $2) order by opened_at desc limit 1""", reg["id"], sold_at)
            session_id = s["id"] if s else None
            if s and s["status"] != "open":
                off.reasons.append("session_closed")
        # The cashier signed in with their PIN (pos_hrms): their name on the sale.
        employee_id = await _flag(off, "cashier_signed_out", lambda: cashiers.employee_for(conn, cashier_token))

        sale_id = await conn.fetchval(
            """insert into pos_sales (tenant_id, cashier_id, subtotal_minor, discount_minor, total_minor,
                                      paid_minor, change_minor, payment_method, item_count, tax_minor,
                                      client_uuid, payload_sha256, rounding_minor, contact_id,
                                      session_id, register_id, device_id, employee_id,
                                      created_at, offline_ref, client_total_minor)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
                       coalesce($19, now()),$20,$21) returning id""",
            auth.tenant_id, auth.user_id, priced.subtotal_minor, priced.discount_minor, total,
            plan.paid_minor, plan.change_minor, plan.payment_method, len(lines), priced.tax_minor,
            body.client_uuid, fingerprint, plan.rounding_minor, body.contact_id, session_id, reg["id"],
            body.device_id, employee_id, sold_at, off.offline_ref if off else None,
            off.client_total_minor if off else None)
        await pos_sessions.record_tenders(conn, auth.tenant_id, sale_id, session_id, plan, employee_id)
        # The khata part goes on the customer's account, in this transaction.
        on_credit = sum(t.amount_minor for t in plan.tenders if t.method == "khata")
        if on_credit:
            over = await khata.post_sale(conn, auth.tenant_id, body.contact_id, sale_id, on_credit, auth.user_id,
                                         over_limit_ok=off is not None)
            if over and off:
                off.reasons.append("over_credit_limit")
        fbr_on = bool(fbr_cfg and fbr_cfg["enabled"])
        inclusive = bool(fbr_on and fbr_cfg["prices_include_tax"])
        items = []
        for (p, qty, pl, unit), it in zip(lines, body.items):
            changed = bool(it.discount_minor or it.discount_pct) or unit != p["price_minor"]
            # The line snapshots what FBR needs as it is right now (0034): a retry,
            # a debit note or a refund later reads these, never the product.
            await conn.execute(
                """insert into pos_sale_items (tenant_id, sale_id, product_id, name, qty, price_minor,
                                               line_total_minor, discount_minor, tax_minor, total_minor,
                                               excl_minor, hs_code, fbr_uom, tax_rate, tax_inclusive,
                                               snapshot_source, list_price_minor, approved_by)
                   values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'sale',$16,$17)""",
                auth.tenant_id, sale_id, p["id"], p["name"], qty, unit,
                pl.gross_minor, pl.discount_minor, pl.tax_minor, pl.total_minor,
                pl.excl_minor, p["hs_code"] or "", p["fbr_uom"],
                # The rate that applied: none while tax is off, whatever the product says.
                (p["tax_rate"] or 0) if fbr_on else 0, inclusive,
                p["price_minor"], approved_by if changed else None)
            # Offline overselling is flagged, not blocked: the goods are gone (M10).
            after = await catalog.move(conn, auth.tenant_id, p["id"], -Decimal(str(qty)), "sale", ref_id=sale_id,
                                       user_id=auth.user_id, allow_negative=True if off else None)
            if off and after is not None and after < 0 and "oversold" not in off.reasons:
                off.reasons.append("oversold")
            items.append(SaleItemOut(name=p["name"], qty=qty, price_minor=unit,
                                     line_total_minor=pl.gross_minor))
        sale = await conn.fetchrow("select * from pos_sales where id=$1", sale_id)
        pays = await _payments(conn, sale_id)
        outbox_id = None
        if fbr_on:
            # Outbox row, with the frozen FBR document, in the sale's own
            # transaction: if the process dies before transmission, the worker
            # still finds this sale (P0-4, D-09).
            outbox_id = await fbr_submit.enqueue_sale(conn, auth.tenant_id, str(sale_id), fbr_cfg)
        # The receipt number is the transaction's last step (D-06): a refused
        # sale never takes one. An offline sale keeps the number its paper
        # receipt already shows (<REG>-<DEV>-NNNNNN).
        if off:
            await conn.execute(
                """update pos_sales set receipt_no = $2, needs_review = $3, review_reasons = $4 where id = $1""",
                sale_id, off.offline_ref, bool(off.reasons), off.reasons)
        else:
            got = await sequences.next_number(conn, "pos.receipt", register_id=str(reg["id"]),
                                              register_code=reg["code"])
            await conn.execute("update pos_sales set receipt_no = $2 where id = $1", sale_id, got.number)
        sale = await conn.fetchrow("select * from pos_sales where id=$1", sale_id)

    fbr_number = fbr_status = None
    # A synced batch leaves FBR to the outbox worker: the till shows "FBR pending".
    if outbox_id is not None and off is None:
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
        contact_id=str(sale["contact_id"]) if sale["contact_id"] else None,
        session_id=str(sale["session_id"]) if sale["session_id"] else None, payments=pays,
        receipt_no=sale["receipt_no"], status=sale["status"], void_reason=sale["void_reason"])


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
                    """update pos_products set cost_minor = case when $1 > 0 then $1 else cost_minor end,
                                              updated_at = now()
                        where id=$2""",
                    line["cost_minor"], line["product_id"])
                await catalog.move(conn, auth.tenant_id, line["product_id"], Decimal(str(want.qty)), "purchase",
                                   ref_id=po_id, user_id=auth.user_id)

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
# ── The original cash-drawer API, over the default register (0076) ────────
async def _drawer_out(conn, row) -> DrawerOut:
    out = await pos_sessions.session_out(conn, row)
    cash = next((m for m in out["methods"] if m["method"] == "cash"),
                {"taken_minor": 0, "refunds_minor": 0, "expected_minor": row["opening_float_minor"],
                 "counted_minor": None, "variance_minor": None})
    return DrawerOut(
        id=out["id"], status=out["status"], opened_at=out["opened_at"], opened_by=out["opened_by"],
        opening_float_minor=out["opening_float_minor"], expected_minor=cash["expected_minor"],
        cash_sales_minor=cash["taken_minor"], cash_refunds_minor=cash["refunds_minor"],
        sales_by_method=[MethodTotal(payment_method=m["method"],
                                     count=await conn.fetchval(
                                         "select count(*) from pos_payments where session_id=$1 and method=$2",
                                         row["id"], m["method"]),
                                     total_minor=m["taken_minor"]) for m in out["methods"] if m["taken_minor"]],
        closed_at=out["closed_at"], counted_minor=cash["counted_minor"], variance_minor=cash["variance_minor"],
        notes=out["notes"])


@router.post("/drawer/open", response_model=DrawerOut, status_code=status.HTTP_201_CREATED)
async def open_drawer(body: DrawerOpen, auth: AuthContext = Depends(perm("pos.session.open"))):
    from .pos_registers import open_session

    async with db.tenant_conn(auth.tenant_id) as conn:
        try:
            row = await open_session(conn, auth, None, body.opening_float_minor)
        except HTTPException as e:
            if e.status_code == status.HTTP_409_CONFLICT:
                raise HTTPException(status.HTTP_409_CONFLICT,
                                    "A drawer is already open — close it before starting a new one.") from e
            raise
        return await _drawer_out(conn, row)


@router.get("/drawer/current", response_model=DrawerOut | None)
async def current_drawer(auth: AuthContext = Depends(perm("pos.session.read"))):
    # None when no shift is open: that's the till's normal state between
    # shifts, not an error.
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow(
            """select s.* from pos_sessions s join pos_registers r on r.id = s.register_id
                where r.is_default and s.status = 'open'""")
        return None if row is None else await _drawer_out(conn, row)


@router.post("/drawer/close", response_model=DrawerOut)
async def close_drawer(body: DrawerClose, auth: AuthContext = Depends(perm("pos.session.close"))):
    """Counts the cash only; the register's other methods count as expected.
    Freezes the figures at close (pos_sessions.close)."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow(
            """select s.* from pos_sessions s join pos_registers r on r.id = s.register_id
                where r.is_default and s.status = 'open'""")
        if row is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "No drawer is open.")
        figures = await pos_sessions.live_figures(conn, row)
        counted = {m: f["expected"] for m, f in figures.items() if m != "cash"}
        counted["cash"] = body.counted_minor
        closed, _ = await pos_sessions.close(conn, auth, str(row["id"]), counted, body.notes, None, None, None)
        return await _drawer_out(conn, closed)


@router.get("/drawer/history", response_model=list[DrawerOut])
async def drawer_history(auth: AuthContext = Depends(perm("pos.session.read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            """select s.* from pos_sessions s join pos_registers r on r.id = s.register_id
                where r.is_default and s.status = 'closed' order by s.closed_at desc limit 30""")
        return [await _drawer_out(conn, r) for r in rows]


# ── CSV import / export ─────────────────────────────────────────────────────
@router.post("/products/import", response_model=ImportResult)
async def import_products(request: Request, skip_duplicates: bool = True,
                          auth: AuthContext = Depends(perm("products.product.import"))) -> ImportResult:
    """Bulk-load the catalog from CSV. A shop's stock list almost always already
    exists in Excel — retyping 500 SKUs by hand is how trials die."""
    rows = csv_io.read_rows(await request.body(), csv_io.PRODUCT_HEADERS)
    if any((r.get("cost") or "").strip() for r in rows):
        # The cost column is a guarded field like any other write of it.
        async with db.tenant_conn(auth.tenant_id) as conn:
            field_guards.check_write("products.product", ["cost_minor"], await _held(conn, auth))

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
            category_id, label = await catalog.category_for(conn, auth.tenant_id, name=row.get("category", ""))
            stock = csv_io.parse_number(row.get("stock", ""))
            pid = await conn.fetchval(
                """insert into pos_products (tenant_id, name, sku, barcode, category, price_minor,
                                             cost_minor, stock_qty, hs_code, tax_rate, category_id)
                   values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id""",
                auth.tenant_id, name, sku, barcode, label,
                csv_io.parse_money_minor(row.get("price", "")),
                csv_io.parse_money_minor(row.get("cost", "")),
                stock, row.get("hs_code", ""), tax_rate, category_id)
            await catalog.opening(conn, auth.tenant_id, pid, stock, auth.user_id)
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
        pays = await _payments(conn, sale_id)
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
        session_id=str(sale["session_id"]) if sale["session_id"] else None,
        payments=pays,
        receipt_no=sale["receipt_no"], status=sale["status"], void_reason=sale["void_reason"],
        items=[SaleItemOut(name=r["name"], qty=float(r["qty_sold"]), price_minor=r["price_minor"],
                           line_total_minor=round(r["price_minor"] * float(r["qty_sold"])))
               for r in lines],
        returnable=returnable,
        refundable_minor=max(0, sale["total_minor"] + sale["rounding_minor"] - already))


@router.post("/sales/{sale_id}/returns", response_model=ReturnOut, status_code=status.HTTP_201_CREATED)
async def create_return(sale_id: str, body: ReturnCreate,
                        auth: AuthContext = Depends(perm("pos.sale.refund"))):
    return await do_return(sale_id, body, auth, "pos.sale.refund")


async def do_return(sale_id: str, body: ReturnCreate, auth: AuthContext, key: str,
                    void_reason: str | None = None) -> ReturnOut:
    """A return (or, with `void_reason`, a void: a full return that marks the
    sale void) in one transaction."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        # Lock the sale: two returns of its last unit must be checked one after
        # the other, or both see it as still returnable. Out of scope = 404.
        scope = await scope_of(conn, auth, key)
        sale = await conn.fetchrow(
            f"""select total_minor, rounding_minor, register_id, payment_method, status, branch_id, contact_id
                  from pos_sales s
                 where s.id=$1 and {where('pos.sale', scope, 's')} for update""", sale_id)
        if sale is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Sale not found")
        if sale["status"] == "void":
            raise HTTPException(status.HTTP_409_CONFLICT, "This sale was voided")
        available = {str(r["sale_item_id"]): r for r in await conn.fetch(_RETURNABLE, sale_id)}
        if void_reason is not None:
            from ..models import ReturnLine
            remaining = [ReturnLine(sale_item_id=k, qty=float(r["qty_sold"]) - float(r["qty_returned"]))
                    for k, r in available.items() if float(r["qty_sold"]) > float(r["qty_returned"])]
            if not remaining:
                raise HTTPException(status.HTTP_409_CONFLICT, "Everything on this sale has already come back")
            body = ReturnCreate(items=remaining, reason=f"Void: {void_reason}", restock=True,
                                register_id=body.register_id)

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

        # A refund goes back the way the money came (khata back to the
        # customer's ledger); a split sale is refunded in cash.
        refund_method = sale["payment_method"] if sale["payment_method"] not in ("split",) else "cash"
        # The till that pays it out, not necessarily the one that sold it: a
        # named till must be in the sale's branch and have an open session.
        reg = await pos_sessions.register(conn, body.register_id or sale["register_id"])
        session_id = await pos_sessions.open_session_id(conn, reg["id"])
        if body.register_id is not None:
            if reg["branch_id"] != sale["branch_id"]:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Register not found")
            if session_id is None:
                raise HTTPException(status.HTTP_409_CONFLICT, f"{reg['name']} has no open session to pay this from")
        return_id = await conn.fetchval(
            """insert into pos_returns (tenant_id, sale_id, cashier_id, reason, refund_minor, tax_minor,
                                        session_id, refund_method)
               values ($1,$2,$3,$4,$5,$6,$7,$8) returning id""",
            auth.tenant_id, sale_id, auth.user_id, body.reason, refund, tax_total, session_id, refund_method)
        if refund_method == "khata" and sale["contact_id"] is not None:
            # A khata sale is refunded onto the customer's account, not from a drawer.
            await khata.post_refund(conn, auth.tenant_id, sale["contact_id"], sale_id, return_id, refund, auth.user_id)

        items = []
        for row, qty, line_refund in lines:
            await conn.execute(
                """insert into pos_return_items (tenant_id, return_id, sale_item_id, product_id,
                                                 name, qty, line_refund_minor)
                   values ($1,$2,$3,$4,$5,$6,$7)""",
                auth.tenant_id, return_id, row["sale_item_id"], row["product_id"], row["name"], qty, line_refund)
            # Damaged goods come back to the shop but not to the shelf.
            if body.restock and row["product_id"]:
                await catalog.move(conn, auth.tenant_id, row["product_id"], Decimal(str(qty)), "return",
                                   ref_id=return_id, user_id=auth.user_id)
            items.append(ReturnItemOut(name=row["name"], qty=qty, line_refund_minor=line_refund))

        outbox_id = None
        if fbr_cfg and fbr_cfg["enabled"]:
            # Queued even when the sale isn't filed yet: the outbox row depends
            # on the sale's, and the worker files the debit note once the sale
            # has an FBR number to reference.
            outbox_id = await fbr_submit.enqueue_return(
                conn, auth.tenant_id, sale_id, str(return_id), fbr_cfg)
        created_at = await conn.fetchval("select created_at from pos_returns where id=$1", return_id)
        if void_reason is not None:
            await conn.execute(
                """update pos_sales set status = 'void', void_reason = $2, voided_by = $3, voided_at = now()
                    where id = $1""", sale_id, void_reason, auth.user_id)
            await audit.track(conn, entity_type="pos_sale", entity_id=sale_id, kind="system",
                              body=f"Voided: {void_reason}", event="pos.sale.void")

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
