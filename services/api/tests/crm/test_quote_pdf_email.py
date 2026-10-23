"""Quote PDF and emailing a quote (wave D leftovers, migration 0128).

Staff and the customer (through the link) can download the quote as a PDF;
an accepted quote's PDF carries the acceptance evidence. Emailing queues an
outbox row holding only the quote id and address: the link and the PDF are
made at delivery, so no working link sits in the outbox. Only an open quote
is emailed, with the same limits as invoices."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio

from app import email, quotes_pdf

from ..conftest import _drop, _signup
from .helpers import login_as_rep, q
from .test_quotes import accept, deal, quote, token_of


@pytest_asyncio.fixture
async def shop(client):
    tenant_id = await _signup(client, ["crm", "pos"])
    yield tenant_id
    await _drop(tenant_id)


@pytest.fixture
def attached(monkeypatch):
    out: list[tuple[str, str, str, list]] = []

    async def capture(to, subject, body, attachments):
        out.append((to, subject, body, attachments))

    monkeypatch.setattr(email, "_send_attached", capture)
    return out


async def with_contact(client, email_addr: str = "buyer@bilal.example") -> dict:
    lead = await deal(client)
    c = (await client.post("/contacts", json={"kind": "company", "name": "Bilal Traders Pvt", "email": email_addr,
                                              "force": True})).json()
    await q("update crm_leads set contact_id = $1 where id = $2", uuid.UUID(c["id"]), uuid.UUID(lead["id"]))
    return lead


async def outbox(tenant_id: str) -> list[dict]:
    rows = await q("select * from outbox where tenant_id = $1 and kind = 'email.send' "
                   "and payload->>'template' = 'quote' order by id", uuid.UUID(tenant_id))
    return [{**dict(r), "payload": json.loads(r["payload"])} for r in rows]


# ── PDF ─────────────────────────────────────────────────────────────────────
async def test_staff_and_the_customer_can_download_the_pdf(client, shop):
    qt = await quote(client, (await deal(client))["id"])
    r = await client.get(f"/crm/quotes/{qt['id']}/pdf")
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF") and qt["number"] in r.headers["content-disposition"]

    client.cookies.clear()
    r = await client.get(f"/public/quotes/{token_of(qt)}/pdf")
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    assert r.headers["Cache-Control"] == "no-store" and r.headers["Referrer-Policy"] == "no-referrer"
    [row] = await q("select view_count from crm_quotes where id = $1", uuid.UUID(qt["id"]))
    assert row["view_count"] == 0                     # a download is not the page's view beacon


async def test_a_dead_link_has_no_pdf(client, shop):
    qt = await quote(client, (await deal(client))["id"])
    await client.post(f"/crm/quotes/{qt['id']}/cancel")
    assert (await client.get(f"/public/quotes/{token_of(qt)}/pdf")).status_code == 404


async def test_an_accepted_quote_carries_the_evidence():
    accepted = {"accepted_name": "Bilal Ahmed", "accepted_at": datetime(2026, 10, 24, 10, 5, tzinfo=timezone.utc),
                "content_hash": "ab" * 32}
    line = quotes_pdf.acceptance_line(accepted)
    assert line is not None
    assert "Accepted by Bilal Ahmed" in line and "24 Oct 2026" in line and "abababababab" in line
    assert quotes_pdf.acceptance_line({"accepted_name": None, "accepted_at": None, "content_hash": "x"}) is None


async def test_the_pdf_of_an_accepted_quote_builds(client, shop):
    qt = await quote(client, (await deal(client))["id"])
    await accept(client, qt)
    r = await client.get(f"/crm/quotes/{qt['id']}/pdf")
    assert r.status_code == 200 and r.content.startswith(b"%PDF")


# ── Email ───────────────────────────────────────────────────────────────────
async def test_emailing_queues_a_pointer_and_delivery_adds_the_link_and_pdf(client, shop, attached):
    qt = await quote(client, (await with_contact(client))["id"])
    r = await client.post(f"/crm/quotes/{qt['id']}/send", json={})
    assert r.status_code == 202, r.text
    assert r.json()["to"] == "buyer@bilal.example"
    [row] = await outbox(shop)
    assert row["payload"] == {"template": "quote", "to": "buyer@bilal.example", "quote_id": qt["id"]}

    await q("update outbox set run_after = now() where id = $1", row["id"])
    assert await email.process_outbox() >= 1
    [(to, subject, body, files)] = attached
    assert to == "buyer@bilal.example" and qt["number"] in subject
    assert f"/q/{token_of(qt)}" in body                 # the link, made at delivery
    [(name, data, mime)] = files
    assert name == f"{qt['number']}.pdf" and mime == "application/pdf" and data.startswith(b"%PDF")
    assert (await client.get(f"/crm/quotes/{qt['id']}")).json()["last_emailed_at"] is not None


async def test_a_quote_closed_before_delivery_sends_no_link(client, shop, attached):
    qt = await quote(client, (await with_contact(client))["id"])
    await client.post(f"/crm/quotes/{qt['id']}/send", json={})
    await client.post(f"/crm/quotes/{qt['id']}/cancel")
    [row] = await outbox(shop)
    await q("update outbox set run_after = now() where id = $1", row["id"])
    await email.process_outbox()
    assert attached == []                               # nothing goes out for a dead quote
    [after] = await q("select status from outbox where id = $1", row["id"])
    assert after["status"] == "done"


async def test_only_an_open_quote_is_emailed_to_one_plain_address(client, shop):
    lead = await deal(client)
    qt = await quote(client, lead["id"])
    assert (await client.post(f"/crm/quotes/{qt['id']}/send", json={})).status_code == 422   # no contact email
    for bad in ("a@b.example,c@d.example", "Bilal <a@b.example>", "a@b.example\r\nBcc: x@y.example"):
        assert (await client.post(f"/crm/quotes/{qt['id']}/send", json={"to": bad})).status_code == 422
    assert (await client.post(f"/crm/quotes/{qt['id']}/send", json={"to": "Ops@Shop.example"})).json()["to"] == \
        "ops@shop.example"
    await accept(client, qt)
    assert (await client.post(f"/crm/quotes/{qt['id']}/send", json={"to": "a@b.example"})).status_code == 409


async def test_the_same_quote_cant_be_emailed_over_and_over(client, shop, monkeypatch):
    from app import ratelimit
    monkeypatch.setattr(ratelimit, "_window", lambda w: (1, w))   # one window, whatever the clock says
    qt = await quote(client, (await with_contact(client))["id"])
    codes = [(await client.post(f"/crm/quotes/{qt['id']}/send", json={})).status_code for _ in range(4)]
    assert codes == [202, 202, 202, 429]


async def test_emailing_needs_quote_rights(client, shop):
    qt = await quote(client, (await with_contact(client))["id"])
    await login_as_rep(client, shop, ["read"])
    assert (await client.post(f"/crm/quotes/{qt['id']}/send", json={})).status_code == 403
    assert (await client.get(f"/crm/quotes/{qt['id']}/pdf")).status_code == 200      # reading is enough for the PDF
