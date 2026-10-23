"""A marketing tick on web forms, confirmed by the address owner
(wave D leftovers, 0129; security review of c6b3ca3).

A form can ask for marketing consent with its own wording. A ticked box is
kept on the lead as evidence (when, from which IP, the exact wording), and
NEVER opts anyone in by itself: anyone can type a stranger's email or phone
into a public form. When staff qualify the lead, the contact is sent a
confirmation email (double opt-in) at their own address, only if that is
the address the visitor typed and they haven't opted out. Only clicking it
records the opt-in. Phone channels wait for a phone confirmation (Phase 4).

The link is signed, expires, names the contact and is bound to their email
address as it was: it works out the business from the link alone, opts in
only that contact, and its GET changes nothing (mail scanners open links)."""
from __future__ import annotations

import json
import time
import uuid

import pytest_asyncio

from app import campaigns, email, web_forms

from ..conftest import _drop, _signup
from .helpers import q
from .test_web_forms import make_form, submit


@pytest_asyncio.fixture
async def shop(client, monkeypatch):
    monkeypatch.setattr(web_forms, "MIN_FILL_SECONDS", 0)
    tenant_id = await _signup(client, ["crm"])
    yield tenant_id
    await _drop(tenant_id)


WORDING = "Send me offers by email and WhatsApp"


async def lead_named(tenant_id: str, name: str):
    [row] = await q("select * from crm_leads where tenant_id = $1 and name = $2", uuid.UUID(tenant_id), name)
    return row


async def consents(contact_id: str) -> dict[str, str]:
    rows = await q("select channel, status from contact_consents where contact_id = $1", uuid.UUID(contact_id))
    return {r["channel"]: r["status"] for r in rows}


async def confirmations(tenant_id: str) -> list[dict]:
    rows = await q("select * from outbox where tenant_id = $1 and kind = 'email.send' "
                   "and payload->>'template' = 'consent_confirm' order by id", uuid.UUID(tenant_id))
    return [{**dict(r), "payload": json.loads(r["payload"])} for r in rows]


async def ticked_lead(client, shop, name: str, **values) -> object:
    form = await make_form(client, consent_label=WORDING)
    await submit(client, form, name=name, consent=True, **values)
    return await lead_named(shop, name)


async def test_the_form_shows_its_wording_and_keeps_the_tick_as_evidence(client, shop):
    form = await make_form(client, consent_label=WORDING)
    client.cookies.clear()
    assert (await client.get(f"/public/forms/{form['public_id']}")).json()["consent_label"] == WORDING
    r = await submit(client, form, name="Ticked", email="t@example.com", consent=True)
    assert r.status_code == 200, r.text
    await submit(client, form, name="Not ticked", phone="03004445566")
    ticked, plain = await lead_named(shop, "Ticked"), await lead_named(shop, "Not ticked")
    assert ticked["consent_at"] is not None and ticked["consent_text"] == WORDING and ticked["consent_ip"]
    assert plain["consent_at"] is None


async def test_a_tick_on_a_form_that_doesnt_ask_is_ignored(client, shop):
    form = await make_form(client)
    assert (await client.get(f"/public/forms/{form['public_id']}")).json()["consent_label"] is None
    await submit(client, form, name="Sneaky", consent=True)
    assert (await lead_named(shop, "Sneaky"))["consent_at"] is None


async def test_qualifying_sends_a_confirmation_and_opts_in_nobody(client, shop):
    lead = await ticked_lead(client, shop, "New buyer", email="buyer@example.com", phone="03007778899")
    r = await client.post(f"/crm/leads/{lead['id']}/qualify", json={"mode": "create"})
    assert r.status_code == 200, r.text
    contact_id = r.json()["contact"]["id"]
    assert await consents(contact_id) == {}                     # nothing until they confirm
    [mail] = await confirmations(shop)
    assert mail["payload"] == {"template": "consent_confirm", "to": "buyer@example.com", "contact_id": contact_id}


async def test_linking_to_an_existing_contact_changes_nothing_by_itself(client, shop):
    """The forgery the review found: a stranger's real phone and email on a form."""
    existing = (await client.post("/contacts", json={"name": "Real Customer", "phone": "03001112222",
                                                     "email": "real@example.com", "force": True})).json()
    lead = await ticked_lead(client, shop, "Forger", email="real@example.com", phone="03001112222")
    r = await client.post(f"/crm/leads/{lead['id']}/qualify", json={"mode": "link", "contact_id": existing["id"]})
    assert r.status_code == 200, r.text
    assert await consents(existing["id"]) == {}
    # The real owner of the address is asked; only they can say yes.
    [mail] = await confirmations(shop)
    assert mail["payload"]["to"] == "real@example.com"


