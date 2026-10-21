"""Invoices v2 (3E): drafts, approval, issue, payments, credit notes, void
and the PDF. The life cycle is in app/invoicing.py. Separation of duties:
raising an invoice needs invoicing.invoice.create; approving, crediting,
voiding and taking payments are accounts keys, never a role name (P1-13)."""
from __future__ import annotations

import io

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from .. import db, invoices_pdf, invoicing, notifications, sequences
from ..deps import AuthContext
from ..invoice_models import (
    CreditNoteIn,
    InvoiceCreate,
    InvoiceDetail,
    InvoiceSummary,
    InvoiceUpdate,
    PaymentIn,
    Reason,
)
from ..models import InvoiceStatus
from ..rbac import perm

router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.get("", response_model=list[InvoiceSummary])
async def list_invoices(status_filter: InvoiceStatus | None = Query(None, alias="status"),
                        contact_id: str | None = None, lead_id: str | None = None,
                        overdue: bool = False, limit: int = Query(200, ge=1, le=500),
                        auth: AuthContext = Depends(perm("invoicing.invoice.read"))) -> list[InvoiceSummary]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        today = await sequences.local_date(conn, None)
        rows = await conn.fetch(
            invoicing.SUMMARY + """
             where ($1::text is null or i.status = $1)
               and ($2::uuid is null or i.contact_id = $2)
               and ($3::uuid is null or i.lead_id = $3)
               and (not $4 or (i.status in ('issued', 'partially_paid') and i.due_date < $5))
             order by i.created_at desc limit $6""",
            status_filter, contact_id, lead_id, overdue, today, limit)
    return [invoicing.summary_out(r, today) for r in rows]


@router.get("/{invoice_id}", response_model=InvoiceDetail)
async def get_invoice(invoice_id: str, auth: AuthContext = Depends(perm("invoicing.invoice.read"))) -> InvoiceDetail:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await invoicing.detail(conn, invoice_id)


async def _notify_approvers(conn, auth: AuthContext, total_minor: int) -> None:
    """Tell whoever can approve (the Owner today) that an invoice is waiting."""
    approver = await conn.fetchval(
        "select u.id from users u join roles r on r.id = u.role_id where r.name = 'Owner' limit 1")
    if approver and str(approver) != auth.user_id:
        await notifications.create(conn, user_id=str(approver), kind="warning", title="Invoice approval needed",
                                   body=f"PKR {total_minor // 100:,}", link="/invoices")


@router.post("", response_model=InvoiceDetail, status_code=status.HTTP_201_CREATED)
async def create_invoice(body: InvoiceCreate,
                         auth: AuthContext = Depends(perm("invoicing.invoice.create"))) -> InvoiceDetail:
    async with db.tenant_conn(auth.tenant_id) as conn:
        iid = await invoicing.create(conn, auth.tenant_id, auth.user_id, body)
        out = await invoicing.detail(conn, iid)
        if body.submit:
            await _notify_approvers(conn, auth, out.total_minor)
    return out


@router.patch("/{invoice_id}", response_model=InvoiceDetail)
async def update_invoice(invoice_id: str, body: InvoiceUpdate,
                         auth: AuthContext = Depends(perm("invoicing.invoice.create"))) -> InvoiceDetail:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await invoicing.update(conn, auth.tenant_id, invoice_id, body)
        return await invoicing.detail(conn, invoice_id)


@router.post("/{invoice_id}/submit", response_model=InvoiceDetail)
async def submit_invoice(invoice_id: str,
                         auth: AuthContext = Depends(perm("invoicing.invoice.create"))) -> InvoiceDetail:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await invoicing.submit(conn, invoice_id)
        out = await invoicing.detail(conn, invoice_id)
        await _notify_approvers(conn, auth, out.total_minor)
    return out


@router.post("/{invoice_id}/approve", response_model=InvoiceDetail)
async def approve_invoice(invoice_id: str,
                          auth: AuthContext = Depends(perm("invoicing.invoice.approve"))) -> InvoiceDetail:
    async with db.tenant_conn(auth.tenant_id) as conn:
        requester = await conn.fetchval("select requested_by from invoices where id = $1", invoice_id)
        await invoicing.approve(conn, auth.tenant_id, auth.user_id, invoice_id)
        if requester and str(requester) != auth.user_id:
            await notifications.create(conn, user_id=str(requester), kind="success", title="Invoice approved",
                                       link="/invoices")
    # Read back outside the numbering transaction: the counter lock is released.
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await invoicing.detail(conn, invoice_id)


@router.post("/{invoice_id}/reject", response_model=InvoiceDetail)
async def reject_invoice(invoice_id: str, body: Reason,
                         auth: AuthContext = Depends(perm("invoicing.invoice.approve"))) -> InvoiceDetail:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await invoicing.reject(conn, invoice_id, body.reason)
        requester = await conn.fetchval("select requested_by from invoices where id = $1", invoice_id)
        if requester and str(requester) != auth.user_id:
            await notifications.create(conn, user_id=str(requester), kind="info", title="Invoice sent back",
                                       body=body.reason, link="/invoices")
        return await invoicing.detail(conn, invoice_id)


@router.post("/{invoice_id}/payments", response_model=InvoiceDetail)
async def record_payment(invoice_id: str, body: PaymentIn,
                         auth: AuthContext = Depends(perm("invoicing.payment.record"))) -> InvoiceDetail:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await invoicing.pay(conn, auth.tenant_id, auth.user_id, invoice_id, body)
        return await invoicing.detail(conn, invoice_id)


@router.post("/{invoice_id}/credit-notes", response_model=InvoiceDetail, status_code=status.HTTP_201_CREATED)
async def credit_invoice(invoice_id: str, body: CreditNoteIn,
                         auth: AuthContext = Depends(perm("invoicing.invoice.approve"))) -> InvoiceDetail:
    async with db.tenant_conn(auth.tenant_id) as conn:
        cn = await invoicing.credit(conn, auth.tenant_id, auth.user_id, invoice_id, body.reason, body.amount_minor)
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await invoicing.detail(conn, cn)


@router.post("/{invoice_id}/void", response_model=InvoiceDetail)
async def void_invoice(invoice_id: str, body: Reason,
                       auth: AuthContext = Depends(perm("invoicing.invoice.void"))) -> InvoiceDetail:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await invoicing.void(conn, auth.user_id, invoice_id, body.reason)
        return await invoicing.detail(conn, invoice_id)


@router.get("/{invoice_id}/pdf")
async def invoice_pdf(invoice_id: str, auth: AuthContext = Depends(perm("invoicing.invoice.read"))):
    async with db.tenant_conn(auth.tenant_id) as conn:
        inv = await invoicing.detail(conn, invoice_id)
        if inv.status in invoicing.EDITABLE:
            raise HTTPException(status.HTTP_409_CONFLICT, "Only an issued invoice has a PDF")
        seller = await conn.fetchrow(
            """select coalesce(nullif(c.legal_name, ''), t.name) as name, coalesce(c.ntn, '') as ntn, coalesce(c.strn, '') as strn,
                      coalesce(c.address, '') as address, coalesce(c.phone, '') as phone,
                      coalesce(b.invoice_header, '') as header, coalesce(b.invoice_footer, '') as footer
                 from tenants t
                 left join tenant_company c on c.tenant_id = t.id
                 left join tenant_branding b on b.tenant_id = t.id
                where t.id = $1""", auth.tenant_id)
    pdf = invoices_pdf.build_invoice_pdf(inv, dict(seller) if seller else {})
    ref = inv.number or inv.legacy_ref or inv.id[:8]
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="{ref}.pdf"'})
