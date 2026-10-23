"""A marketing tick on web forms (wave D leftovers, migration 0129).

A form can ask for marketing consent with its own wording. A ticked box is
kept on the lead as evidence (when, from which IP, the exact wording); it
only becomes a contact's opt-in when staff qualify the lead, for the
channels whose address the visitor gave (email; SMS and WhatsApp for a
phone), and only where the contact's address is the one the visitor typed.
It never overrides an opt-out. Anyone can type anyone's email into a form,
so a form alone never subscribes an existing contact."""
from __future__ import annotations

import uuid

import pytest_asyncio

from app import web_forms

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
    form = await make_form(client)                    # no wording: no tick
    assert (await client.get(f"/public/forms/{form['public_id']}")).json()["consent_label"] is None
    await submit(client, form, name="Sneaky", consent=True)
    assert (await lead_named(shop, "Sneaky"))["consent_at"] is None


async def test_qualifying_turns_the_tick_into_opt_ins_for_the_given_addresses(client, shop):
    form = await make_form(client, consent_label=WORDING)
    await submit(client, form, name="Both ways", email="both@example.com", phone="03007778899", consent=True)
    lead = await lead_named(shop, "Both ways")
    r = await client.post(f"/crm/leads/{lead['id']}/qualify", json={"mode": "create"})
    assert r.status_code == 200, r.text
    contact_id = r.json()["contact"]["id"]
    assert await consents(contact_id) == {"email": "opted_in", "sms": "opted_in", "whatsapp": "opted_in"}
    [row] = await q("select source from contact_consents where contact_id = $1 and channel = 'email'",
                    uuid.UUID(contact_id))
    assert "web form" in row["source"].lower()


async def test_linking_only_carries_consent_for_the_contacts_own_address(client, shop):
    """Someone types an existing customer's phone with their own email: the
    customer's phone channels must not be opted in by a stranger's form."""
    existing = (await client.post("/contacts", json={"name": "Real Customer", "phone": "03001112222",
                                                     "email": "real@example.com", "force": True})).json()
    form = await make_form(client, consent_label=WORDING)
    await submit(client, form, name="Impostor", email="other@example.com", phone="03001112222", consent=True)
    lead = await lead_named(shop, "Impostor")
    # The phone matched an open lead? No: the contact isn't a lead, so a new lead was made.
    r = await client.post(f"/crm/leads/{lead['id']}/qualify", json={"mode": "link", "contact_id": existing["id"]})
    assert r.status_code == 200, r.text
    got = await consents(existing["id"])
    # The phone is the contact's own, so SMS/WhatsApp carry over; the email typed isn't theirs.
    assert got.get("email") is None
    assert got.get("sms") == "opted_in" and got.get("whatsapp") == "opted_in"


async def test_an_opt_out_is_never_overridden(client, shop):
    existing = (await client.post("/contacts", json={"name": "Said No", "email": "no@example.com",
                                                     "force": True})).json()
    await client.put(f"/contacts/{existing['id']}/consents",
                     json={"channel": "email", "status": "opted_out", "source": "Asked us to stop"})
    form = await make_form(client, consent_label=WORDING)
    await submit(client, form, name="Said No again", email="no@example.com", consent=True)
    lead = await lead_named(shop, "Said No again")
    await client.post(f"/crm/leads/{lead['id']}/qualify", json={"mode": "link", "contact_id": existing["id"]})
    assert (await consents(existing["id"]))["email"] == "opted_out"


async def test_the_lead_shows_the_tick(client, shop):
    form = await make_form(client, consent_label=WORDING)
    await submit(client, form, name="Shown", email="s@example.com", consent=True)
    lead = await lead_named(shop, "Shown")
    out = (await client.get(f"/crm/leads/{lead['id']}")).json()["lead"]
    assert out["consent_at"] is not None and out["consent_text"] == WORDING
