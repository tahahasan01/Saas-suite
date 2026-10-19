"""Transmitting sales and returns to FBR, and retrying the ones that did not land.

The rules this module exists to enforce:
- A sale is never lost or blocked because FBR is unreachable. The sale's
  transaction writes a `pending` row in pos_fbr_invoices (an outbox); the
  transmission happens after commit and only ever updates that row.
- Every document is filed exactly once, as the right kind: a sale as a Sale
  Invoice, a return as a Debit Note that references the sale's FBR number —
  so a debit note waits until its sale has been accepted.
- A filing that keeps failing ends in `failed` (and is surfaced), instead of
  sitting in `pending` forever.
"""
from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal

from . import db, fbr

log = logging.getLogger("fbr")

MAX_ATTEMPTS = 8


def _items(lines) -> list[dict]:
    """(product_row, qty, PricedLine) tuples -> the shape fbr.build_payload wants,
    carrying the amounts pricing settled so FBR sees exactly what was charged."""
    return [{
        "name": p["name"],
        "quantity": qty,
        "hs_code": p["hs_code"],
        "fbr_uom": p["fbr_uom"],
        "tax_rate": p["tax_rate"],
        "line_total_minor": pl.total_minor,
        "excl_minor": pl.total_minor - pl.tax_minor,
        "tax_minor": pl.tax_minor,
        "discount_minor": pl.discount_minor,
    } for p, qty, pl in lines]


def _refund_item(name, qty, hs_code, fbr_uom, tax_rate, refund_minor) -> dict:
    """A refund is money the customer paid, so its tax is always inside it."""
    excl, tax = fbr.split_tax(refund_minor, Decimal(str(tax_rate or 0)), True)
    return {"name": name, "quantity": qty, "hs_code": hs_code, "fbr_uom": fbr_uom,
            "tax_rate": tax_rate, "line_total_minor": refund_minor,
            "excl_minor": excl, "tax_minor": tax}


def _debit_note(settings, items: list[dict], original_invoice_number: str, on: date) -> dict:
    payload = fbr.build_payload(settings, items, invoice_date=on)
    payload["invoiceType"] = "Debit Note"
    payload["invoiceRefNo"] = original_invoice_number
    return payload


async def _post(settings, payload: dict) -> fbr.FbrResult:
    """Transmit without ever raising: a dropped connection is just a failed attempt."""
    try:
        return await fbr.post_invoice(settings, payload)
    except Exception as e:  # noqa: BLE001 — any transport failure is retried later
        log.warning("FBR transmission error: %r", e)
        return fbr.FbrResult(ok=False, error_code="transport", error=str(e)[:500])


STALE_CLAIM = "5 minutes"     # a 'sending' row older than this was abandoned mid-flight
WAITING_BACKOFF = "10 minutes"  # a debit note waiting on its sale steps out of the batch

_BUSY = fbr.FbrResult(ok=False, error_code="busy", error="Already being filed")


async def _claim(conn, row_id) -> bool:
    """Take the row for this worker. Must commit before transmitting, so any
    concurrent worker sees the claim and skips the row."""
    return await conn.fetchval(
        f"""update pos_fbr_invoices
               set status = 'sending', claimed_at = now()
             where id = $1
               and (status = 'pending'
                    or (status = 'sending' and claimed_at < now() - interval '{STALE_CLAIM}'))
         returning true""", row_id) is not None


async def _record_attempt(conn, row_id, result: fbr.FbrResult) -> None:
    """The one place an attempt is written: status, number, error, attempt count,
    and the move to `failed` once the attempts are used up. Only applies to a
    row this worker holds, so it can never overwrite a filed document."""
    await conn.execute(
        """update pos_fbr_invoices
              set status = case when $2 then 'submitted'
                                when attempts + 1 >= $6 then 'failed'
                                else 'pending' end,
                  fbr_invoice_number = coalesce($3, fbr_invoice_number),
                  error_code = $4, error = $5, claimed_at = null,
                  attempts = attempts + 1, last_attempt_at = now()
            where id = $1 and status = 'sending'""",
        row_id, result.ok, result.invoice_number, result.error_code, result.error, MAX_ATTEMPTS)


