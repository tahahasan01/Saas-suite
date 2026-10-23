"""Bulk and recurring invoices: fee vouchers (PRD INV-08). Plans and runs
are invoice work (invoicing.invoice.create); issuing a run is approval
(invoicing.invoice.approve), since it numbers every invoice in it. Included
before the invoices router, so /invoices/plans isn't read as an invoice id.
The logic is in app/invoice_runs.py."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status

from .. import db, invoice_runs, invoicing, sequences
from ..deps import AuthContext
from ..invoice_models import InvoicePlanIn, InvoicePlanOut, InvoiceRunCreate, InvoiceRunDetail, InvoiceRunOut
from ..rbac import perm

router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.get("/plans", response_model=list[InvoicePlanOut])
async def list_plans(auth: AuthContext = Depends(perm("invoicing.invoice.read"))) -> list[InvoicePlanOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch("select * from invoice_plans order by active desc, lower(name)")
    return [invoice_runs.plan_out(r) for r in rows]


@router.post("/plans", response_model=InvoicePlanOut, status_code=status.HTTP_201_CREATED)
async def create_plan(body: InvoicePlanIn, auth: AuthContext = Depends(perm("invoicing.invoice.create"))) -> InvoicePlanOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await invoice_runs.check_plan(conn, [ln.product_id for ln in body.lines], body.tag_id, body.segment_id)
        row = await conn.fetchrow(
            """insert into invoice_plans (tenant_id, name, lines, tag_id, segment_id, due_day, run_day, notes,
                                          created_by)
               values ($1, btrim($2), $3, $4, $5, $6, $7, $8, $9) returning *""",
            auth.tenant_id, body.name, [ln.model_dump(mode="json") for ln in body.lines], body.tag_id,
            body.segment_id, body.due_day, body.run_day, body.notes, auth.user_id)
    return invoice_runs.plan_out(row)


@router.get("/plans/{plan_id}/runs", response_model=list[InvoiceRunOut])
async def list_runs(plan_id: str, auth: AuthContext = Depends(perm("invoicing.invoice.read"))) -> list[InvoiceRunOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(invoice_runs.RUN_SELECT + " where r.plan_id = $1 order by r.period desc", plan_id)
    return [invoice_runs.run_out(r) for r in rows]


@router.post("/plans/{plan_id}/runs", response_model=InvoiceRunOut, status_code=status.HTTP_201_CREATED)
async def make_run(plan_id: str, body: InvoiceRunCreate,
                   auth: AuthContext = Depends(perm("invoicing.invoice.create"))) -> InvoiceRunOut:
    """One draft invoice per contact for the month, for review."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await invoice_runs.make_run(conn, auth.tenant_id, auth.user_id, plan_id, body.period)


@router.get("/runs/{invoice_run_id}", response_model=InvoiceRunDetail)
async def get_run(invoice_run_id: str, auth: AuthContext = Depends(perm("invoicing.invoice.read"))) -> InvoiceRunDetail:
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow(invoice_runs.RUN_SELECT + " where r.id = $1", invoice_run_id)
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
        today = await sequences.local_date(conn, None)
        invs = await conn.fetch(invoicing.SUMMARY + " where i.run_id = $1 order by c.name, i.id", invoice_run_id)
    return InvoiceRunDetail(**invoice_runs.run_out(row).model_dump(),
                     invoices=[invoicing.summary_out(r, today) for r in invs])


@router.post("/runs/{invoice_run_id}/issue", response_model=InvoiceRunOut)
async def issue_run(invoice_run_id: str, auth: AuthContext = Depends(perm("invoicing.invoice.approve"))) -> InvoiceRunOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await invoice_runs.issue(conn, auth.tenant_id, auth.user_id, invoice_run_id)


@router.get("/runs/{invoice_run_id}/pdfs")
async def run_pdfs(invoice_run_id: str, auth: AuthContext = Depends(perm("invoicing.invoice.read"))) -> Response:
    async with db.tenant_conn(auth.tenant_id) as conn:
        data = await invoice_runs.pdf_zip(conn, auth.tenant_id, invoice_run_id)
    return Response(data, media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="invoices-{invoice_run_id[:8]}.zip"'})
