"""Filing sales and returns with FBR through the outbox (D-09, migration 0035).

The rules this module exists to enforce:
- A sale is never lost or blocked because FBR is unreachable. The sale's
  transaction writes its filing record (pos_fbr_invoices) and an `outbox` row
  holding the frozen FBR document; transmission happens after commit.
- Every document is filed exactly once, as the right kind: a sale as a Sale
  Invoice (fbr.submit_sale), a return as a Debit Note (fbr.submit_debit_note)
  that references the sale's FBR number — so a debit note waits until its
  sale is done.
- A row is claimed (`sending`, attempts + 1) in its own committed statement
  before it is transmitted, so the post-sale fast path and any number of
  worker runs can never send the same row twice.
- A failed attempt waits (exponential back-off with jitter) and after
  max_attempts the row is `failed` for good, and the owners are alerted.
- A request that may have reached FBR without an answer is `unknown`. FBR has
  no idempotency key, so it is never resent blindly: it is reconciled first
  (our own record, then fbr.lookup_invoice, else an owner settles it by hand).

The FBR document is built from the sale lines' snapshots (0034), never from
the current product. The seller's own registration details (NTN, name,
address, sandbox scenario) are applied from settings at transmission, so a
seller who corrects a typo after a rejection is filed with the correction.

Outbox state moves happen on the owner connection (the runtime role may only
insert and read outbox rows); the filing record is updated in the same
transaction, so a recorded FBR number and `done` can never disagree.
"""
from __future__ import annotations

import logging
import random
from datetime import date
from decimal import Decimal

from . import db, fbr, notifications

log = logging.getLogger("fbr")

KIND_SALE = "fbr.submit_sale"
KIND_DEBIT_NOTE = "fbr.submit_debit_note"

MAX_ATTEMPTS = 10                  # with the back-off below, about a day of trying
BACKOFF_BASE_S = 60
BACKOFF_CAP_S = 6 * 3600
LOCK_FOR = "5 minutes"             # a 'sending' row past this was abandoned mid-flight
WAITING_FOR_SALE = "10 minutes"    # a debit note whose sale isn't filed yet steps aside
BATCH = 50
MAX_PASSES = 5                     # a debit note queued behind its own sale goes in the same run

BUSY = fbr.FbrResult(ok=False, error_code="busy", error="Already being filed, or not due yet")
BLOCKED = fbr.FbrResult(ok=False, error_code="blocked",
                        error="The sale this return refers to was never filed with FBR")

# Outbox status -> what the shop sees on the filing record.
_FILING_STATUS = {"done": "submitted", "retry": "pending", "pending": "pending",
                  "unknown": "unknown", "failed": "failed"}


def backoff_seconds(attempts: int, jitter: float | None = None) -> float:
    """Delay before the next try after `attempts` tries: 1, 2, 4 … minutes,
    capped at 6 h, jittered ±20% so a recovered FBR isn't hit by every
    queued row at once."""
    j = random.uniform(0.8, 1.2) if jitter is None else jitter
    return min(BACKOFF_CAP_S, BACKOFF_BASE_S * 2 ** max(attempts - 1, 0)) * j


def status_after(result: fbr.FbrResult) -> str:
    """The filing status to show right after an attempt (or a skipped one)."""
    if result.ok:
        return "submitted"
    if result.maybe_delivered:
        return "unknown"
    return "failed" if result is BLOCKED else "pending"


# ── Documents (from the line snapshots only) ────────────────────────────────
def _refund_item(name, qty, hs_code, fbr_uom, tax_rate, refund_minor) -> dict:
    """A refund is money the customer paid, so its tax is always inside it."""
    excl, tax = fbr.split_tax(refund_minor, Decimal(str(tax_rate or 0)), True)
    return {"name": name, "quantity": qty, "hs_code": hs_code, "fbr_uom": fbr_uom,
            "tax_rate": tax_rate, "line_total_minor": refund_minor,
            "excl_minor": excl, "tax_minor": tax}


async def _sale_document(conn, cfg, sale_id) -> dict:
    """The Sale Invoice, from the lines' sale-time snapshots (0034) — never
    the product as it is now, so editing a product cannot change a filing."""
    lines = await conn.fetch(
        """select name, qty, total_minor, tax_minor, discount_minor, excl_minor,
                  hs_code, tax_rate, fbr_uom
             from pos_sale_items where sale_id = $1 order by id""", sale_id)
    # created_at::date is the sale's local day: tenant_conn runs in the tenant's zone.
    sale_date = await conn.fetchval("select created_at::date from pos_sales where id=$1", sale_id)
    return fbr.build_payload(
        cfg, [{"name": l["name"], "quantity": float(l["qty"]), "hs_code": l["hs_code"],
               "fbr_uom": l["fbr_uom"], "tax_rate": l["tax_rate"],
               "line_total_minor": l["total_minor"], "excl_minor": l["excl_minor"],
               "tax_minor": l["tax_minor"], "discount_minor": l["discount_minor"]} for l in lines],
        invoice_date=sale_date or date.today())


