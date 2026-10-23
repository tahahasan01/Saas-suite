"""Bulk and recurring invoices: fee vouchers (PRD INV-08, migration 0126).

    plan --make a run for a month--> run (one draft per contact, for review)
                                       --issue--> every remaining draft gets its number

A plan is what to bill (lines), to whom (everyone with a tag, or a saved list
from campaigns) and the day of the month it falls due. Drafts are made
through invoicing.create, so they are priced by the one pricing function;
issuing goes through submit + approve, so each invoice is re-priced at issue
and takes its own gap-free number exactly as a hand-made one would. A draft
voided during review is simply left out. One run per plan and month.
"""
from __future__ import annotations

import io
import zipfile
from datetime import date
from typing import Any

import asyncpg
from fastapi import HTTPException, status

from . import campaigns, invoices_pdf, invoicing, notifications
from .crm_selling_models import SegmentFilter
from .invoice_models import InvoiceCreate, InvoiceLineIn, InvoicePlanOut, InvoiceRunOut


def first_of(period: str) -> date:
    y, m = period.split("-")
    return date(int(y), int(m), 1)


def plan_out(r: asyncpg.Record) -> InvoicePlanOut:
    return InvoicePlanOut(id=str(r["id"]), name=r["name"], lines=[InvoiceLineIn.model_validate(x) for x in r["lines"]],
                   tag_id=str(r["tag_id"]) if r["tag_id"] else None,
                   segment_id=str(r["segment_id"]) if r["segment_id"] else None, due_day=r["due_day"],
                   run_day=r["run_day"], notes=r["notes"], active=r["active"], created_at=r["created_at"])


RUN_SELECT = "select r.*, p.name as plan_name from invoice_runs r join invoice_plans p on p.id = r.plan_id"


def run_out(r: asyncpg.Record) -> InvoiceRunOut:
    return InvoiceRunOut(id=str(r["id"]), plan_id=str(r["plan_id"]), plan_name=r["plan_name"], period=r["period"],
                  status=r["status"], invoice_count=r["invoice_count"], total_minor=r["total_minor"],
                  created_at=r["created_at"], issued_at=r["issued_at"])


