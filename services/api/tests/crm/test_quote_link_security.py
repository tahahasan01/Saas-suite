"""The public quote link (/public/quotes/{token}) is the only credential a
customer has, and anyone holding it can act. These pin down what it can
and can't do (study 12 §3):

* only sha256 of the token is used to find it; the raw token is never in the
  database in clear and never comes back from a public response;
* GET never changes state (WhatsApp and email link previews fetch it);
* the page shows the quote and nothing else of the business's records;
* superseded, cancelled and unknown links are a plain 404; an expired quote
  shows but can't be accepted;
* accepting needs the content hash the page showed, is idempotent, and can't
  be flipped to declined afterwards;
* lookups are rate-limited per IP across all tokens, so guessing can't hide
  behind a different path each time.
"""
from __future__ import annotations

import hashlib
import secrets
import uuid

import pytest_asyncio

from app import ratelimit

from ..conftest import _drop, _signup
from .helpers import q
from .test_quotes import accept, deal, quote, token_of


@pytest_asyncio.fixture
async def shop(client):
    tenant_id = await _signup(client, ["crm", "pos"])
    yield tenant_id
    await _drop(tenant_id)


async def _sent(client) -> tuple[dict, dict]:
    lead = await deal(client)
    return lead, await quote(client, lead["id"], terms="Delivery in 7 days")


async def test_only_the_hash_of_the_token_is_stored(client, shop):
    _, qt = await _sent(client)
    token = token_of(qt)
    [row] = await q("select token_hash, token_enc from crm_quotes where id = $1", uuid.UUID(qt["id"]))
    assert row["token_hash"] == hashlib.sha256(token.encode()).hexdigest()
    assert token.encode() not in bytes(row["token_enc"])


async def test_get_has_no_side_effects_and_is_not_cached(client, shop):
    _, qt = await _sent(client)
    client.cookies.clear()                     # the customer has no session
    for _ in range(3):
        r = await client.get(f"/public/quotes/{token_of(qt)}",
                             headers={"User-Agent": "WhatsApp/2.23.20.0"})
        assert r.status_code == 200, r.text
    assert r.headers["Cache-Control"] == "no-store"
    assert r.headers["Referrer-Policy"] == "no-referrer"
    assert "noindex" in r.headers["X-Robots-Tag"]
    [row] = await q("select view_count, first_viewed_at from crm_quotes where id = $1", uuid.UUID(qt["id"]))
    assert row["view_count"] == 0 and row["first_viewed_at"] is None

    # The page's own beacon counts the view.
    assert (await client.post(f"/public/quotes/{token_of(qt)}/view")).status_code == 204
    [row] = await q("select view_count, first_viewed_at from crm_quotes where id = $1", uuid.UUID(qt["id"]))
    assert row["view_count"] == 1 and row["first_viewed_at"] is not None


async def test_the_page_shows_the_quote_and_nothing_internal(client, shop):
    lead, qt = await _sent(client)
    await client.post(f"/crm/leads/{lead['id']}/notes", json={"body": "Customer is price sensitive"})
    client.cookies.clear()
    r = await client.get(f"/public/quotes/{token_of(qt)}")
    page = r.json()
    assert page["number"] == qt["number"] and page["total_minor"] == qt["total_minor"]
    assert page["terms"] == "Delivery in 7 days" and len(page["lines"]) == 2
    text = r.text
    for secret in (lead["id"], qt["id"], shop, token_of(qt), "price sensitive", "list_price", "product_id",
                   "owner", "probability"):
        assert secret not in text, secret


async def test_unknown_superseded_and_cancelled_links_are_not_found(client, shop):
    lead, qt = await _sent(client)
    unknown = secrets.token_urlsafe(32)
    assert (await client.get(f"/public/quotes/{unknown}")).status_code == 404
    assert (await client.post(f"/public/quotes/{unknown}/accept",
                              json={"name": "X", "content_hash": "0" * 64})).status_code == 404
    await client.post(f"/crm/quotes/{qt['id']}/cancel")
    for path in ("", "/view"):
        r = await (client.get if not path else client.post)(f"/public/quotes/{token_of(qt)}{path}")
        assert r.status_code == 404, path
    r = await client.post(f"/public/quotes/{token_of(qt)}/accept", json={"name": "X", "content_hash": "0" * 64})
    assert r.status_code == 404


async def test_an_expired_quote_shows_but_cannot_be_accepted(client, shop):
    _, qt = await _sent(client)
    # Sent long ago: its validity ran out yesterday.
    await q("alter table crm_quotes disable trigger crm_quotes_freeze")
    try:
        await q("update crm_quotes set valid_until = current_date - 1 where id = $1", uuid.UUID(qt["id"]))
    finally:
        await q("alter table crm_quotes enable trigger crm_quotes_freeze")
    page = (await client.get(f"/public/quotes/{token_of(qt)}")).json()
    assert page["status"] == "expired"
    r = await client.post(f"/public/quotes/{token_of(qt)}/accept",
                          json={"name": "Late", "content_hash": page["content_hash"]})
    assert r.status_code == 409, r.text
    assert (await client.post(f"/public/quotes/{token_of(qt)}/decline", json={})).status_code == 409
    assert (await client.get(f"/crm/quotes/{qt['id']}")).json()["expired"] is True


async def test_accept_needs_the_content_the_page_showed(client, shop):
    _, qt = await _sent(client)
    r = await client.post(f"/public/quotes/{token_of(qt)}/accept",
                          json={"name": "Bilal", "content_hash": "f" * 64})
    assert r.status_code == 409, r.text
    for bad in ({"content_hash": qt["content_hash"]}, {"name": " ", "content_hash": qt["content_hash"]},
                {"name": "x" * 121, "content_hash": qt["content_hash"]}):
        assert (await client.post(f"/public/quotes/{token_of(qt)}/accept", json=bad)).status_code == 422


async def test_accept_is_idempotent_and_final(client, shop):
    _, qt = await _sent(client)
    first = await accept(client, qt, "Bilal Ahmed")
    again = await accept(client, qt, "Someone Else")
    assert first.status_code == again.status_code == 200
    assert again.json()["accepted_name"] == "Bilal Ahmed"          # the first acceptance stands
    r = await client.post(f"/public/quotes/{token_of(qt)}/decline", json={"reason": "changed my mind"})
    assert r.status_code == 409
    [row] = await q("select status, accepted_name, accepted_hash, content_hash from crm_quotes where id = $1",
                    uuid.UUID(qt["id"]))
    assert row["status"] == "accepted" and row["accepted_name"] == "Bilal Ahmed"
    assert row["accepted_hash"] == row["content_hash"]


async def test_public_writes_ignore_extra_fields(client, shop):
    """Nothing but a name, the hash and a reason can be sent."""
    _, qt = await _sent(client)
    r = await client.post(f"/public/quotes/{token_of(qt)}/accept",
                          json={"name": "Bilal", "content_hash": qt["content_hash"], "total_minor": 1})
    assert r.status_code == 422


async def test_lookups_are_rate_limited_per_ip_across_tokens(client, shop, monkeypatch):
    monkeypatch.setattr(ratelimit, "_window", lambda w: (1, w))   # one window, whatever the clock says
    ratelimit.reset()
    codes = [(await client.get(f"/public/quotes/{secrets.token_urlsafe(32)}")).status_code for _ in range(61)]
    assert codes[:60] == [404] * 60 and codes[60] == 429