async def _debit_note_document(conn, cfg, return_id) -> dict:
    """The Debit Note, classified from the sold lines' snapshots. Its
    invoiceRefNo (the sale's FBR number) is filled in at transmission."""
    lines = await conn.fetch(
        """select ri.name, ri.qty, ri.line_refund_minor, si.hs_code, si.tax_rate, si.fbr_uom
             from pos_return_items ri
             join pos_sale_items si on si.id = ri.sale_item_id
            where ri.return_id = $1 order by ri.id""", return_id)
    return_date = await conn.fetchval("select created_at::date from pos_returns where id=$1", return_id)
    items = [_refund_item(l["name"], float(l["qty"]), l["hs_code"], l["fbr_uom"], l["tax_rate"],
                          l["line_refund_minor"]) for l in lines]
    doc = fbr.build_payload(cfg, items, invoice_date=return_date or date.today())
    doc["invoiceType"] = "Debit Note"
    return doc


def _for_transmission(doc: dict, cfg, invoice_ref_no: str | None) -> dict:
    out = {**doc,
           "sellerNTNCNIC": cfg["seller_ntn_cnic"],
           "sellerBusinessName": cfg["seller_business_name"],
           "sellerProvince": cfg["seller_province"],
           "sellerAddress": cfg["seller_address"]}
    out.pop("scenarioId", None)
    if cfg["environment"] == "sandbox":
        out["scenarioId"] = fbr.SANDBOX_SCENARIO
    if invoice_ref_no is not None:
        out["invoiceRefNo"] = invoice_ref_no
    return out


# ── Enqueue (inside the business transaction) ───────────────────────────────
async def _enqueue(conn, tenant_id, kind, key, payload, fbr_invoice_id, depends_on=None) -> int:
    outbox_id = await conn.fetchval(
        """insert into outbox (tenant_id, kind, dedup_key, payload, max_attempts, depends_on)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (tenant_id, kind, dedup_key) do nothing returning id""",
        tenant_id, kind, key, payload, MAX_ATTEMPTS, depends_on)
    if outbox_id is None:  # already queued: the dedup key holds it to one row
        outbox_id = await conn.fetchval(
            "select id from outbox where kind=$1 and dedup_key=$2", kind, key)
    await conn.execute("update pos_fbr_invoices set outbox_id=$2 where id=$1", fbr_invoice_id, outbox_id)
    return outbox_id


async def enqueue_sale(conn, tenant_id: str, sale_id: str, cfg) -> int:
    """Called inside the sale's transaction, after its lines are written.
    Returns the outbox row id for the post-commit fast path."""
    fbr_id = await conn.fetchval(
        """insert into pos_fbr_invoices (tenant_id, sale_id, status, attempts)
           values ($1, $2, 'pending', 0)
           on conflict (sale_id) where return_id is null do nothing returning id""",
        tenant_id, sale_id)
    if fbr_id is None:
        fbr_id = await conn.fetchval(
            "select id from pos_fbr_invoices where sale_id=$1 and return_id is null", sale_id)
    doc = await _sale_document(conn, cfg, sale_id)
    return await _enqueue(conn, tenant_id, KIND_SALE, str(sale_id),
                          {"fbr_invoice_id": str(fbr_id), "sale_id": str(sale_id),
                           "return_id": None, "document": doc}, fbr_id)


async def enqueue_return(conn, tenant_id: str, sale_id: str, return_id: str, cfg) -> int:
    """Called inside the return's transaction, after its lines are written."""
    fbr_id = await conn.fetchval(
        """insert into pos_fbr_invoices (tenant_id, sale_id, return_id, status, attempts)
           values ($1, $2, $3, 'pending', 0)
           on conflict (return_id) where return_id is not null do nothing returning id""",
        tenant_id, sale_id, return_id)
    if fbr_id is None:
        fbr_id = await conn.fetchval("select id from pos_fbr_invoices where return_id=$1", return_id)
    # Null for a sale filed before the outbox existed: the note can go at once.
    sale_row = await conn.fetchval(
        "select id from outbox where kind=$1 and dedup_key=$2", KIND_SALE, str(sale_id))
    doc = await _debit_note_document(conn, cfg, return_id)
    return await _enqueue(conn, tenant_id, KIND_DEBIT_NOTE, str(return_id),
                          {"fbr_invoice_id": str(fbr_id), "sale_id": str(sale_id),
                           "return_id": str(return_id), "document": doc}, fbr_id, sale_row)