async def enqueue_sale(conn, tenant_id: str, sale_id: str) -> None:
    """Called inside the sale's transaction."""
    await conn.execute(
        """insert into pos_fbr_invoices (tenant_id, sale_id, status, attempts)
           values ($1, $2, 'pending', 0)
           on conflict (sale_id) where return_id is null do nothing""",
        tenant_id, sale_id)


async def enqueue_return(conn, tenant_id: str, sale_id: str, return_id: str) -> None:
    """Called inside the return's transaction."""
    await conn.execute(
        """insert into pos_fbr_invoices (tenant_id, sale_id, return_id, status, attempts)
           values ($1, $2, $3, 'pending', 0)
           on conflict (return_id) where return_id is not null do nothing""",
        tenant_id, sale_id, return_id)


async def submit_sale(tenant_id: str, sale_id: str, settings, lines) -> fbr.FbrResult:
    """Transmit one freshly committed sale. Never raises."""
    payload = fbr.build_payload(settings, _items(lines), invoice_date=date.today())
    async with db.tenant_conn(tenant_id) as conn:
        row_id = await conn.fetchval(
            "select id from pos_fbr_invoices where sale_id=$1 and return_id is null", sale_id)
        claimed = await _claim(conn, row_id)
    if not claimed:
        return _BUSY
    result = await _post(settings, payload)
    async with db.tenant_conn(tenant_id) as conn:
        await _record_attempt(conn, row_id, result)
    if not result.ok:
        log.warning("FBR sale %s not filed (%s): %s", sale_id, result.error_code, result.error)
    return result


async def submit_return(tenant_id: str, return_id: str, settings, lines,
                        original_invoice_number: str) -> fbr.FbrResult:
    """File a just-committed return as a Debit Note. Only called once the
    original sale was accepted. `lines` are (sale_item_row, qty, line_refund_minor)."""
    items = [_refund_item(row["name"], qty, row["hs_code"], row["fbr_uom"], row["tax_rate"], line_refund)
             for row, qty, line_refund in lines]
    payload = _debit_note(settings, items, original_invoice_number, date.today())
    async with db.tenant_conn(tenant_id) as conn:
        row_id = await conn.fetchval("select id from pos_fbr_invoices where return_id=$1", return_id)
        claimed = await _claim(conn, row_id)
    if not claimed:
        return _BUSY
    result = await _post(settings, payload)
    async with db.tenant_conn(tenant_id) as conn:
        await _record_attempt(conn, row_id, result)
    if not result.ok:
        log.warning("FBR debit note for return %s not filed (%s): %s",
                    return_id, result.error_code, result.error)
    return result


async def _sale_payload(conn, cfg, row) -> dict:
    lines = await conn.fetch(
        """select i.name, i.qty, i.total_minor, i.tax_minor, i.discount_minor,
                  coalesce(p.hs_code, '') as hs_code,
                  coalesce(p.tax_rate, 0) as tax_rate,
                  coalesce(p.fbr_uom, 'Numbers, pieces, units') as fbr_uom
             from pos_sale_items i
             left join pos_products p on p.id = i.product_id
            where i.sale_id = $1""", row["sale_id"])
    sale_date = await conn.fetchval("select created_at::date from pos_sales where id=$1", row["sale_id"])
    return fbr.build_payload(
        cfg, [{"name": l["name"], "quantity": float(l["qty"]), "hs_code": l["hs_code"],
               "fbr_uom": l["fbr_uom"], "tax_rate": l["tax_rate"],
               "line_total_minor": l["total_minor"], "excl_minor": l["total_minor"] - l["tax_minor"],
               "tax_minor": l["tax_minor"], "discount_minor": l["discount_minor"]} for l in lines],
        invoice_date=sale_date or date.today())


