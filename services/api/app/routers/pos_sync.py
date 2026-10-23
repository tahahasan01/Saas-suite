"""Offline till sync (3D, migration 0081, D-20 to D-23).

POST /pos/sync/orders takes a till's outbox in batches of up to 100; each
order goes through the online sale's own ingest (`pos._record_sale`) and
gets its own answer. GET /pos/catalog/delta feeds the till what changed
since its last pull. Flagged sales wait in /pos/review for a manager."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field

from .. import audit, db, pos_sessions
from ..deps import AuthContext
from ..models import PaymentMethod, SaleCreate, SaleLine, TenderIn
from ..rbac import perm
from ..security import hash_token
from .pos import Offline, _fingerprint, _record_sale, _replay_sale

router = APIRouter(prefix="/pos", tags=["pos"])


class OfflineOrder(BaseModel):
    client_uuid: UUID
    # The till's own receipt number, already printed: <REG>-<DEV>-NNNNNN.
    offline_ref: str = Field(pattern=r"^[A-Z0-9]{1,6}-[A-Z0-9]{1,6}-\d{6}$")
    created_at: datetime
    items: list[SaleLine] = Field(min_length=1)
    discount_minor: int = Field(default=0, ge=0)
    paid_minor: int = Field(default=0, ge=0)
    payment_method: PaymentMethod = "cash"
    payments: list[TenderIn] | None = Field(default=None, min_length=1, max_length=7)
    contact_id: UUID | None = None
    client_total_minor: int = Field(ge=0)
    cashier_token: str | None = Field(default=None, max_length=200)
    # A discount the cashier can't give: the manager's PIN, taken at the till.
    approver_id: UUID | None = None
    approver_pin: str | None = Field(default=None, pattern=r"^\d{6}$")


class SyncIn(BaseModel):
    device_id: UUID
    orders: list[OfflineOrder] = Field(min_length=1, max_length=100)


class SyncResult(BaseModel):
    client_uuid: str
    status: Literal["created", "duplicate", "conflict"]
    sale_id: str | None = None
    receipt_no: str | None = None
    needs_review: bool = False
    reasons: list[str] = []
    error: str | None = None


class SyncOut(BaseModel):
    results: list[SyncResult]


async def _device(auth: AuthContext, device_id: UUID, token: str | None) -> asyncpg.Record:
    """The till itself, proven by its own token (0077)."""
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This device's token is missing")
    async with db.tenant_conn(auth.tenant_id) as conn:
        dev = await conn.fetchrow("select id, register_id from pos_devices where id = $1 and token_hash = $2 and active",
                                  device_id, hash_token(token))
    if dev is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This device isn't registered with that token")
    return dev


@router.post("/sync/orders", response_model=SyncOut)
async def sync_orders(body: SyncIn, x_device_token: str | None = Header(default=None, alias="X-Device-Token"),
                      auth: AuthContext = Depends(perm("pos.sale.create"))) -> SyncOut:
    dev = await _device(auth, body.device_id, x_device_token)
    results: list[SyncResult] = []
    for o in body.orders:
        sale = SaleCreate(client_uuid=o.client_uuid, items=o.items, discount_minor=o.discount_minor,
                          paid_minor=o.paid_minor, payment_method=o.payment_method, payments=o.payments,
                          register_id=dev["register_id"], device_id=dev["id"], contact_id=o.contact_id,
                          approver_id=o.approver_id, approver_pin=o.approver_pin)
        fingerprint = _fingerprint(sale)
        uid = str(o.client_uuid)
        try:
            replay = await _replay_sale(auth.tenant_id, o.client_uuid, fingerprint)
            if replay is not None:
                results.append(SyncResult(client_uuid=uid, status="duplicate", sale_id=replay.id,
                                          receipt_no=replay.receipt_no))
                continue
            off = Offline(created_at=o.created_at, offline_ref=o.offline_ref, client_total_minor=o.client_total_minor)
            out = await _record_sale(sale, auth, fingerprint, o.cashier_token, offline=off)
            results.append(SyncResult(client_uuid=uid, status="created", sale_id=out.id, receipt_no=out.receipt_no,
                                      needs_review=bool(off.reasons), reasons=off.reasons))
        except asyncpg.UniqueViolationError:
            # Raced a copy of itself (or reused a receipt number): the first one stands.
            replay = await _replay_sale(auth.tenant_id, o.client_uuid, fingerprint)
            results.append(SyncResult(client_uuid=uid, status="duplicate", sale_id=replay.id, receipt_no=replay.receipt_no)
                           if replay else SyncResult(client_uuid=uid, status="conflict",
                                                     error="That receipt number was already used"))
        except HTTPException as e:
            # Can't be recorded as sent (an unknown product, a discount nobody
            # approved, khata over the limit, a cart id reused): never retried
            # by itself, a person decides.
            results.append(SyncResult(client_uuid=uid, status="conflict", error=str(e.detail)))
    return SyncOut(results=results)


# ── Catalogue delta ─────────────────────────────────────────────────────────
@router.get("/catalog/delta")
async def catalog_delta(since: int = Query(0, ge=0), limit: int = Query(500, ge=1, le=2000),
                        register_id: UUID | None = None,
                        auth: AuthContext = Depends(perm("pos.sale.create"))) -> dict[str, Any]:
    """Products changed after `since` (a row_version), oldest first, plus what
    the till needs to price offline exactly as the server would (pos-core).
    Cost is left out: a till never needs it (field-guarded).

    `reset` tells the till to drop its cached catalogue and start again: the
    cursor is ahead of every product (a restored database), so the feed
    restarts from 0. The till does the same itself when the register's
    `config_version` moves (3D)."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        reg = await pos_sessions.register(conn, register_id)
        reset = since > 0 and since > await conn.fetchval("select coalesce(max(row_version), 0) from pos_products")
        if reset:
            since = 0
        fbr = await conn.fetchrow("select enabled, prices_include_tax from fbr_settings where tenant_id = $1",
                                  auth.tenant_id)
        tax_on = bool(fbr and fbr["enabled"])
        pricing = {"tax_on": tax_on, "inclusive": bool(tax_on and fbr["prices_include_tax"]),
                   "cash_rounding_minor": await pos_sessions.rounding_unit(conn, reg)}
        rows = await conn.fetch(
            # Stock as this till's branch holds it (0091), not the company total.
            """select p.id, p.name, p.sku, p.barcode, p.unit, p.price_minor, p.tax_rate, p.hs_code, p.fbr_uom,
                      p.category_id, p.track_stock, coalesce(l.qty, 0) as stock_qty, p.active, p.group_id,
                      p.attributes, p.color, p.pinned, p.row_version
                 from pos_products p
                 left join pos_stock_levels l on l.product_id = p.id and l.branch_id = $3
                where p.row_version > $1 order by p.row_version limit $2""", since, limit + 1, reg["branch_id"])
        # Few and small: sent whole every time, so a renamed or recoloured
        # category reaches tills without a cursor of its own (P42).
        categories = [{"id": str(c["id"]), "name": c["name"], "color": c["color"], "position": c["position"]}
                      for c in await conn.fetch(
                          "select id, name, color, position from pos_categories where active order by position, name")]
    more = len(rows) > limit
    rows = rows[:limit]
    products = [{**dict(r), "id": str(r["id"]), "category_id": str(r["category_id"]) if r["category_id"] else None,
                 "group_id": str(r["group_id"]) if r["group_id"] else None, "tax_rate": float(r["tax_rate"] or 0),
                 "stock_qty": float(r["stock_qty"])} for r in rows]
    return {"products": products, "next": rows[-1]["row_version"] if rows else since, "more": more,
            "pricing": pricing, "reset": reset, "categories": categories,
            "register": {"id": str(reg["id"]), "code": reg["code"], "payment_methods": list(reg["payment_methods"]),
                         "config_version": reg["config_version"]}}


