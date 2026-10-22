"""Invoices v2 (3E): drafts, approval, issue, payments, credit notes, void
and the PDF. The life cycle is in app/invoicing.py. Separation of duties:
raising an invoice needs invoicing.invoice.create; approving, crediting,
voiding and taking payments are accounts keys, never a role name (P1-13)."""
from __future__ import annotations

import io
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse

from .. import audit, csv_io, db, email, invoices_pdf, invoicing, notifications, ratelimit, sequences
from ..deps import AuthContext
from ..invoice_models import (
    AgingReport,
    CreditNoteIn,
    InvoiceCreate,
    InvoiceDetail,
    InvoiceSend,
    InvoiceSent,
    InvoiceSummary,
    InvoiceUpdate,
    PaymentIn,
    Reason,
)
from ..models import InvoiceStatus
from ..phone import normalize_email
from ..rbac import perm

router = APIRouter(prefix="/invoices", tags=["invoices"])

SENDS_PER_INVOICE_HOUR = 3
SENDS_PER_DAY = 200


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


@router.get("/aging", response_model=AgingReport)
async def receivables_aging(as_of: date | None = None, format: str = Query("json", pattern="^(json|csv)$"),
                            auth: AuthContext = Depends(perm("invoicing.invoice.read"))) -> Any:
    """What each customer owes, by how late: not yet due, 1-30, 31-60, 61-90, 90+ days."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        day = as_of or await sequences.local_date(conn, None)
        rep = await invoicing.aging(conn, day)
    if format == "json":
        return rep
    rupees = lambda m: f"{m / 100:.2f}"  # noqa: E731
    cols = ["customer", "not_yet_due", "1_30", "31_60", "61_90", "over_90", "total", "invoices"]
    body = csv_io.to_csv(cols, [
        {"customer": x.contact_name, "not_yet_due": rupees(x.current_minor), "1_30": rupees(x.d1_30_minor),
         "31_60": rupees(x.d31_60_minor), "61_90": rupees(x.d61_90_minor), "over_90": rupees(x.d90_plus_minor),
         "total": rupees(x.total_minor), "invoices": x.invoices} for x in rep.rows])
    return Response(body, media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="aging-{day.isoformat()}.csv"'})


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
        seller = await invoicing.seller(conn, auth.tenant_id)
    pdf = invoices_pdf.build_invoice_pdf(inv, seller)
    ref = inv.number or inv.legacy_ref or inv.id[:8]
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="{ref}.pdf"'})


@router.post("/{invoice_id}/send", response_model=InvoiceSent, status_code=status.HTTP_202_ACCEPTED)
async def send_invoice(invoice_id: str, body: InvoiceSend,
                       auth: AuthContext = Depends(perm("invoicing.invoice.create"))) -> InvoiceSent:
    """Email the issued invoice with its PDF, through the outbox: SMTP being
    down never fails this, and the PDF is built when the email goes."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        inv = await conn.fetchrow(
            """select i.status, c.email_normalized from invoices i left join contacts c on c.id = i.contact_id
                where i.id = $1 for update of i""", invoice_id)
        if inv is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
        if inv["status"] in invoicing.EDITABLE or inv["status"] == "void":
            raise HTTPException(status.HTTP_409_CONFLICT, "Only an issued invoice can be sent")
        to = normalize_email(body.to) if body.to else inv["email_normalized"]
        if not to:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                "Please check the email address" if body.to
                                else "Give an email address: this customer has none")
        # Not a mail relay: the same invoice a few times an hour, and a daily
        # cap per business (counted only for sends that pass every check).
        for bucket, limit, window in ((f"invoice-send:{invoice_id}", SENDS_PER_INVOICE_HOUR, 3600),
                                      (f"tenant:{auth.tenant_id}:invoice-send", SENDS_PER_DAY, 86400)):
            retry = await ratelimit.hit(bucket, limit, window)
            if retry:
                raise ratelimit.too_many(retry)
        await email.queue_invoice(conn, auth.tenant_id, to, invoice_id)
        await conn.execute("update invoices set last_sent_at = now(), updated_at = now() where id = $1", invoice_id)
        await audit.event(conn, "invoicing.invoice.send", "invoices", invoice_id, data={"to": to})
    return InvoiceSent(to=to)
