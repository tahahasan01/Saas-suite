"""Sales operations (3C, migration 0078): history and search, reprints,
voids and held bills. Returns and the sale itself are in routers/pos.py."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field

from .. import db, pins, pos_sessions
from ..deps import AuthContext
from ..models import ReturnCreate, ReturnLine, TenderMethod
from ..rbac import perm, scope_of
from ..scopes import where
from .pos import do_return

router = APIRouter(prefix="/pos", tags=["pos"])


class SaleRow(BaseModel):
    id: str
    receipt_no: str | None
    created_at: datetime
    total_minor: int
    payment_method: str
    item_count: int
    status: str
    cashier: str | None
    customer: str | None
    register_code: str | None


@router.get("/sales", response_model=list[SaleRow])
async def sales_history(response: Response, q: str | None = None, method: TenderMethod | None = None,
                        status_filter: str | None = Query(None, alias="status"),
                        register_id: UUID | None = None, day_from: date | None = Query(None, alias="from"),
                        day_to: date | None = Query(None, alias="to"), limit: int = Query(50, ge=1, le=200),
                        offset: int = Query(0, ge=0),
                        auth: AuthContext = Depends(perm("pos.sale.read"))) -> list[SaleRow]:
    """Search by receipt number, customer name or phone; filter by method,
    status, register and local day. Own-scope cashiers see their own sales."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        scope = await scope_of(conn, auth, "pos.sale.read")
        cond = f"""{where('pos.sale', scope, 's')}
               and ($1::text is null or s.receipt_no ilike '%'||$1||'%' or c.name ilike '%'||$1||'%'
                    or c.phone_raw like '%'||$1||'%')
               and ($2::text is null or s.payment_method = $2
                    or exists (select 1 from pos_payments p where p.sale_id = s.id and p.method = $2))
               and ($3::text is null or s.status = $3)
               and ($4::uuid is null or s.register_id = $4)
               and ($5::date is null or s.created_at::date >= $5)
               and ($6::date is null or s.created_at::date <= $6)"""
        args = [q.strip() if q else None, method, status_filter, register_id, day_from, day_to]
        total = await conn.fetchval(
            f"select count(*) from pos_sales s left join contacts c on c.id = s.contact_id where {cond}", *args)
        rows = await conn.fetch(
            f"""select s.*, u.name as cashier, c.name as customer, r.code as register_code
                  from pos_sales s left join users u on u.id = s.cashier_id
                  left join contacts c on c.id = s.contact_id left join pos_registers r on r.id = s.register_id
                 where {cond} order by s.created_at desc, s.id limit $7 offset $8""", *args, limit, offset)
    response.headers["X-Total-Count"] = str(total)
    return [SaleRow(id=str(r["id"]), receipt_no=r["receipt_no"], created_at=r["created_at"], total_minor=r["total_minor"],
                    payment_method=r["payment_method"], item_count=r["item_count"], status=r["status"],
                    cashier=r["cashier"], customer=r["customer"], register_code=r["register_code"]) for r in rows]


class PrintOut(BaseModel):
    sale_id: str
    receipt_no: str | None
    copy_no: int = Field(serialization_alias="copy")
    duplicate: bool


@router.post("/sales/{sale_id}/print", response_model=PrintOut, response_model_by_alias=True)
async def print_receipt(sale_id: str, auth: AuthContext = Depends(perm("pos.sale.read"))) -> PrintOut:
    """Count a print: the first is the original, every later one a DUPLICATE."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        scope = await scope_of(conn, auth, "pos.sale.read")
        row = await conn.fetchrow(
            f"""update pos_sales s set print_count = s.print_count + 1
                 where s.id = $1 and {where('pos.sale', scope, 's')} returning s.receipt_no, s.print_count""", sale_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sale not found")
    return PrintOut(sale_id=sale_id, receipt_no=row["receipt_no"], copy_no=row["print_count"],
                    duplicate=row["print_count"] > 1)


class VoidIn(BaseModel):
    reason: str = Field(min_length=1, max_length=300)
    register_id: UUID | None = None   # the till paying the money back


class VoidOut(BaseModel):
    sale_id: str
    status: str
    void_reason: str
    refund_minor: int


@router.post("/sales/{sale_id}/void", response_model=VoidOut)
async def void_sale(sale_id: str, body: VoidIn, auth: AuthContext = Depends(perm("pos.sale.void"))) -> VoidOut:
    """A full return of what is left (refund into the session, stock back,
    FBR debit note), then the sale is marked void — audited."""
    placeholder = ReturnCreate(items=[ReturnLine(sale_item_id="-", qty=1)], register_id=body.register_id)
    out = await do_return(sale_id, placeholder, auth, "pos.sale.void", void_reason=body.reason)
    return VoidOut(sale_id=sale_id, status="void", void_reason=body.reason, refund_minor=out.refund_minor)


# ── Held bills (D-27) ───────────────────────────────────────────────────────
class HeldIn(BaseModel):
    label: str = Field(default="", max_length=60)
    register_id: UUID | None = None
    cart: dict[str, Any]


class HeldOut(BaseModel):
    id: str
    label: str
    register_id: str | None
    cart: dict[str, Any]
    held_by: str | None
    created_at: datetime


def _held(r: Any) -> HeldOut:
    return HeldOut(id=str(r["id"]), label=r["label"], register_id=str(r["register_id"]) if r["register_id"] else None,
                   cart=dict(r["cart"]), held_by=r["held_by"], created_at=r["created_at"])


_HELD = "select h.*, u.name as held_by from pos_held_bills h left join users u on u.id = h.user_id"


@router.get("/held", response_model=list[HeldOut])
async def list_held(register_id: UUID | None = None,
                    auth: AuthContext = Depends(perm("pos.sale.create"))) -> list[HeldOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(_HELD + " where ($1::uuid is null or h.register_id = $1) order by h.created_at",
                                register_id)
    return [_held(r) for r in rows]


@router.post("/held", response_model=HeldOut, status_code=status.HTTP_201_CREATED)
async def hold_bill(body: HeldIn, auth: AuthContext = Depends(perm("pos.sale.create"))) -> HeldOut:
    if len(str(body.cart)) > 60000:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That cart is too big to hold")
    async with db.tenant_conn(auth.tenant_id) as conn:
        reg = await pos_sessions.register(conn, body.register_id)
        hid = await conn.fetchval(
            """insert into pos_held_bills (tenant_id, register_id, user_id, label, cart)
               values ($1, $2, $3, $4, $5) returning id""", auth.tenant_id, reg["id"], auth.user_id, body.label,
            body.cart)
        return _held(await conn.fetchrow(_HELD + " where h.id = $1", hid))


@router.post("/held/{held_id}/resume", response_model=HeldOut)
async def resume_bill(held_id: str, auth: AuthContext = Depends(perm("pos.sale.create"))) -> HeldOut:
    """Take a held bill back to the till: it leaves the list (once)."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        # The delete claims it: a second resume finds nothing.
        row = await conn.fetchrow(
            """with gone as (delete from pos_held_bills where id = $1 returning *)
               select g.*, u.name as held_by from gone g left join users u on u.id = g.user_id""", held_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That bill isn't held any more")
    return _held(row)


@router.delete("/pin-locks/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlock_pin(user_id: UUID, auth: AuthContext = Depends(perm("pos.register.manage"))) -> Response:
    """Switch an approver's till PIN back on after a lockout."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        if not await conn.fetchval("select 1 from users where id = $1", user_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    await pins.clear(f"user:{user_id}")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