async def _return_payload(conn, cfg, row, original: str) -> dict:
    lines = await conn.fetch(
        """select ri.name, ri.qty, ri.line_refund_minor,
                  coalesce(p.hs_code, '') as hs_code,
                  coalesce(p.tax_rate, 0) as tax_rate,
                  coalesce(p.fbr_uom, 'Numbers, pieces, units') as fbr_uom
             from pos_return_items ri
             left join pos_products p on p.id = ri.product_id
            where ri.return_id = $1""", row["return_id"])
    return_date = await conn.fetchval("select created_at::date from pos_returns where id=$1", row["return_id"])
    items = [_refund_item(l["name"], float(l["qty"]), l["hs_code"], l["fbr_uom"], l["tax_rate"],
                          l["line_refund_minor"]) for l in lines]
    return _debit_note(cfg, items, original, return_date or date.today())


async def _prepare(conn, cfg, row) -> dict | None:
    """Claim the row and build what to send, or None to skip it this run.

    A debit note needs its sale's FBR number: if the sale was given up on, the
    note can never be filed and is failed now; if the sale simply isn't filed
    yet, the note steps out of the batch for a while instead of occupying it.
    """
    if row["return_id"] is not None:
        sale = await conn.fetchrow(
            """select status, fbr_invoice_number from pos_fbr_invoices
                where sale_id=$1 and return_id is null""", row["sale_id"])
        if sale is None or sale["status"] == "failed":
            await conn.execute(
                """update pos_fbr_invoices
                      set status = 'failed', error_code = 'blocked',
                          error = 'The sale this return refers to was never filed with FBR'
                    where id = $1 and status = 'pending'""", row["id"])
            return None
        if sale["status"] != "submitted" or not sale["fbr_invoice_number"]:
            await conn.execute(
                f"""update pos_fbr_invoices set next_attempt_at = now() + interval '{WAITING_BACKOFF}'
                     where id = $1 and status = 'pending'""", row["id"])
            return None
    if not await _claim(conn, row["id"]):
        return None  # another worker holds it
    if row["return_id"] is None:
        return await _sale_payload(conn, cfg, row)
    return await _return_payload(conn, cfg, row, sale["fbr_invoice_number"])


async def retry_pending() -> int:
    """Re-send documents FBR never accepted. Runs on the scheduler.

    Each row is claimed in a short committed transaction, transmitted with no
    transaction open, then recorded — so overlapping runs, or a run overlapping
    the post-sale attempt, never file the same document twice. Sales go before
    returns so a debit note queued behind its own sale is filed in the same
    pass. Crosses tenants, so it reads through the owner pool and then does the
    work tenant-by-tenant under RLS.
    """
    async with db.owner_conn() as conn:
        due = await conn.fetch(
            f"""select f.id, f.tenant_id, f.sale_id, f.return_id
                 from pos_fbr_invoices f
                where f.attempts < $1
                  and ((f.status = 'pending' and f.next_attempt_at <= now())
                       or (f.status = 'sending' and f.claimed_at < now() - interval '{STALE_CLAIM}'))
                order by (f.return_id is not null), f.created_at
                limit 100""", MAX_ATTEMPTS)
    sent = 0
    for row in due:
        tenant_id = str(row["tenant_id"])
        async with db.tenant_conn(tenant_id) as conn:
            cfg = await conn.fetchrow("select * from fbr_settings where tenant_id=$1", tenant_id)
            if not cfg or not cfg["enabled"]:
                continue
            payload = await _prepare(conn, cfg, row)
        if payload is None:
            continue
        result = await _post(cfg, payload)
        async with db.tenant_conn(tenant_id) as conn:
            await _record_attempt(conn, row["id"], result)
        if result.ok:
            sent += 1
        else:
            log.warning("FBR retry for %s %s failed (%s): %s",
                        "return" if row["return_id"] else "sale",
                        row["return_id"] or row["sale_id"], result.error_code, result.error)

    if due:
        log.info("FBR retry: %d/%d filed", sent, len(due))
    return sent
