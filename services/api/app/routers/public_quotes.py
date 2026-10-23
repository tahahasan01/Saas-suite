"""The customer's quote page (wave D, C15): /public/quotes/{token}. No
session: the link's token is the only credential, and it reaches one quote
and nothing else. The life cycle is in app/quotes.py.

* Every response is no-store, no-referrer and noindex: the token is in the
  path, so it must not leak into caches, Referer headers or search engines.
* GET never changes anything (WhatsApp and email fetch links for previews);
  the page counts a view with its own POST.
* Lookups are rate-limited per IP across all tokens (the stock limiter keys
  on the path, which here would be a new bucket per guessed token).
* Actions run with actor kind 'public' and no actor id: the evidence (name,
  time, IP, user agent, content hash) is kept on the quote.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request, Response, status

from .. import context, db, invoicing, quotes, quotes_pdf, ratelimit
from ..crm_selling_models import QuoteAccept, QuoteDecline, QuotePublic

LOOKUPS_PER_MINUTE = 60

router = APIRouter(prefix="/public/quotes", tags=["public"])


async def _guard(request: Request, response: Response) -> None:
    retry = await ratelimit.hit(f"ip:{ratelimit.client_ip(request)}:public-quote", LOOKUPS_PER_MINUTE, 60)
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    if retry:
        raise ratelimit.too_many(retry)


async def _open(token: str) -> tuple[str, Any]:
    """The tenant and quote id for the token (404 when dead), acting as the public."""
    q = await quotes.resolve(token)
    context.set_actor("", "public")
    return str(q["tenant_id"]), q["id"]


@router.get("/{token}", response_model=QuotePublic, dependencies=[Depends(_guard)])
async def view(token: str) -> QuotePublic:
    tenant_id, qid = await _open(token)
    async with db.tenant_conn(tenant_id) as conn:
        return await quotes.public_view(conn, qid)


@router.post("/{token}/view", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(_guard)])
async def beacon(token: str) -> Response:
    tenant_id, qid = await _open(token)
    async with db.tenant_conn(tenant_id) as conn:
        await quotes.record_view(conn, qid)
    return Response(status_code=status.HTTP_204_NO_CONTENT,
                    headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})


@router.post("/{token}/accept", response_model=QuotePublic, dependencies=[Depends(_guard)])
async def accept(token: str, body: QuoteAccept, request: Request) -> QuotePublic:
    tenant_id, qid = await _open(token)
    async with db.tenant_conn(tenant_id) as conn:
        return await quotes.accept(conn, qid, body.name, body.content_hash, ratelimit.client_ip(request),
                                   request.headers.get("user-agent", ""))


@router.post("/{token}/decline", response_model=QuotePublic, dependencies=[Depends(_guard)])
async def decline(token: str, body: QuoteDecline) -> QuotePublic:
    tenant_id, qid = await _open(token)
    async with db.tenant_conn(tenant_id) as conn:
        return await quotes.decline(conn, qid, body.reason)


@router.get("/{token}/pdf", dependencies=[Depends(_guard)])
async def pdf(token: str) -> Response:
    """The quote as a PDF; like the page, reading it changes nothing."""
    tenant_id, qid = await _open(token)
    async with db.tenant_conn(tenant_id) as conn:
        page = await quotes.public_view(conn, qid)
        seller = await invoicing.seller(conn, tenant_id)
    return Response(quotes_pdf.build_quote_pdf(page, seller), media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{page.number}.pdf"',
                             "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
                             "X-Robots-Tag": "noindex, nofollow"})
