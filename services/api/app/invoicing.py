"""Invoices v2 (3E, migration 0074): the document's life in one place.

    draft --submit--> pending_approval --approve--> issued --pay--> partially_paid --> paid
      ^                     |reject                    |void (nothing paid or credited)
      +---------------------+                          +--> void

Amounts always come from app/pricing.py (D-21) and each line snapshots its
tax code, rate and rate id; issuing re-prices at the issue date, snapshots
the bill-to and takes the gap-free number as the LAST step (D-06), so a
rejected or abandoned draft never uses one. Credit notes are invoices of
kind 'credit_note' that reduce the credited invoice's balance.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

import asyncpg
from fastapi import HTTPException, status

from . import audit, sequences, tax
from .invoice_models import (
    InvoiceCreate,
    InvoiceDetail,
    InvoiceLineIn,
    InvoiceLineOut,
    InvoiceSummary,
    InvoiceUpdate,
    PaymentIn,
    PaymentOut,
)
from .pricing import price_sale

EDITABLE = ("draft", "pending_approval")
OPEN = ("issued", "partially_paid")
DUE_DAYS = 30   # default terms when an invoice is issued without a due date

SUMMARY = """
select i.*, c.name as contact_name, l.name as lead_name
  from invoices i
  left join contacts c on c.id = i.contact_id
  left join crm_leads l on l.id = i.lead_id"""


def _conflict(msg: str) -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, msg)


def balance(r: asyncpg.Record) -> int:
    return int(r["total_minor"] - r["paid_minor"] - r["credited_minor"])


def summary_out(r: asyncpg.Record, today: date) -> InvoiceSummary:
    return InvoiceSummary(
        id=str(r["id"]), kind=r["kind"], number=r["number"], legacy_ref=r["legacy_ref"], status=r["status"],
        contact_id=str(r["contact_id"]) if r["contact_id"] else None, contact_name=r["contact_name"],
        lead_id=str(r["lead_id"]) if r["lead_id"] else None, lead_name=r["lead_name"],
        issue_date=r["issue_date"], due_date=r["due_date"], total_minor=r["total_minor"],
        paid_minor=r["paid_minor"], credited_minor=r["credited_minor"], balance_minor=balance(r),
        overdue=r["status"] in OPEN and r["due_date"] is not None and r["due_date"] < today,
        created_at=r["created_at"])


# ── Pricing ─────────────────────────────────────────────────────────────────
@dataclass
class _Rate:
    code: str | None
    rate_id: Any
    pct: Decimal
    verified: bool


async def _region(conn: asyncpg.Connection) -> str | None:
    """The selling branch's province: picks the provincial sales-tax row."""
    region: str | None = await conn.fetchval(
        "select region_code from branches where id = app_current_branch(current_setting('app.tenant_id')::uuid)")
    return region


async def _rates(conn: asyncpg.Connection, lines: list[InvoiceLineIn], on: date) -> list[_Rate]:
    region = await _region(conn)
    out: list[_Rate] = []
    for line in lines:
        if not line.tax_code:
            out.append(_Rate(None, None, Decimal(0), True))
            continue
        r = await tax.rate_for(conn, line.tax_code, on, region)
        if r is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                f"No tax rate '{line.tax_code}' is in force on {on.isoformat()}")
        out.append(_Rate(line.tax_code, r["id"], Decimal(r["rate_pct"]), bool(r["verified"])))
    return out


async def _write_lines(conn: asyncpg.Connection, tenant_id: str, invoice_id: Any, lines: list[InvoiceLineIn],
                       discount_minor: int, inclusive: bool, on: date) -> None:
    """Price `lines` and replace the invoice's lines and totals with them."""
    # A foreign key ignores RLS: a product must be one this tenant can see.
    wanted = {ln.product_id for ln in lines if ln.product_id is not None}
    if wanted:
        seen = {r["id"] for r in await conn.fetch("select id from pos_products where id = any($1::uuid[])",
                                                  list(wanted))}
        if wanted - seen:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    rates = await _rates(conn, lines, on)
    priced = price_sale([(ln.unit_price_minor, ln.qty, r.pct) for ln, r in zip(lines, rates)], discount_minor,
                        tax_on=True, inclusive=inclusive, line_discounts=[ln.line_discount_minor for ln in lines])
    await conn.execute("delete from invoice_lines where invoice_id = $1", invoice_id)
    await conn.executemany(
        """insert into invoice_lines (tenant_id, invoice_id, position, product_id, description, qty,
                                      unit_price_minor, line_discount_minor, share_minor, tax_code, tax_rate_id,
                                      tax_rate_pct, net_excl_minor, tax_minor, total_minor)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)""",
        [(tenant_id, invoice_id, i, ln.product_id, ln.description, ln.qty, ln.unit_price_minor,
          p.line_discount_minor, p.share_minor, r.code, r.rate_id, r.pct, p.excl_minor, p.tax_minor, p.total_minor)
         for i, (ln, r, p) in enumerate(zip(lines, rates, priced.lines))])
    await conn.execute(
        """update invoices set subtotal_minor = $2, line_discount_minor = $3, discount_minor = $4,
                               tax_minor = $5, total_minor = $6, tax_inclusive = $7, updated_at = now()
            where id = $1""",
        invoice_id, priced.subtotal_minor, priced.line_discount_minor, priced.discount_minor, priced.tax_minor,
        priced.total_minor, inclusive)