# ── Manager review queue ────────────────────────────────────────────────────
class ResolveIn(BaseModel):
    note: str = Field(default="", max_length=500)


@router.get("/review")
async def review_queue(auth: AuthContext = Depends(perm("pos.session.approve"))) -> list[dict[str, Any]]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            """select s.id, s.receipt_no, s.created_at, s.synced_at, s.total_minor, s.client_total_minor,
                      s.review_reasons, r.code as register_code
                 from pos_sales s left join pos_registers r on r.id = s.register_id
                where s.needs_review order by s.synced_at desc limit 200""")
    return [{"sale_id": str(r["id"]), "receipt_no": r["receipt_no"], "created_at": r["created_at"],
             "synced_at": r["synced_at"], "total_minor": r["total_minor"], "client_total_minor": r["client_total_minor"],
             "reasons": list(r["review_reasons"]), "register_code": r["register_code"]} for r in rows]


@router.post("/review/{sale_id}/resolve")
async def resolve(sale_id: str, body: ResolveIn, auth: AuthContext = Depends(perm("pos.session.approve"))) -> dict[str, Any]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow(
            """update pos_sales set needs_review = false, reviewed_by = $2, reviewed_at = now(), review_note = $3
                where id = $1 and needs_review returning id, review_reasons""", sale_id, auth.user_id, body.note)
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No sale waiting for review there")
        await audit.event(conn, "pos.sale.reviewed", "pos_sales", sale_id,
                          data={"reasons": list(row["review_reasons"]), "note": body.note})
    return {"sale_id": sale_id, "resolved": True}
