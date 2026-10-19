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

from . import db, fbr

log = logging.getLogger("fbr")

MAX_ATTEMPTS = 8


def _items(lines) -> list[dict]:
    """(product_row, qty, line_total_minor) tuples -> the shape fbr.build_payload wants."""
    return [{
        "name": p["name"],
        "quantity": qty,
        "hs_code": p["hs_code"],
        "fbr_uom": p["fbr_uom"],
        "tax_rate": p["tax_rate"],
        "line_total_minor": line_total,
    } for p, qty, line_total in lines]


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


async def _record_attempt(conn, row_id, result: fbr.FbrResult) -> None:
    """The one place an attempt is written: status, number, error, attempt count,
    and the move to `failed` once the attempts are used up."""
    await conn.execute(
        """update pos_fbr_invoices
              set status = case when $2 then 'submitted'
                                when attempts + 1 >= $6 then 'failed'
                                else 'pending' end,
                  fbr_invoice_number = coalesce($3, fbr_invoice_number),
                  error_code = $4, error = $5,
                  attempts = attempts + 1, last_attempt_at = now()
            where id = $1""",
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
    result = await _post(settings, payload)
    async with db.tenant_conn(tenant_id) as conn:
        row_id = await conn.fetchval(
            "select id from pos_fbr_invoices where sale_id=$1 and return_id is null", sale_id)
        await _record_attempt(conn, row_id, result)
    if not result.ok:
        log.warning("FBR sale %s not filed (%s): %s", sale_id, result.error_code, result.error)
    return result


async def submit_return(tenant_id: str, return_id: str, settings, lines,
                        original_invoice_number: str) -> fbr.FbrResult:
    """File a just-committed return as a Debit Note. Only called once the
    original sale was accepted. `lines` are (sale_item_row, qty, line_refund_minor)."""
    items = [{
        "name": row["name"],
        "quantity": qty,
        "hs_code": row["hs_code"],
        "fbr_uom": row["fbr_uom"],
        "tax_rate": row["tax_rate"],
        "line_total_minor": line_refund,
    } for row, qty, line_refund in lines]
    result = await _post(settings, _debit_note(settings, items, original_invoice_number, date.today()))
    async with db.tenant_conn(tenant_id) as conn:
        row_id = await conn.fetchval("select id from pos_fbr_invoices where return_id=$1", return_id)
        await _record_attempt(conn, row_id, result)
    if not result.ok:
        log.warning("FBR debit note for return %s not filed (%s): %s",
                    return_id, result.error_code, result.error)
    return result


async def _retry_sale(conn, cfg, row) -> fbr.FbrResult:
    lines = await conn.fetch(
        """select i.name, i.qty, i.line_total_minor,
                  coalesce(p.hs_code, '') as hs_code,
                  coalesce(p.tax_rate, 0) as tax_rate,
                  coalesce(p.fbr_uom, 'Numbers, pieces, units') as fbr_uom
             from pos_sale_items i
             left join pos_products p on p.id = i.product_id
            where i.sale_id = $1""", row["sale_id"])
    sale_date = await conn.fetchval("select created_at::date from pos_sales where id=$1", row["sale_id"])
    payload = fbr.build_payload(
        cfg, [{"name": l["name"], "quantity": float(l["qty"]), "hs_code": l["hs_code"],
               "fbr_uom": l["fbr_uom"], "tax_rate": l["tax_rate"],
               "line_total_minor": l["line_total_minor"]} for l in lines],
        invoice_date=sale_date or date.today())
    return await _post(cfg, payload)


async def _retry_return(conn, cfg, row) -> fbr.FbrResult | None:
    """None means "not yet": the sale this note references has no FBR number."""
    original = await conn.fetchval(
        """select fbr_invoice_number from pos_fbr_invoices
            where sale_id=$1 and return_id is null and status='submitted'""", row["sale_id"])
    if not original:
        return None
    lines = await conn.fetch(
        """select ri.name, ri.qty, ri.line_refund_minor,
                  coalesce(p.hs_code, '') as hs_code,
                  coalesce(p.tax_rate, 0) as tax_rate,
                  coalesce(p.fbr_uom, 'Numbers, pieces, units') as fbr_uom
             from pos_return_items ri
             left join pos_products p on p.id = ri.product_id
            where ri.return_id = $1""", row["return_id"])
    return_date = await conn.fetchval("select created_at::date from pos_returns where id=$1", row["return_id"])
    items = [{"name": l["name"], "quantity": float(l["qty"]), "hs_code": l["hs_code"],
              "fbr_uom": l["fbr_uom"], "tax_rate": l["tax_rate"],
              "line_total_minor": l["line_refund_minor"]} for l in lines]
    return await _post(cfg, _debit_note(cfg, items, original, return_date or date.today()))


async def retry_pending() -> int:
    """Re-send documents FBR never accepted. Runs on the scheduler.

    Sales go before returns so that a debit note queued behind its own sale can
    be filed in the same pass. Crosses tenants, so it reads through the owner
    pool and then does the work tenant-by-tenant under RLS.
    """
    async with db.owner_conn() as conn:
        due = await conn.fetch(
            """select f.id, f.tenant_id, f.sale_id, f.return_id
                 from pos_fbr_invoices f
                where f.status = 'pending' and f.attempts < $1
                order by (f.return_id is not null), f.created_at
                limit 100""", MAX_ATTEMPTS)
    sent = 0
    for row in due:
        tenant_id = str(row["tenant_id"])
        async with db.tenant_conn(tenant_id) as conn:
            cfg = await conn.fetchrow("select * from fbr_settings where tenant_id=$1", tenant_id)
            if not cfg or not cfg["enabled"]:
                continue
            if row["return_id"] is None:
                result = await _retry_sale(conn, cfg, row)
            else:
                result = await _retry_return(conn, cfg, row)
                if result is None:
                    continue  # its sale isn't filed yet; not an attempt
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
