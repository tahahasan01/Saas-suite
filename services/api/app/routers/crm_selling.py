"""CRM selling (wave D): products on deals, quotes and the selling settings.
The logic is in app/deal_lines.py and app/quotes.py (the public quote page
is routers/public_quotes.py). Lines follow the lead's record scope
(out of scope reads as not found, D-04); a discount over the tenant's
ceiling needs crm.deal.discount_override."""
from __future__ import annotations

import asyncpg
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status

from .. import audit, db, deal_lines, email, invoicing, leads, quotes, quotes_pdf, ratelimit, rbac, sequences, targets
from ..crm_selling_models import (
    MONTH,
    Copied,
    SalesForecastOut,
    TargetCopy,
    TargetIn,
    TargetOut,
    TargetsOut,
    CrmSettingsIn,
    CrmSettingsOut,
    DealLines,
    DealLinesPut,
    DealProductOut,
    QuoteCreate,
    QuoteEmail,
    QuoteEmailed,
    QuoteInvoiced,
    QuoteOut,
)
from ..deps import AuthContext
from ..phone import normalize_email
from ..rbac import perm

router = APIRouter(prefix="/crm", tags=["crm-selling"])


async def _can_override(conn: asyncpg.Connection, auth: AuthContext) -> bool:
    return await rbac.scope_of(conn, auth, "crm.deal.discount_override") is not None


@router.get("/leads/{lead_id}/lines", response_model=DealLines)
async def get_lines(lead_id: str, auth: AuthContext = Depends(perm("crm.lead.read"))) -> DealLines:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await leads.ensure_in_scope(conn, auth, "crm.lead.read", lead_id)
        return await deal_lines.read(conn, lead_id)


@router.put("/leads/{lead_id}/lines", response_model=DealLines)
async def put_lines(lead_id: str, body: DealLinesPut,
                    auth: AuthContext = Depends(perm("crm.lead.update"))) -> DealLines:
    """Replace the deal's lines (an empty list clears them)."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        await leads.ensure_in_scope(conn, auth, "crm.lead.update", lead_id)
        return await deal_lines.replace(conn, auth.tenant_id, auth.user_id, lead_id, body.lines,
                                        body.tax_inclusive, can_override=await _can_override(conn, auth))


@router.post("/leads/{lead_id}/lines/update-prices", response_model=DealLines)
async def update_prices(lead_id: str, auth: AuthContext = Depends(perm("crm.lead.update"))) -> DealLines:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await leads.ensure_in_scope(conn, auth, "crm.lead.update", lead_id)
        return await deal_lines.update_prices(conn, auth.tenant_id, auth.user_id, lead_id,
                                              can_override=await _can_override(conn, auth))


@router.get("/products", response_model=list[DealProductOut])
async def find_products(q: str = Query("", max_length=80),
                        auth: AuthContext = Depends(perm("crm.lead.update"))) -> list[DealProductOut]:
    """Active catalog products for the line editor. A rep putting products on a
    deal needn't hold POS rights, so this is the narrow read they get: name,
    unit and price, never cost or stock."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            """select id, name, unit, price_minor from pos_products
                where active and ($1 = '' or name ilike '%' || $1 || '%' or sku = $1 or barcode = $1)
                order by lower(name), id limit 20""", q.strip())
    return [DealProductOut(id=str(r["id"]), name=r["name"], unit=r["unit"], price_minor=r["price_minor"])
            for r in rows]


@router.get("/settings", response_model=CrmSettingsOut)
async def get_settings(auth: AuthContext = Depends(perm("crm.lead.read"))) -> CrmSettingsOut:
    """Reps read the settings too: the line editor shows the discount ceiling."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await deal_lines.settings(conn)


@router.put("/settings", response_model=CrmSettingsOut)
async def put_settings(body: CrmSettingsIn,
                       auth: AuthContext = Depends(perm("crm.settings.manage"))) -> CrmSettingsOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        fields = body.model_dump(exclude_unset=True)
        if fields.get("campaign_daily_cap", 0) is None:
            fields.pop("campaign_daily_cap")      # not nullable: absent means unchanged
        await conn.execute("insert into crm_settings (tenant_id) values ($1) on conflict do nothing", auth.tenant_id)
        if fields:
            cols = ", ".join(f"{k} = ${i + 1}" for i, k in enumerate(fields))
            await conn.execute(f"update crm_settings set {cols}, updated_at = now()", *fields.values())
        return await deal_lines.settings(conn)