async def _line_inputs(conn: asyncpg.Connection, invoice_id: Any) -> list[InvoiceLineIn]:
    rows = await conn.fetch("select * from invoice_lines where invoice_id = $1 order by position", invoice_id)
    return [InvoiceLineIn(description=r["description"], qty=r["qty"], unit_price_minor=r["unit_price_minor"],
                          line_discount_minor=r["line_discount_minor"], tax_code=r["tax_code"],
                          product_id=r["product_id"]) for r in rows]


# ── Reading ─────────────────────────────────────────────────────────────────
async def lock(conn: asyncpg.Connection, invoice_id: str) -> asyncpg.Record:
    row: asyncpg.Record | None = await conn.fetchrow("select * from invoices where id = $1 for update", invoice_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    return row


async def detail(conn: asyncpg.Connection, invoice_id: Any) -> InvoiceDetail:
    r = await conn.fetchrow(SUMMARY + " where i.id = $1", invoice_id)
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    today = await sequences.local_date(conn, None)
    lines = await conn.fetch(
        """select l.*, coalesce(t.verified, true) as verified from invoice_lines l
             left join tax_rates t on t.id = l.tax_rate_id
            where l.invoice_id = $1 order by l.position""", invoice_id)
    pays = await conn.fetch("select * from invoice_payments where invoice_id = $1 order by created_at", invoice_id)
    cns = await conn.fetch(SUMMARY + " where i.credit_of_id = $1 order by i.created_at", invoice_id)
    s = summary_out(r, today)
    return InvoiceDetail(
        **s.model_dump(), credit_of_id=str(r["credit_of_id"]) if r["credit_of_id"] else None,
        tax_inclusive=r["tax_inclusive"], subtotal_minor=r["subtotal_minor"],
        line_discount_minor=r["line_discount_minor"], discount_minor=r["discount_minor"], tax_minor=r["tax_minor"],
        bill_to={k: str(v) for k, v in (r["bill_to"] or {}).items() if v is not None},
        notes=r["notes"], reason=r["reason"],
        lines=[InvoiceLineOut(
            id=str(x["id"]), position=x["position"], description=x["description"], qty=float(x["qty"]),
            unit_price_minor=x["unit_price_minor"], line_discount_minor=x["line_discount_minor"],
            share_minor=x["share_minor"], tax_code=x["tax_code"], tax_rate_pct=float(x["tax_rate_pct"]),
            net_excl_minor=x["net_excl_minor"], tax_minor=x["tax_minor"], total_minor=x["total_minor"],
            product_id=str(x["product_id"]) if x["product_id"] else None) for x in lines],
        payments=[PaymentOut(id=str(p["id"]), method=p["method"], amount_minor=p["amount_minor"],
                             paid_on=p["paid_on"], reference=p["reference"], created_at=p["created_at"])
                  for p in pays],
        credit_notes=[summary_out(c, today) for c in cns],
        unverified_rates=any(not x["verified"] for x in lines))


# ── Writing ─────────────────────────────────────────────────────────────────
async def _contact_for(conn: asyncpg.Connection, contact_id: Any, lead_id: Any) -> Any:
    """The contact billed: the one named, else the lead's (a lead not yet
    qualified is a 422). Archived contacts can't be billed."""
    if lead_id is not None:
        # Always looked up under RLS: a foreign key alone would accept another
        # tenant's lead named beside our own contact.
        lead = await conn.fetchrow("select contact_id from crm_leads where id = $1", lead_id)
        if lead is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
        if contact_id is None:
            contact_id = lead["contact_id"]
    if contact_id is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            "Choose who to bill: a contact, or a lead that has been qualified")
    c = await conn.fetchrow("select archived_at from contacts where id = $1", contact_id)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
    if c["archived_at"] is not None:
        raise _conflict("That contact is archived")
    return contact_id