# ── Claiming and settling (owner connection) ────────────────────────────────
_CLAIM = f"""
with due as (
    select o.id from outbox o
     where o.status in ('pending', 'retry') and o.run_after <= now()
       and o.kind like 'fbr.%'
       and ($2::bigint is null or o.id = $2)
       and (o.depends_on is null
            or exists (select 1 from outbox d where d.id = o.depends_on and d.status = 'done'))
       and exists (select 1 from fbr_settings s where s.tenant_id = o.tenant_id and s.enabled)
     order by o.run_after, o.id
     limit $1
     for update of o skip locked)
update outbox o
   set status = 'sending', attempts = o.attempts + 1,
       locked_until = now() + interval '{LOCK_FOR}', updated_at = now()
  from due
 where o.id = due.id
returning o.*"""


async def _claim(limit: int, only_id: int | None = None) -> list:
    """Take due rows for this worker, committed before anything is sent, so a
    concurrent worker skips them. attempts is counted here, on the row."""
    async with db.owner_conn() as oc:
        return await oc.fetch(_CLAIM, limit, only_id)


async def _mirror(oc, payload, status: str, *, number=None, code="", error="", attempts=None) -> None:
    """Keep the shop-facing filing record in step with its outbox row."""
    await oc.execute(
        """update pos_fbr_invoices
              set status = $2, fbr_invoice_number = coalesce($3, fbr_invoice_number),
                  error_code = $4, error = $5, attempts = coalesce($6, attempts),
                  last_attempt_at = case when $6::int is null then last_attempt_at else now() end,
                  claimed_at = null
            where id = $1::uuid""",
        payload["fbr_invoice_id"], status, number, code, error, attempts)


async def _settle(row, result: fbr.FbrResult, *, frozen: dict | None = None,
                  terminal: bool = False) -> str | None:
    """Record one attempt on a row this worker holds: the outcome, the FBR
    number, the error, the next try. Returns the new status, or None if the
    row was no longer ours (then nothing is touched)."""
    if result.ok:
        status = "done"
    elif result.maybe_delivered:
        status = "unknown"
    elif terminal or row["attempts"] >= row["max_attempts"]:
        status = "failed"
    else:
        status = "retry"
    wait = backoff_seconds(row["attempts"]) if status == "retry" else 0.0
    async with db.owner_conn() as oc, oc.transaction():
        held = await oc.fetchval(
            """update outbox
                  set status = $2,
                      run_after = case when $2 = 'retry' then now() + make_interval(secs => $3)
                                       else run_after end,
                      locked_until = null, last_error_code = $4, last_error = $5,
                      result = case when $6::text is null then result
                                    else jsonb_build_object('invoice_number', $6::text) end,
                      payload = case when $7::jsonb is null then payload
                                     else payload || jsonb_build_object('document', $7::jsonb,
                                                                        'rebuilt', true) end,
                      updated_at = now()
                where id = $1 and status = 'sending'
            returning id""",
            row["id"], status, wait, result.error_code, result.error,
            result.invoice_number if result.ok else None, frozen)
        if held is None:
            return None
        await _mirror(oc, row["payload"], _FILING_STATUS[status],
                      number=result.invoice_number if result.ok else None,
                      code=result.error_code, error=result.error, attempts=row["attempts"])
    if status in ("failed", "unknown"):
        await _alert(row, status, result.error)
    return status


async def _release(row) -> None:
    """Hand back a claimed debit note whose sale isn't filed yet, without
    counting the attempt."""
    async with db.owner_conn() as oc:
        await oc.execute(
            f"""update outbox
                   set status = 'retry', attempts = greatest(attempts - 1, 0),
                       run_after = now() + interval '{WAITING_FOR_SALE}',
                       locked_until = null, updated_at = now()
                 where id = $1 and status = 'sending'""", row["id"])