async def test_no_confirmation_for_an_address_that_isnt_the_contacts(client, shop):
    existing = (await client.post("/contacts", json={"name": "Customer", "email": "mine@example.com",
                                                     "force": True})).json()
    lead = await ticked_lead(client, shop, "Other address", email="someone.else@example.com")
    await client.post(f"/crm/leads/{lead['id']}/qualify", json={"mode": "link", "contact_id": existing["id"]})
    assert await confirmations(shop) == [] and await consents(existing["id"]) == {}


async def test_no_confirmation_to_someone_who_opted_out(client, shop):
    existing = (await client.post("/contacts", json={"name": "Said No", "email": "no@example.com",
                                                     "force": True})).json()
    await client.put(f"/contacts/{existing['id']}/consents",
                     json={"channel": "email", "status": "opted_out", "source": "Asked us to stop"})
    lead = await ticked_lead(client, shop, "Said No again", email="no@example.com")
    await client.post(f"/crm/leads/{lead['id']}/qualify", json={"mode": "link", "contact_id": existing["id"]})
    assert await confirmations(shop) == []
    assert (await consents(existing["id"]))["email"] == "opted_out"


async def test_the_link_confirms_on_post_only_and_only_for_that_contact(client, shop):
    lead = await ticked_lead(client, shop, "Confirmer", email="yes@example.com", phone="")
    contact_id = (await client.post(f"/crm/leads/{lead['id']}/qualify", json={"mode": "create"})).json()["contact"]["id"]
    token = campaigns.consent_token(contact_id, "yes@example.com")

    client.cookies.clear()
    page = await client.get(f"/public/consent/{token}")
    assert page.status_code == 200 and page.json()["business_name"] and page.json()["done"] is False
    assert "yes@example.com" not in page.text
    assert await consents(contact_id) == {}                     # a scanner's GET changes nothing
    for _ in range(2):                                          # idempotent
        r = await client.post(f"/public/consent/{token}")
        assert r.status_code == 200 and r.json()["done"] is True
    assert await consents(contact_id) == {"email": "opted_in"}
    [row] = await q("select source from contact_consents where contact_id = $1", uuid.UUID(contact_id))
    assert "confirmed" in row["source"].lower()


async def test_a_forged_expired_or_stale_link_does_nothing(client, shop, monkeypatch):
    lead = await ticked_lead(client, shop, "Changer", email="old@example.com", phone="")
    contact_id = (await client.post(f"/crm/leads/{lead['id']}/qualify", json={"mode": "create"})).json()["contact"]["id"]
    good = campaigns.consent_token(contact_id, "old@example.com")
    forged = good[:-4] + ("0000" if not good.endswith("0000") else "1111")
    assert (await client.post(f"/public/consent/{forged}")).status_code == 404
    assert (await client.post(f"/public/consent/{uuid.uuid4()}.{int(time.time()) + 999}.abc")).status_code == 404
    # The address changed since the link was sent: it no longer confirms anything.
    await client.patch(f"/contacts/{contact_id}", json={"email": "new@example.com"})
    assert (await client.post(f"/public/consent/{good}")).status_code == 404
    # An expired link.
    monkeypatch.setattr(campaigns, "CONSENT_TTL_SECONDS", -1)
    expired = campaigns.consent_token(contact_id, "new@example.com")
    assert (await client.post(f"/public/consent/{expired}")).status_code == 404
    assert await consents(contact_id) == {}


async def test_the_confirmation_email_carries_the_link(client, shop, monkeypatch):
    sent: list[tuple[str, str, str]] = []

    async def capture(to, subject, body):
        sent.append((to, subject, body))

    monkeypatch.setattr(email, "_send", capture)
    lead = await ticked_lead(client, shop, "Mailed", email="mailed@example.com", phone="")
    await client.post(f"/crm/leads/{lead['id']}/qualify", json={"mode": "create"})
    [mail] = await confirmations(shop)
    await q("update outbox set run_after = now() where id = $1", mail["id"])
    await email.process_outbox()
    [(to, subject, body)] = [s for s in sent if s[0] == "mailed@example.com"]
    assert "/c/" in body and "confirm" in subject.lower()


async def test_the_lead_shows_the_tick(client, shop):
    lead = await ticked_lead(client, shop, "Shown", email="s@example.com")
    out = (await client.get(f"/crm/leads/{lead['id']}")).json()["lead"]
    assert out["consent_at"] is not None and out["consent_text"] == WORDING
