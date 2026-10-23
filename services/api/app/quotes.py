"""Quotes the customer accepts online (wave D, C15, migration 0121; study 12 §3).

    sent --customer accepts--> accepted --staff--> invoice (invoices v2, a draft)
      |  --customer declines--> declined (a follow-up activity; the deal stays open)
      +--a newer quote / cancel--> superseded / cancelled (the link dies)

A quote is a frozen copy of the deal's lines. Making one sends it: it gets
its link at once, and a newer quote for the same deal supersedes the open
one. "Expired" is a sent quote past valid_until on the business date: it
still shows, but can't be accepted or declined.

The link's token is 32 random bytes. It is found by sha256 (token_hash);
a copy encrypted with app/crypto.py lets the rep copy the same link again.
Public reads never change anything (link previews fetch them); the page
counts a view with its own POST. Acceptance stores the typed name, time, IP,
user agent and the content hash the page showed, which must match.
"""
from __future__ import annotations

import hashlib
import json
import secrets
from datetime import date, timedelta
from typing import Any

import asyncpg
from fastapi import HTTPException, status

from . import activities, audit, crypto, db, invoicing, leads, notifications, sequences, timeline
from .crm_selling_models import QuoteLineOut, QuoteOut, QuotePublic, QuotePublicStatus
from .invoice_models import InvoiceCreate, InvoiceLineIn
from .security import hash_token

sequences.register_default("crm.quote", name="Quotes", pattern="QT-{FY}-{N}", gapless=False)

VALID_DAYS = 15
OPEN = "sent"
# Only these are reachable by the link (resolve); the customer sees "open" for sent.
_SHOWN: dict[str, QuotePublicStatus] = {"sent": "open", "accepted": "accepted", "declined": "declined"}


def _aad(tenant_id: Any) -> bytes:
    return crypto.aad(tenant_id, "crm_quotes", "token_enc")


def link_of(token: str) -> str:
    return f"/q/{token}"