async def create(conn: asyncpg.Connection, tenant_id: str, user_id: str, body: InvoiceCreate) -> Any:
    contact_id = await _contact_for(conn, body.contact_id, body.lead_id)
    iid = await conn.fetchval(
        """insert into invoices (tenant_id, status, contact_id, lead_id, due_date, notes, requested_by)
           values ($1, $2, $3, $4, $5, $6, $7) returning id""",
        tenant_id, "pending_approval" if body.submit else "draft", contact_id, body.lead_id, body.due_date,
        body.notes, user_id)
    today = await sequences.local_date(conn, None)
    await _write_lines(conn, tenant_id, iid, body.lines, body.discount_minor, body.tax_inclusive, today)
    return iid


async def update(conn: asyncpg.Connection, tenant_id: str, invoice_id: str, body: InvoiceUpdate) -> None:
    cur = await lock(conn, invoice_id)
    if cur["status"] not in EDITABLE:
        raise _conflict(f"This invoice is {cur['status'].replace('_', ' ')}: it can't be changed")
    fields = body.model_dump(exclude_unset=True)
    if "contact_id" in fields:
        fields["contact_id"] = await _contact_for(conn, fields["contact_id"], None)
    simple = {k: fields[k] for k in ("contact_id", "due_date", "notes") if k in fields}
    if simple:
        sets = ", ".join(f"{k} = ${i}" for i, k in enumerate(simple, 2))
        await conn.execute(f"update invoices set {sets}, updated_at = now() where id = $1",
                           invoice_id, *simple.values())
    if {"lines", "discount_minor", "tax_inclusive"} & fields.keys():
        lines = body.lines if body.lines is not None else await _line_inputs(conn, invoice_id)
        await _write_lines(conn, tenant_id, invoice_id, lines,
                           fields.get("discount_minor", cur["discount_minor"]),
                           fields.get("tax_inclusive", cur["tax_inclusive"]),
                           await sequences.local_date(conn, None))


async def submit(conn: asyncpg.Connection, invoice_id: str) -> None:
    cur = await lock(conn, invoice_id)
    if cur["status"] != "draft":
        raise _conflict("Only a draft can be sent for approval")
    await conn.execute("update invoices set status = 'pending_approval', updated_at = now() where id = $1",
                       invoice_id)


async def reject(conn: asyncpg.Connection, invoice_id: str, reason: str) -> None:
    cur = await lock(conn, invoice_id)
    if cur["status"] != "pending_approval":
        raise _conflict("Only an invoice awaiting approval can be sent back")
    await conn.execute("update invoices set status = 'draft', reason = $2, updated_at = now() where id = $1",
                       invoice_id, reason)
    await audit.track(conn, entity_type="invoice", entity_id=invoice_id, kind="rejected",
                      event="invoicing.invoice.reject")


async def _bill_to(conn: asyncpg.Connection, contact_id: Any, lead_id: Any = None) -> dict[str, str]:
    if contact_id is None:
        # A v1 request whose lead never got a contact (0061): bill the lead's name.
        name = await conn.fetchval("select name from crm_leads where id = $1", lead_id) if lead_id else None
        return {"name": name} if name else {}
    c = await conn.fetchrow(
        """select c.name, c.phone_raw, c.email, coalesce(nullif(c.ntn, ''), co.ntn, '') as ntn,
                  coalesce(nullif(c.strn, ''), co.strn, '') as strn,
                  (select concat_ws(', ', nullif(a.line1, ''), nullif(a.line2, ''), nullif(a.city, ''))
                     from contact_addresses a where a.contact_id = c.id
                    order by a.is_default desc, a.kind = 'billing' desc limit 1) as address
             from contacts c left join contacts co on co.id = c.company_id
            where c.id = $1""", contact_id)
    if c is None:
        return {}
    return {"name": c["name"], "phone": c["phone_raw"] or "", "email": c["email"] or "",
            "ntn": c["ntn"] or "", "strn": c["strn"] or "", "address": c["address"] or ""}


async def _issue(conn: asyncpg.Connection, invoice_id: Any, kind: str, on: date) -> None:
    """Number the document: the LAST step of the transaction (D-06)."""
    got = await sequences.next_number(conn, "sales.invoice" if kind == "invoice" else "sales.credit_note", at=on)
    await conn.execute("update invoices set number = $2, period_key = $3 where id = $1",
                       invoice_id, got.number, got.period_key)


async def approve(conn: asyncpg.Connection, tenant_id: str, user_id: str, invoice_id: str) -> None:
    cur = await lock(conn, invoice_id)
    if cur["status"] != "pending_approval":
        raise _conflict("Only an invoice awaiting approval can be approved")
    today = await sequences.local_date(conn, None)
    # Re-price at the issue date: a rate that changed since the draft applies.
    await _write_lines(conn, tenant_id, invoice_id, await _line_inputs(conn, invoice_id),
                       cur["discount_minor"], cur["tax_inclusive"], today)
    await conn.execute(
        """update invoices set status = 'issued', issue_date = $2, due_date = coalesce(due_date, $3),
                               bill_to = $4, approved_by = $5, approved_at = now(), issued_at = now(),
                               reason = '', updated_at = now()
            where id = $1""",
        invoice_id, today, date.fromordinal(today.toordinal() + DUE_DAYS),
        await _bill_to(conn, cur["contact_id"], cur["lead_id"]), user_id)
    await audit.track(conn, entity_type="invoice", entity_id=invoice_id, kind="approved",
                      event="invoicing.invoice.approve")
    await _issue(conn, invoice_id, "invoice", today)


