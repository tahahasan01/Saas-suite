"""Transmitting sales to FBR, and retrying the ones that did not land.

The rule this module exists to enforce: a sale is never lost or blocked because
FBR is unreachable. The sale commits first; transmission is recorded separately
in pos_fbr_invoices and retried until it succeeds.
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


async def _record(conn, tenant_id: str, sale_id: str, result: fbr.FbrResult) -> None:
    await conn.execute(
        """insert into pos_fbr_invoices (tenant_id, sale_id, status, fbr_invoice_number,
                                         error_code, error, attempts, last_attempt_at)
           values ($1,$2,$3,$4,$5,$6,1, now())
           on conflict (sale_id) do update
             set status = excluded.status,
                 fbr_invoice_number = excluded.fbr_invoice_number,
                 error_code = excluded.error_code,
                 error = excluded.error,
                 attempts = pos_fbr_invoices.attempts + 1,
                 last_attempt_at = now()""",
        tenant_id, sale_id, "submitted" if result.ok else "pending",
        result.invoice_number, result.error_code, result.error)


async def submit_sale(tenant_id: str, sale_id: str, settings, lines) -> fbr.FbrResult:
    """Transmit one sale. Returns the result; never raises."""
    payload = fbr.build_payload(settings, _items(lines), invoice_date=date.today())
    result = await fbr.post_invoice(settings, payload)
    async with db.tenant_conn(tenant_id) as conn:
        await _record(conn, tenant_id, sale_id, result)
    if not result.ok:
        log.warning("FBR sale %s not filed (%s): %s", sale_id, result.error_code, result.error)
    return result


async def retry_pending() -> int:
    """Re-send invoices FBR never accepted. Runs on the scheduler.

    Crosses tenants, so it reads through the owner pool and then does the work
    tenant-by-tenant under RLS.
    """
    async with db.owner_conn() as conn:
        due = await conn.fetch(
            f"""select f.id, f.tenant_id, f.sale_id
                  from pos_fbr_invoices f
                 where f.status = 'pending' and f.attempts < {MAX_ATTEMPTS}
                 order by f.created_at limit 100""")
    sent = 0
    for row in due:
        tenant_id = str(row["tenant_id"])
        async with db.tenant_conn(tenant_id) as conn:
            cfg = await conn.fetchrow("select * from fbr_settings where tenant_id=$1", tenant_id)
            if not cfg or not cfg["enabled"]:
                continue
            lines = await conn.fetch(
                """select i.name, i.qty, i.line_total_minor,
                          coalesce(p.hs_code, '') as hs_code,
                          coalesce(p.tax_rate, 0) as tax_rate,
                          coalesce(p.fbr_uom, 'Numbers, pieces, units') as fbr_uom
                     from pos_sale_items i
                     left join pos_products p on p.id = i.product_id
                    where i.sale_id = $1""", row["sale_id"])
            sale_date = await conn.fetchval(
                "select created_at::date from pos_sales where id=$1", row["sale_id"])

        payload = fbr.build_payload(
            cfg, [{"name": l["name"], "quantity": float(l["qty"]), "hs_code": l["hs_code"],
                   "fbr_uom": l["fbr_uom"], "tax_rate": l["tax_rate"],
                   "line_total_minor": l["line_total_minor"]} for l in lines],
            invoice_date=sale_date or date.today())
        result = await fbr.post_invoice(cfg, payload)
        async with db.tenant_conn(tenant_id) as conn:
            await _record(conn, tenant_id, str(row["sale_id"]), result)
        if result.ok:
            sent += 1

    if due:
        log.info("FBR retry: %d/%d filed", sent, len(due))
    return sent
