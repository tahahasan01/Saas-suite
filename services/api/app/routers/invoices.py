"""Invoice requests — sales requests, accounts approves, PDF on approval.
Separation of duties: creation needs crm:write; approval needs the
invoicing.invoice.approve key (legacy accounts:admin), never a role name."""
from __future__ import annotations

import io
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from .. import audit, db, invoices_pdf, notifications
from ..deps import AuthContext
from ..models import InvoiceCreate, InvoiceOut
from ..rbac import perm, require

router = APIRouter(prefix="/crm/invoices", tags=["invoices"])


def _total(amount_minor: int, discount_pct: float) -> int:
    return round(amount_minor * (1 - float(discount_pct) / 100))


invoice_total = _total  # Contact 360 shows the same figure


def _out(r) -> InvoiceOut:
    return InvoiceOut(
        id=str(r["id"]), lead_id=str(r["lead_id"]) if r["lead_id"] else None, lead_name=r["lead_name"],
        contact_id=str(r["contact_id"]) if r["contact_id"] else None, contact_name=r["contact_name"],
        bill_to=r["contact_name"] or r["lead_name"] or "",
        amount_minor=r["amount_minor"], discount_pct=float(r["discount_pct"]),
        total_minor=_total(r["amount_minor"], r["discount_pct"]), notes=r["notes"],
        status=r["status"], created_at=r["created_at"], decided_at=r["decided_at"])


_SELECT = """select i.*, l.name as lead_name, c.name as contact_name from crm_invoice_requests i
             left join crm_leads l on l.id = i.lead_id
             left join contacts c on c.id = i.contact_id"""


@router.get("", response_model=list[InvoiceOut])
async def list_invoices(status_filter: str | None = None,
                        auth: AuthContext = Depends(require("crm", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        if status_filter:
            rows = await conn.fetch(_SELECT + " where i.status=$1 order by i.created_at desc", status_filter)
        else:
            rows = await conn.fetch(_SELECT + " order by i.created_at desc")
    return [_out(r) for r in rows]


async def _bill_to(conn, body: InvoiceCreate):
    """The contact this request bills: the one named, else the lead's."""
    lead_contact = None
    if body.lead_id is not None:
        lead = await conn.fetchrow("select contact_id from crm_leads where id=$1", body.lead_id)
        if lead is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
        lead_contact = lead["contact_id"]
    contact_id = body.contact_id or lead_contact
    if contact_id is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            "Qualify the lead (link or create its contact) before invoicing, or choose a contact")
    contact = await conn.fetchrow("select archived_at from contacts where id=$1", contact_id)
    if contact is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
    if contact["archived_at"] is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "That contact is archived")
    return contact_id


@router.post("", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
async def create_invoice(body: InvoiceCreate, auth: AuthContext = Depends(require("crm", "write"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        contact_id = await _bill_to(conn, body)
        rid = await conn.fetchval(
            """insert into crm_invoice_requests (tenant_id, lead_id, contact_id, requested_by, amount_minor,
                                                 discount_pct, notes)
               values ($1,$2,$3,$4,$5,$6,$7) returning id""",
            auth.tenant_id, body.lead_id, contact_id, auth.user_id, body.amount_minor, body.discount_pct, body.notes)
        # Notify the accounts approver (the Owner) that a ticket is waiting.
        approver = await conn.fetchval(
            "select u.id from users u join roles r on r.id=u.role_id where r.name='Owner' limit 1")
        if approver and str(approver) != auth.user_id:
            await notifications.create(conn, user_id=str(approver), kind="warning",
                                       title="Invoice approval needed",
                                       body=f"PKR {_total(body.amount_minor, body.discount_pct)//100:,}",
                                       link="/invoices")
        row = await conn.fetchrow(_SELECT + " where i.id=$1", rid)
    return _out(row)


async def _decide(invoice_id: str, auth: AuthContext, new_status: Literal["approved", "rejected"]) -> InvoiceOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        cur = await conn.fetchrow("select requested_by, status from crm_invoice_requests where id=$1", invoice_id)
        if cur is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice request not found")
        if cur["status"] != "pending":
            raise HTTPException(status.HTTP_409_CONFLICT, f"Already {cur['status']}")
        await conn.execute(
            "update crm_invoice_requests set status=$1, decided_by=$2, decided_at=now() where id=$3",
            new_status, auth.user_id, invoice_id)
        await audit.track(conn, entity_type="invoice_request", entity_id=invoice_id, kind=new_status,
                          event="invoicing.invoice." + ("approve" if new_status == "approved" else "reject"))
        if cur["requested_by"]:
            await notifications.create(conn, user_id=str(cur["requested_by"]),
                                       kind="success" if new_status == "approved" else "info",
                                       title=f"Invoice {new_status}", link="/invoices")
        row = await conn.fetchrow(_SELECT + " where i.id=$1", invoice_id)
    return _out(row)


@router.post("/{invoice_id}/approve", response_model=InvoiceOut)
async def approve(invoice_id: str, auth: AuthContext = Depends(perm("invoicing.invoice.approve"))):
    return await _decide(invoice_id, auth, "approved")


@router.post("/{invoice_id}/reject", response_model=InvoiceOut)
async def reject(invoice_id: str, auth: AuthContext = Depends(perm("invoicing.invoice.approve"))):
    return await _decide(invoice_id, auth, "rejected")


@router.get("/{invoice_id}/pdf")
async def invoice_pdf(invoice_id: str, auth: AuthContext = Depends(require("crm", "read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow(_SELECT + " where i.id=$1", invoice_id)
        company = await conn.fetchval("select name from tenants where id=$1", auth.tenant_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice request not found")
    if row["status"] != "approved":
        raise HTTPException(status.HTTP_409_CONFLICT, "Invoice is not approved yet")
    pdf = invoices_pdf.build_invoice_pdf(
        company=company, lead_name=row["contact_name"] or row["lead_name"] or "", number=str(row["id"])[:8].upper(),
        date_str=row["created_at"].strftime("%d %b %Y"), amount_minor=row["amount_minor"],
        discount_pct=float(row["discount_pct"]), total_minor=_total(row["amount_minor"], row["discount_pct"]),
        notes=row["notes"])
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="invoice-{str(row["id"])[:8]}.pdf"'})