async def _alert(row, status: str, error: str) -> None:
    """Tell the tenant's owners, once per row, that a filing needs a person.
    Never raises: an alert must not stop the worker."""
    try:
        async with db.owner_conn() as oc:
            first = await oc.fetchval(
                "update outbox set alerted_at = now() where id = $1 and alerted_at is null returning id",
                row["id"])
        if first is None:
            return
        what = "return" if row["kind"] == KIND_DEBIT_NOTE else "sale"
        if status == "failed":
            title = f"FBR filing failed for a {what}"
            body = f"FBR did not accept it ({error or 'no reason given'}). Check Settings → FBR."
        else:
            title = f"FBR may not have received a {what}"
            body = ("The connection dropped before FBR answered. Look it up in IRIS: record its FBR "
                    "number if it is there, or mark it not filed to send it again.")
        tenant_id = str(row["tenant_id"])
        async with db.tenant_conn(tenant_id) as conn:
            owners = await conn.fetch(
                """select u.id from users u join roles r on r.id = u.role_id
                    where r.name = 'Owner' and u.status = 'active'""")
            for u in owners:
                await notifications.create(conn, user_id=str(u["id"]), kind="error",
                                           title=title, body=body, link="/settings/fbr")
    except Exception:  # noqa: BLE001
        log.exception("could not alert owners about outbox row %s", row["id"])


# ── Delivery ────────────────────────────────────────────────────────────────
async def _post(settings, payload: dict) -> fbr.FbrResult:
    """Transmit without ever raising: a dropped connection is just a failed attempt."""
    try:
        return await fbr.post_invoice(settings, payload)
    except Exception as e:  # noqa: BLE001 — any transport failure is retried later
        log.warning("FBR transmission error: %r", e)
        return fbr.FbrResult(ok=False, error_code="transport", error=str(e)[:500])


async def _deliver(row) -> fbr.FbrResult:
    """Send one claimed row and record the outcome."""
    payload = row["payload"]
    tenant_id = str(row["tenant_id"])
    try:
        async with db.tenant_conn(tenant_id) as conn:
            cfg = await conn.fetchrow("select * from fbr_settings where tenant_id=$1", tenant_id)
            doc = payload.get("document")
            rebuilt = doc is None   # backfilled row: built once from the snapshots, then frozen
            if rebuilt:
                doc = (await _sale_document(conn, cfg, payload["sale_id"]) if row["kind"] == KIND_SALE
                       else await _debit_note_document(conn, cfg, payload["return_id"]))
            ref = None
            if row["kind"] == KIND_DEBIT_NOTE:
                sale = await conn.fetchrow(
                    """select status, fbr_invoice_number from pos_fbr_invoices
                        where sale_id=$1 and return_id is null""", payload["sale_id"])
                if sale is None or sale["status"] == "failed":
                    await _settle(row, BLOCKED, terminal=True)
                    return BLOCKED
                if sale["status"] != "submitted" or not sale["fbr_invoice_number"]:
                    await _release(row)
                    return BUSY
                ref = sale["fbr_invoice_number"]
        to_send = _for_transmission(doc, cfg, ref)
    except Exception as e:  # noqa: BLE001 — nothing was sent: an ordinary failed attempt
        log.exception("could not prepare outbox row %s", row["id"])
        result = fbr.FbrResult(ok=False, error_code="internal", error=str(e)[:500])
        await _settle(row, result)
        return result

    result = await _post(cfg, to_send)
    await _settle(row, result, frozen=doc if rebuilt else None)
    if not result.ok:
        log.warning("FBR %s %s not filed (%s): %s", row["kind"], row["dedup_key"],
                    result.error_code, result.error)
    return result


async def deliver_now(outbox_id: int) -> fbr.FbrResult:
    """The post-commit fast path for a document just recorded: the same claim
    and handler as the worker, for this one row. Never raises."""
    try:
        rows = await _claim(1, outbox_id)
        if not rows:
            return BUSY
        return await _deliver(rows[0])
    except Exception:  # noqa: BLE001 — the row stays queued for the worker
        log.exception("fast-path delivery of outbox row %s failed", outbox_id)
        return BUSY


# ── Housekeeping: abandoned sends, unknown rows, orphaned debit notes ───────
async def _reap() -> None:
    """A row still 'sending' past its lock was abandoned by a worker that died
    mid-flight. FBR may have it, so it is unknown, not retried."""
    async with db.owner_conn() as oc, oc.transaction():
        rows = await oc.fetch(
            """update outbox
                  set status = 'unknown', locked_until = null, last_error_code = 'abandoned',
                      last_error = 'The worker stopped mid-transmission; FBR may have received it',
                      updated_at = now()
                where status = 'sending' and locked_until < now() and kind like 'fbr.%'
            returning *""")
        for r in rows:
            await _mirror(oc, r["payload"], "unknown", code=r["last_error_code"], error=r["last_error"])
    for r in rows:
        await _alert(r, "unknown", r["last_error"])