async def check_plan(conn: asyncpg.Connection, products: list[Any], tag_id: Any, segment_id: Any) -> None:
    """Every id must be this tenant's (a foreign key ignores RLS), checked
    before anything else; then exactly one audience: a tag or a saved list."""
    wanted = {p for p in products if p is not None}
    if wanted and await conn.fetchval("select count(*) from pos_products where id = any($1::uuid[])",
                                      list(wanted)) != len(wanted):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    if tag_id and not await conn.fetchval("select 1 from tags where id = $1", tag_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag not found")
    if segment_id and not await conn.fetchval(
            "select 1 from crm_segments where id = $1 and archived_at is null", segment_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "List not found")
    if (tag_id is None) == (segment_id is None):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Choose who to bill: a tag or a saved list")


async def _audience(conn: asyncpg.Connection, plan: asyncpg.Record) -> list[Any]:
    if plan["segment_id"]:
        f = await conn.fetchval("select filter from crm_segments where id = $1", plan["segment_id"])
        if f is None:
            return []
        where, args = campaigns.segment_sql(SegmentFilter.model_validate(f))
    elif plan["tag_id"]:
        where, args = campaigns.segment_sql(SegmentFilter(tag_ids=[plan["tag_id"]]))
    else:
        return []
    return [r["id"] for r in await conn.fetch(f"select c.id from contacts c where {where} order by lower(c.name), c.id",
                                              *args)]


async def make_run(conn: asyncpg.Connection, tenant_id: str, user_id: str, plan_id: str, period: str) -> InvoiceRunOut:
    plan = await conn.fetchrow("select * from invoice_plans where id = $1 for update", plan_id)
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found")
    if not plan["active"]:
        raise HTTPException(status.HTTP_409_CONFLICT, "This plan is switched off")
    month = first_of(period)
    run_id = await conn.fetchval(
        """insert into invoice_runs (tenant_id, plan_id, period, created_by) values ($1, $2, $3, $4)
           on conflict (plan_id, period) do nothing returning id""", tenant_id, plan_id, month, user_id)
    if run_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{plan['name']} already has a run for {period}")
    lines = [InvoiceLineIn.model_validate(x) for x in plan["lines"]]
    due = month.replace(day=plan["due_day"])
    for contact_id in await _audience(conn, plan):
        iid = await invoicing.create(conn, tenant_id, user_id, InvoiceCreate(
            contact_id=contact_id, due_date=due, notes=plan["notes"], lines=lines))
        await conn.execute("update invoices set run_id = $2 where id = $1", iid, run_id)
    await _recount(conn, run_id)
    row = await conn.fetchrow(RUN_SELECT + " where r.id = $1", run_id)
    return run_out(row)


async def _recount(conn: asyncpg.Connection, run_id: Any) -> None:
    await conn.execute(
        """update invoice_runs r set invoice_count = s.n, total_minor = s.total
             from (select count(*) as n, coalesce(sum(total_minor), 0) as total from invoices
                    where run_id = $1 and status <> 'void') s
            where r.id = $1""", run_id)


async def issue(conn: asyncpg.Connection, tenant_id: str, user_id: str, run_id: str) -> InvoiceRunOut:
    run = await conn.fetchrow("select * from invoice_runs where id = $1 for update", run_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    if run["status"] != "draft":
        raise HTTPException(status.HTTP_409_CONFLICT, "This run has already been issued")
    for r in await conn.fetch(
            "select id, status from invoices where run_id = $1 and status in ('draft', 'pending_approval') "
            "order by created_at, id", run_id):
        if r["status"] == "draft":
            await invoicing.submit(conn, str(r["id"]))
        await invoicing.approve(conn, tenant_id, user_id, str(r["id"]))
    await conn.execute(
        "update invoice_runs set status = 'issued', issued_by = $2, issued_at = now() where id = $1", run_id, user_id)
    await _recount(conn, run_id)
    return run_out(await conn.fetchrow(RUN_SELECT + " where r.id = $1", run_id))


async def pdf_zip(conn: asyncpg.Connection, tenant_id: str, run_id: str) -> bytes:
    run = await conn.fetchrow("select status from invoice_runs where id = $1", run_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    if run["status"] != "issued":
        raise HTTPException(status.HTTP_409_CONFLICT, "Issue the run first: drafts have no PDF")
    seller = await invoicing.seller(conn, tenant_id)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for r in await conn.fetch(
                "select id from invoices where run_id = $1 and status <> 'void' and number is not null "
                "order by number", run_id):
            inv = await invoicing.detail(conn, r["id"])
            z.writestr(f"{inv.number}.pdf", invoices_pdf.build_invoice_pdf(inv, seller))
    return buf.getvalue()


async def due_runs(conn: asyncpg.Connection, tenant_id: str, today: date) -> int:
    """The daily job: this month's run for every repeating plan whose day has come."""
    made = 0
    month = today.replace(day=1)
    for p in await conn.fetch(
            """select p.id, p.name, p.created_by from invoice_plans p
                where p.active and p.run_day is not null and p.run_day <= $1
                  and not exists (select 1 from invoice_runs r where r.plan_id = p.id and r.period = $2)""",
            today.day, month):
        if p["created_by"] is None:
            continue
        run = await make_run(conn, tenant_id, str(p["created_by"]), str(p["id"]), month.strftime("%Y-%m"))
        await notifications.create(conn, user_id=str(p["created_by"]), kind="info", link="/invoices",
                                   title=f"{p['name']}: {run.invoice_count} drafts ready",
                                   body="Check them, then issue the run.")
        made += 1
    return made