def content_hash(number: str, valid_until: date, terms: str, customer: str, inclusive: bool,
                 lines: list[dict[str, Any]], totals: dict[str, int]) -> str:
    """sha256 of the quote as the customer reads it, in a canonical form."""
    doc = {"number": number, "valid_until": valid_until.isoformat(), "terms": terms, "customer": customer,
           "tax_inclusive": inclusive, "totals": totals,
           "lines": [{k: str(v) for k, v in sorted(ln.items())} for ln in lines]}
    return hashlib.sha256(json.dumps(doc, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


_LINE_COLS = ("description", "unit", "qty", "unit_price_minor", "line_discount_minor", "tax_rate_pct",
              "net_excl_minor", "tax_minor", "total_minor")


def _line(r: asyncpg.Record) -> QuoteLineOut:
    return QuoteLineOut(description=r["description"], unit=r["unit"], qty=float(r["qty"]),
                        unit_price_minor=r["unit_price_minor"], line_discount_minor=r["line_discount_minor"],
                        tax_rate_pct=float(r["tax_rate_pct"]), net_excl_minor=r["net_excl_minor"],
                        tax_minor=r["tax_minor"], total_minor=r["total_minor"])


def _expired(r: asyncpg.Record, today: date) -> bool:
    return bool(r["status"] == OPEN and r["valid_until"] < today)


def _doc(r: asyncpg.Record, lines: list[asyncpg.Record]) -> dict[str, Any]:
    return dict(number=r["number"], valid_until=r["valid_until"], terms=r["terms"], customer_name=r["customer_name"],
                tax_inclusive=r["tax_inclusive"], lines=[_line(x) for x in lines],
                subtotal_minor=r["subtotal_minor"], line_discount_minor=r["line_discount_minor"],
                net_minor=r["net_minor"], tax_minor=r["tax_minor"], total_minor=r["total_minor"],
                content_hash=r["content_hash"], accepted_name=r["accepted_name"], accepted_at=r["accepted_at"])


async def _lines(conn: asyncpg.Connection, quote_id: Any) -> list[asyncpg.Record]:
    return list(await conn.fetch("select * from crm_quote_lines where quote_id = $1 order by position", quote_id))


async def out(conn: asyncpg.Connection, r: asyncpg.Record, today: date | None = None) -> QuoteOut:
    today = today or await sequences.local_date(conn, None)
    link = None
    if r["status"] == OPEN:
        link = link_of(crypto.decrypt(bytes(r["token_enc"]), _aad(r["tenant_id"])))
    return QuoteOut(
        **_doc(r, await _lines(conn, r["id"])), id=str(r["id"]), lead_id=str(r["lead_id"]), status=r["status"],
        expired=_expired(r, today), link=link, created_at=r["created_at"], first_viewed_at=r["first_viewed_at"],
        view_count=r["view_count"], accepted_ip=r["accepted_ip"], declined_at=r["declined_at"],
        decline_reason=r["decline_reason"], invoice_id=str(r["invoice_id"]) if r["invoice_id"] else None,
        last_emailed_at=r["last_emailed_at"])


async def get(conn: asyncpg.Connection, quote_id: str) -> asyncpg.Record:
    row: asyncpg.Record | None = await conn.fetchrow("select * from crm_quotes where id = $1", quote_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quote not found")
    return row


async def for_lead(conn: asyncpg.Connection, lead_id: str) -> list[QuoteOut]:
    today = await sequences.local_date(conn, None)
    rows = await conn.fetch("select * from crm_quotes where lead_id = $1 order by created_at desc, number desc",
                            lead_id)
    return [await out(conn, r, today) for r in rows]


# ── Staff ───────────────────────────────────────────────────────────────────
async def create(conn: asyncpg.Connection, tenant_id: str, user_id: str, lead_id: str,
                 valid_until: date | None, terms: str) -> QuoteOut:
    lead = await leads.lock(conn, lead_id)
    if lead["status"] != "open":
        raise HTTPException(status.HTTP_409_CONFLICT, "Only an open deal can be quoted")
    deal_lines = await conn.fetch("select * from crm_deal_lines where lead_id = $1 order by position", lead_id)
    if not deal_lines:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Add the products to the deal first")
    today = await sequences.local_date(conn, None)
    valid_until = valid_until or today + timedelta(days=VALID_DAYS)
    if valid_until < today:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The quote can't be valid until a past date")
    customer = await conn.fetchval(
        "select coalesce(nullif(c.name, ''), nullif($2, ''), $3) from (select 1) x "
        "left join contacts c on c.id = $1", lead["contact_id"], lead["company"], lead["name"])

    # The open quote is replaced: its link dies with it.
    await conn.execute(
        """update crm_quotes set status = 'superseded', closed_at = now(), updated_at = now()
            where lead_id = $1 and status = 'sent'""", lead_id)

    lines = [{k: r[k] for k in _LINE_COLS} for r in deal_lines]
    totals = {"subtotal_minor": sum(r["gross_minor"] for r in deal_lines),
              "line_discount_minor": sum(r["line_discount_minor"] for r in deal_lines),
              "net_minor": sum(r["net_excl_minor"] for r in deal_lines),
              "tax_minor": sum(r["tax_minor"] for r in deal_lines),
              "total_minor": sum(r["total_minor"] for r in deal_lines)}
    number = (await sequences.next_number(conn, "crm.quote", at=today)).number
    token = secrets.token_urlsafe(32)
    chash = content_hash(number, valid_until, terms, customer, lead["lines_tax_inclusive"], lines, totals)
    qid = await conn.fetchval(
        """insert into crm_quotes (tenant_id, lead_id, number, valid_until, terms, customer_name, tax_inclusive,
                                   subtotal_minor, line_discount_minor, net_minor, tax_minor, total_minor,
                                   content_hash, token_hash, token_enc, created_by)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id""",
        tenant_id, lead_id, number, valid_until, terms, customer, lead["lines_tax_inclusive"],
        totals["subtotal_minor"], totals["line_discount_minor"], totals["net_minor"], totals["tax_minor"],
        totals["total_minor"], chash, hash_token(token), crypto.encrypt(token, _aad(tenant_id)), user_id)
    await conn.executemany(
        """insert into crm_quote_lines (tenant_id, quote_id, position, product_id, description, unit, qty,
                                        unit_price_minor, line_discount_minor, tax_code, tax_rate_pct,
                                        gross_minor, net_excl_minor, tax_minor, total_minor)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)""",
        [(tenant_id, qid, r["position"], r["product_id"], r["description"], r["unit"], r["qty"],
          r["unit_price_minor"], r["line_discount_minor"], r["tax_code"], r["tax_rate_pct"], r["gross_minor"],
          r["net_excl_minor"], r["tax_minor"], r["total_minor"]) for r in deal_lines])
    await timeline.record(conn, entity_type="lead", entity_id=lead_id, kind="system",
                          payload={"event": "quote_sent", "number": number, "total_minor": totals["total_minor"]})
    return await out(conn, await get(conn, str(qid)), today)


async def cancel(conn: asyncpg.Connection, quote_id: str) -> QuoteOut:
    row = await conn.fetchrow(
        """update crm_quotes set status = 'cancelled', closed_at = now(), updated_at = now()
            where id = $1 and status = 'sent' returning *""", quote_id)
    if row is None:
        await get(conn, quote_id)   # 404 when it isn't ours
        raise HTTPException(status.HTTP_409_CONFLICT, "Only an open quote can be cancelled")
    return await out(conn, row)


async def to_invoice(conn: asyncpg.Connection, tenant_id: str, user_id: str, quote_id: str) -> str:
    """A draft invoice from the quote's frozen lines, once. Never automatic:
    FBR filing follows the invoice, so a person raises it."""
    row = await conn.fetchrow("select * from crm_quotes where id = $1 for update", quote_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quote not found")
    if row["status"] != "accepted":
        raise HTTPException(status.HTTP_409_CONFLICT, "Only an accepted quote becomes an invoice")
    if row["invoice_id"] is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This quote already has an invoice")
    lines = await conn.fetch("select * from crm_quote_lines where quote_id = $1 order by position", quote_id)
    body = InvoiceCreate(
        lead_id=row["lead_id"], tax_inclusive=row["tax_inclusive"], notes=f"From quote {row['number']}",
        lines=[InvoiceLineIn(description=ln["description"], qty=ln["qty"], unit_price_minor=ln["unit_price_minor"],
                             line_discount_minor=ln["line_discount_minor"], tax_code=ln["tax_code"],
                             product_id=ln["product_id"]) for ln in lines])
    iid = await invoicing.create(conn, tenant_id, user_id, body)
    await conn.execute("update crm_quotes set invoice_id = $2, updated_at = now() where id = $1", quote_id, iid)
    return str(iid)


# ── The public link ─────────────────────────────────────────────────────────
async def resolve(token: str) -> asyncpg.Record:
    """The tenant and quote for a raw token, or 404. Only open-or-answered
    quotes of an active tenant with CRM on are reachable."""
    async with db.owner_conn() as oc:
        row: asyncpg.Record | None = await oc.fetchrow(
            """select q.id, q.tenant_id from crm_quotes q
                 join tenants t on t.id = q.tenant_id
                 join entitlements e on e.tenant_id = q.tenant_id and e.section_key = 'crm' and e.enabled
                where q.token_hash = $1 and q.status in ('sent', 'accepted', 'declined') and t.status = 'active'""",
            hash_token(token))
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This quote link isn't valid any more.")
    return row


async def public_view(conn: asyncpg.Connection, quote_id: Any) -> QuotePublic:
    r = await get(conn, str(quote_id))
    today = await sequences.local_date(conn, None)
    shown: QuotePublicStatus = "expired" if _expired(r, today) else _SHOWN[r["status"]]
    company = await conn.fetchrow("select legal_name, ntn, address, city, phone, email from tenant_company")
    name = (company["legal_name"] if company else "") or await conn.fetchval(
        "select name from tenants where id = current_setting('app.tenant_id')::uuid")
    business = {"name": name or ""}
    if company:
        business.update({k: company[k] or "" for k in ("ntn", "address", "city", "phone", "email")})
    return QuotePublic(**_doc(r, await _lines(conn, r["id"])), status=shown, business=business)


async def record_view(conn: asyncpg.Connection, quote_id: Any) -> None:
    await conn.execute(
        """update crm_quotes set view_count = view_count + 1, first_viewed_at = coalesce(first_viewed_at, now())
            where id = $1""", quote_id)


async def _answerable(conn: asyncpg.Connection, quote_id: Any) -> asyncpg.Record:
    row = await conn.fetchrow("select * from crm_quotes where id = $1 for update", quote_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This quote link isn't valid any more.")
    if _expired(row, await sequences.local_date(conn, None)):
        raise HTTPException(status.HTTP_409_CONFLICT, "This quote has expired. Ask for a new one.")
    return row


async def _tell_owner(conn: asyncpg.Connection, row: asyncpg.Record, lead: asyncpg.Record, title: str,
                      body: str) -> str | None:
    owner = lead["owner_id"] or row["created_by"]
    if owner:
        await notifications.create(conn, user_id=str(owner), title=title, body=body, kind="info", link="/crm")
    return str(owner) if owner else None


async def accept(conn: asyncpg.Connection, quote_id: Any, name: str, shown_hash: str, ip: str,
                 user_agent: str) -> QuotePublic:
    row = await _answerable(conn, quote_id)
    if row["status"] == "accepted":
        return await public_view(conn, quote_id)     # idempotent: the first acceptance stands
    if row["status"] != OPEN:
        raise HTTPException(status.HTTP_409_CONFLICT, "This quote has already been answered.")
    if shown_hash != row["content_hash"]:
        raise HTTPException(status.HTTP_409_CONFLICT, "This quote has changed. Reload the page to see it.")
    await conn.execute(
        """update crm_quotes set status = 'accepted', accepted_at = now(), accepted_name = $2, accepted_ip = $3,
                                 accepted_user_agent = $4, accepted_hash = $5, updated_at = now()
            where id = $1""", quote_id, name, ip, user_agent[:400], shown_hash)
    await audit.event(conn, "crm.quote.accept", "crm_quotes", str(quote_id),
                      data={"number": row["number"], "name": name, "ip": ip, "content_hash": shown_hash})
    lead = await conn.fetchrow("select * from crm_leads where id = $1", row["lead_id"])
    await timeline.record(conn, entity_type="lead", entity_id=str(row["lead_id"]), kind="system",
                          body=f"Quote {row['number']} accepted by {name}",
                          payload={"event": "quote_accepted", "number": row["number"]})
    owner = await _tell_owner(conn, row, lead, "Quote accepted",
                              f"{name} accepted quote {row['number']} ({lead['name']})")
    # For a small business an accepted quote is the order: the deal is won.
    if lead["status"] == "open" and owner:
        await leads.mark_won(conn, owner, str(row["lead_id"]))
    return await public_view(conn, quote_id)


async def decline(conn: asyncpg.Connection, quote_id: Any, reason: str) -> QuotePublic:
    row = await _answerable(conn, quote_id)
    if row["status"] == "declined":
        return await public_view(conn, quote_id)
    if row["status"] != OPEN:
        raise HTTPException(status.HTTP_409_CONFLICT, "This quote has already been answered.")
    reason = reason.strip()
    await conn.execute(
        """update crm_quotes set status = 'declined', declined_at = now(), decline_reason = $2, updated_at = now()
            where id = $1""", quote_id, reason or None)
    await audit.event(conn, "crm.quote.decline", "crm_quotes", str(quote_id), data={"number": row["number"]})
    lead = await conn.fetchrow("select * from crm_leads where id = $1", row["lead_id"])
    await timeline.record(conn, entity_type="lead", entity_id=str(row["lead_id"]), kind="system",
                          body=f"Quote {row['number']} declined" + (f": {reason}" if reason else ""),
                          payload={"event": "quote_declined", "number": row["number"]})
    owner = await _tell_owner(conn, row, lead, "Quote declined", f"Quote {row['number']} ({lead['name']})")
    # Not auto-lost: the owner decides, after a follow-up.
    typ = await activities.type_by_code_or_name(conn, "call")
    if typ is not None and owner:
        await activities.create(conn, entity_type="lead", entity_id=str(row["lead_id"]), type_id=str(typ["id"]),
                                due_date=await sequences.local_date(conn, None), created_by=owner,
                                assigned_to=owner, summary=f"Quote {row['number']} declined: follow up",
                                note=reason, automated=True)
    return await public_view(conn, quote_id)


def is_open(r: asyncpg.Record, today: date) -> bool:
    """Sent and still answerable: the only state worth emailing a link for."""
    return bool(r["status"] == OPEN and not _expired(r, today))


def plain_link(r: asyncpg.Record) -> str:
    """The page path, decrypted from the stored copy (never logged or queued)."""
    return link_of(crypto.decrypt(bytes(r["token_enc"]), _aad(r["tenant_id"])))