async def _block_orphans() -> None:
    """A debit note whose sale will never be filed can never be filed either."""
    async with db.owner_conn() as oc, oc.transaction():
        rows = await oc.fetch(
            """update outbox n
                  set status = 'failed', last_error_code = $1, last_error = $2, updated_at = now()
                where n.kind = 'fbr.submit_debit_note' and n.status in ('pending', 'retry')
                  and exists (select 1 from outbox s
                               where s.id = n.depends_on and s.status in ('failed', 'cancelled'))
            returning *""", BLOCKED.error_code, BLOCKED.error)
        for r in rows:
            await _mirror(oc, r["payload"], "failed", code=BLOCKED.error_code, error=BLOCKED.error)
    for r in rows:
        await _alert(r, "failed", BLOCKED.error)


async def _settle_unknown(outbox_id: int, tenant_id: str, *, filed: bool,
                          invoice_number: str | None = None, how: str) -> bool:
    """Close an unknown row: filed (record FBR's number, never resend) or not
    filed (due now for one more send). False if the row isn't unknown."""
    async with db.owner_conn() as oc, oc.transaction():
        row = await oc.fetchrow(
            """update outbox
                  set status = case when $3 then 'done' else 'retry' end,
                      run_after = now(), locked_until = null, alerted_at = null,
                      result = case when $3 then jsonb_build_object('invoice_number', $4::text,
                                                                    'reconciled', $5::text)
                                    else result end,
                      last_error_code = case when $3 then '' else 'not_filed' end,
                      last_error = case when $3 then '' else 'Confirmed not received by FBR (' || $5 || ')' end,
                      updated_at = now()
                where id = $1 and tenant_id = $2::uuid and status = 'unknown'
            returning payload""", outbox_id, tenant_id, filed, invoice_number, how)
        if row is None:
            return False
        await _mirror(oc, row["payload"], "submitted" if filed else "pending", number=invoice_number)
    return True


async def _reconcile() -> None:
    """Unknown rows, before anything is resent: our own record first (a number
    already stored), then FBR's lookup. If neither can tell, the row stays
    unknown and an owner settles it (resolve_unknown)."""
    async with db.owner_conn() as oc:
        rows = await oc.fetch(
            "select * from outbox where status = 'unknown' and kind like 'fbr.%' order by id limit 100")
    for row in rows:
        tenant_id = str(row["tenant_id"])
        try:
            async with db.tenant_conn(tenant_id) as conn:
                number = await conn.fetchval(
                    "select fbr_invoice_number from pos_fbr_invoices where id=$1::uuid",
                    row["payload"]["fbr_invoice_id"])
                cfg = await conn.fetchrow("select * from fbr_settings where tenant_id=$1", tenant_id)
            if number:
                found = fbr.LookupResult(status="found", invoice_number=number)
            elif cfg is None:
                found = fbr.LookupResult(status="unsupported")
            else:
                found = await fbr.lookup_invoice(cfg, row["payload"].get("document") or {})
        except Exception:  # noqa: BLE001 — try again next run
            log.exception("could not reconcile outbox row %s", row["id"])
            continue
        if found.status == "found" and found.invoice_number:
            await _settle_unknown(row["id"], tenant_id, filed=True,
                                  invoice_number=found.invoice_number, how="lookup")
        elif found.status == "not_found":
            await _settle_unknown(row["id"], tenant_id, filed=False, how="lookup")
        else:
            await _alert(row, "unknown", row["last_error"])


async def resolve_unknown(tenant_id: str, fbr_invoice_id: str, *, filed: bool,
                          invoice_number: str | None = None) -> bool:
    """An owner checked IRIS: the document is there (with this FBR number) or
    it isn't (send it again). False if that filing isn't unknown."""
    async with db.tenant_conn(tenant_id) as conn:
        outbox_id = await conn.fetchval(
            "select outbox_id from pos_fbr_invoices where id=$1 and status='unknown'", fbr_invoice_id)
    if outbox_id is None:
        return False
    return await _settle_unknown(outbox_id, tenant_id, filed=filed,
                                 invoice_number=invoice_number, how="manual")


async def process_outbox() -> int:
    """The scheduler's FBR job: reap abandoned sends, block orphaned debit
    notes, reconcile unknown rows, then deliver everything due. Crosses
    tenants through the owner connection; each document is built and recorded
    under its own tenant. Returns the number filed."""
    await _reap()
    await _block_orphans()
    await _reconcile()
    filed = attempted = 0
    for _ in range(MAX_PASSES):
        rows = await _claim(BATCH)
        if not rows:
            break
        ok = 0
        for row in rows:
            result = await _deliver(row)
            ok += result.ok
        attempted += len(rows)
        filed += ok
        if ok == 0:   # nothing new can have become due
            break
    if attempted:
        log.info("FBR outbox: %d/%d filed", filed, attempted)
    return filed