# ── Quotes (0121) ───────────────────────────────────────────────────────────
@router.get("/leads/{lead_id}/quotes", response_model=list[QuoteOut])
async def list_quotes(lead_id: str, auth: AuthContext = Depends(perm("crm.lead.read"))) -> list[QuoteOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await leads.ensure_in_scope(conn, auth, "crm.lead.read", lead_id)
        return await quotes.for_lead(conn, lead_id)


@router.post("/leads/{lead_id}/quotes", response_model=QuoteOut, status_code=status.HTTP_201_CREATED)
async def create_quote(lead_id: str, body: QuoteCreate,
                       auth: AuthContext = Depends(perm("crm.quote.send"))) -> QuoteOut:
    """Freeze the deal's products into a numbered quote with its link; an
    open quote for the deal is superseded."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        await leads.ensure_in_scope(conn, auth, "crm.lead.update", lead_id)
        return await quotes.create(conn, auth.tenant_id, auth.user_id, lead_id, body.valid_until, body.terms)


async def _quote_in_scope(conn: asyncpg.Connection, auth: AuthContext, key: str, quote_id: str) -> asyncpg.Record:
    row = await quotes.get(conn, quote_id)
    await leads.ensure_in_scope(conn, auth, key, str(row["lead_id"]))
    return row


@router.get("/quotes/{quote_id}", response_model=QuoteOut)
async def get_quote(quote_id: str, auth: AuthContext = Depends(perm("crm.lead.read"))) -> QuoteOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await quotes.out(conn, await _quote_in_scope(conn, auth, "crm.lead.read", quote_id))


@router.get("/quotes/{quote_id}/pdf")
async def quote_pdf(quote_id: str, auth: AuthContext = Depends(perm("crm.lead.read"))) -> Response:
    async with db.tenant_conn(auth.tenant_id) as conn:
        q = await quotes.out(conn, await _quote_in_scope(conn, auth, "crm.lead.read", quote_id))
        seller = await invoicing.seller(conn, auth.tenant_id)
    return Response(quotes_pdf.build_quote_pdf(q, seller), media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{q.number}.pdf"'})


SENDS_PER_QUOTE_HOUR = 3
SENDS_PER_DAY = 200


@router.post("/quotes/{quote_id}/send", response_model=QuoteEmailed, status_code=status.HTTP_202_ACCEPTED)
async def email_quote(quote_id: str, body: QuoteEmail, background: BackgroundTasks,
                      auth: AuthContext = Depends(perm("crm.quote.send"))) -> QuoteEmailed:
    """Email the customer the link and the PDF, through the outbox. Only an
    open quote; one plain address; a few times an hour per quote and a daily
    cap per business, like invoices."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await _quote_in_scope(conn, auth, "crm.lead.update", quote_id)
        if not quotes.is_open(row, await sequences.local_date(conn, None)):
            raise HTTPException(status.HTTP_409_CONFLICT, "Only an open quote can be emailed")
        if body.to:
            to = normalize_email(body.to)
            if not to:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Please check the email address")
        else:
            to = await conn.fetchval(
                "select c.email_normalized from crm_leads l join contacts c on c.id = l.contact_id where l.id = $1",
                row["lead_id"])
            if not to:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                    "Give an email address: this customer has none")
        for bucket, limit, window in ((f"quote-send:{quote_id}", SENDS_PER_QUOTE_HOUR, 3600),
                                      (f"tenant:{auth.tenant_id}:quote-send", SENDS_PER_DAY, 86400)):
            retry = await ratelimit.hit(bucket, limit, window)
            if retry:
                raise ratelimit.too_many(retry)
        mail = await email.queue_quote(conn, auth.tenant_id, to, quote_id)
        await conn.execute("update crm_quotes set last_emailed_at = now(), updated_at = now() where id = $1", quote_id)
        await audit.event(conn, "crm.quote.email", "crm_quotes", quote_id, data={"to": to})
    background.add_task(email.deliver_now, mail)    # after commit; the worker retries if this fails
    return QuoteEmailed(to=to)


@router.post("/quotes/{quote_id}/cancel", response_model=QuoteOut)
async def cancel_quote(quote_id: str, auth: AuthContext = Depends(perm("crm.quote.send"))) -> QuoteOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await _quote_in_scope(conn, auth, "crm.lead.update", quote_id)
        return await quotes.cancel(conn, quote_id)


@router.post("/quotes/{quote_id}/invoice", response_model=QuoteInvoiced, status_code=status.HTTP_201_CREATED)
async def invoice_quote(quote_id: str,
                        auth: AuthContext = Depends(perm("invoicing.invoice.create"))) -> QuoteInvoiced:
    """A draft invoice from the accepted quote's frozen lines (invoices v2)."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        await _quote_in_scope(conn, auth, "crm.lead.read", quote_id)
        return QuoteInvoiced(invoice_id=await quotes.to_invoice(conn, auth.tenant_id, auth.user_id, quote_id))


# ── Targets and forecast (0123) ─────────────────────────────────────────────
@router.get("/targets", response_model=TargetsOut)
async def list_targets(month: str = Query(pattern=MONTH),
                       auth: AuthContext = Depends(perm("crm.report.read"))) -> TargetsOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return TargetsOut(month=month, targets=await targets.for_month(conn, month))


@router.put("/targets", response_model=TargetOut)
async def set_target(body: TargetIn, auth: AuthContext = Depends(perm("crm.target.manage"))) -> TargetOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        tid = await targets.upsert(conn, auth.tenant_id, auth.user_id, body.month, body.metric, body.amount_minor,
                                   body.user_id)
        return next(t for t in await targets.for_month(conn, body.month) if t.id == tid)


@router.delete("/targets/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_target(target_id: str, auth: AuthContext = Depends(perm("crm.target.manage"))) -> Response:
    async with db.tenant_conn(auth.tenant_id) as conn:
        if await conn.fetchval("delete from crm_targets where id = $1 returning id", target_id) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Target not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/targets/copy", response_model=Copied)
async def copy_targets(body: TargetCopy, auth: AuthContext = Depends(perm("crm.target.manage"))) -> Copied:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return Copied(copied=await targets.copy(conn, auth.tenant_id, auth.user_id, body.from_month, body.to_month))


@router.get("/forecast", response_model=SalesForecastOut)
async def forecast(months: int = Query(6, ge=1, le=12),
                   auth: AuthContext = Depends(perm("crm.report.read"))) -> SalesForecastOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await targets.forecast(conn, auth, months)