def _settled_status(total: int, paid: int, credited: int) -> str:
    if paid + credited >= total:
        return "paid"
    return "partially_paid" if paid + credited > 0 else "issued"


async def pay(conn: asyncpg.Connection, tenant_id: str, user_id: str, invoice_id: str, body: PaymentIn) -> None:
    cur = await lock(conn, invoice_id)
    if cur["kind"] != "invoice" or cur["status"] not in OPEN:
        raise _conflict("Payments go against an issued invoice with something left to pay")
    left = balance(cur)
    if body.amount_minor > left:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            f"That's more than is left to pay (Rs {left / 100:,.2f})")
    await conn.execute(
        """insert into invoice_payments (tenant_id, invoice_id, method, amount_minor, paid_on, reference, received_by)
           values ($1, $2, $3, $4, $5, $6, $7)""",
        tenant_id, invoice_id, body.method, body.amount_minor, body.paid_on, body.reference, user_id)
    paid = cur["paid_minor"] + body.amount_minor
    await conn.execute("update invoices set paid_minor = $2, status = $3, updated_at = now() where id = $1",
                       invoice_id, paid, _settled_status(cur["total_minor"], paid, cur["credited_minor"]))


async def credit(conn: asyncpg.Connection, tenant_id: str, user_id: str, invoice_id: str,
                 reason: str, amount_minor: int | None) -> Any:
    cur = await lock(conn, invoice_id)
    if cur["kind"] != "invoice" or cur["status"] not in OPEN:
        raise _conflict("Only an issued invoice with something left to pay can be credited")
    left = balance(cur)
    if amount_minor is None:
        if cur["paid_minor"] or cur["credited_minor"]:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                "Part of this invoice is already paid or credited: credit an amount instead")
        lines = await _line_inputs(conn, invoice_id)
        discount, inclusive = cur["discount_minor"], cur["tax_inclusive"]
    else:
        if amount_minor > left:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                f"A credit can't be more than is left on the invoice (Rs {left / 100:,.2f})")
        label = cur["number"] or cur["legacy_ref"] or "invoice"
        lines = [InvoiceLineIn(description=f"Credit against {label}", qty=Decimal(1), unit_price_minor=amount_minor)]
        discount, inclusive = 0, False
    today = await sequences.local_date(conn, None)
    cn = await conn.fetchval(
        """insert into invoices (tenant_id, kind, status, contact_id, lead_id, credit_of_id, notes, reason,
                                 requested_by)
           values ($1, 'credit_note', 'draft', $2, $3, $4, '', $5, $6) returning id""",
        tenant_id, cur["contact_id"], cur["lead_id"], invoice_id, reason, user_id)
    await _write_lines(conn, tenant_id, cn, lines, discount, inclusive, today)
    total = int(await conn.fetchval("select total_minor from invoices where id = $1", cn))
    if total > left:   # a full credit re-priced above what is left (a rate changed since)
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The credit would exceed what is left")
    await conn.execute(
        """update invoices set status = 'issued', issue_date = $2, bill_to = $3, approved_by = $4,
                               approved_at = now(), issued_at = now() where id = $1""",
        cn, today, cur["bill_to"] or await _bill_to(conn, cur["contact_id"]), user_id)
    credited = cur["credited_minor"] + total
    await conn.execute("update invoices set credited_minor = $2, status = $3, updated_at = now() where id = $1",
                       invoice_id, credited, _settled_status(cur["total_minor"], cur["paid_minor"], credited))
    await _issue(conn, cn, "credit_note", today)
    return cn


async def void(conn: asyncpg.Connection, user_id: str, invoice_id: str, reason: str) -> None:
    cur = await lock(conn, invoice_id)
    if cur["kind"] == "credit_note":
        # The credited invoice counts it; voiding it would leave that credit standing.
        raise _conflict("A credit note can't be voided")
    if cur["status"] in ("void", "paid", "partially_paid") or cur["paid_minor"] or cur["credited_minor"]:
        raise _conflict("Only an invoice with nothing paid or credited against it can be voided")
    await conn.execute(
        """update invoices set status = 'void', reason = $2, voided_by = $3, voided_at = now(), updated_at = now()
            where id = $1""", invoice_id, reason, user_id)
