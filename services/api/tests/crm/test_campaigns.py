"""Consent, segments, templates and email campaigns (wave D, C19/C20/C22,
migration 0124).

A marketing message goes only to a contact who opted in on that channel; an
opt-out always wins, also across a merge. A segment is a saved filter from a
fixed allow-list, evaluated when used. Templates use merge tokens from a
fixed list. Sending snapshots the wording and records every contact as
queued (with its outbox row) or skipped with the reason; the email carries an
unsubscribe link whose GET changes nothing."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio

from app import campaigns

from ..conftest import _drop, _signup
from .helpers import add_teammate, login, q


@pytest_asyncio.fixture
async def shop(client):
    tenant_id = await _signup(client, ["crm"])
    yield tenant_id
    await _drop(tenant_id)


async def contact(client, name: str, email: str = "", tag_id: str | None = None, **extra) -> dict:
    r = await client.post("/contacts", json={"name": name, "email": email, "force": True,
                                             "tag_ids": [tag_id] if tag_id else [], **extra})
    assert r.status_code == 201, r.text
    return r.json()


async def consent(client, contact_id: str, status: str, channel: str = "email"):
    return await client.put(f"/contacts/{contact_id}/consents",
                            json={"channel": channel, "status": status, "source": "Told us at the counter"})


async def tagged_audience(client) -> tuple[str, dict[str, dict]]:
    """A tag and four contacts on it: opted in, opted out, never asked, opted in without an email."""
    tag = (await client.post("/tags", json={"name": f"Eid {uuid.uuid4().hex[:4]}"})).json()["id"]
    people = {
        "in": await contact(client, "Sara Malik", "sara@example.com", tag),
        "out": await contact(client, "Omar Out", "omar@example.com", tag),
        "unknown": await contact(client, "Nadia New", "nadia@example.com", tag),
        "no_email": await contact(client, "Bilal Phone", "", tag, phone="03001112233"),
    }
    await consent(client, people["in"]["id"], "opted_in")
    await consent(client, people["out"]["id"], "opted_out")
    await consent(client, people["no_email"]["id"], "opted_in")
    await contact(client, "Not Tagged", "nt@example.com")
    return tag, people


async def segment(client, **flt) -> dict:
    r = await client.post("/crm/segments", json={"name": "Eid list", "filter": flt})
    assert r.status_code == 201, r.text
    return r.json()


async def template(client, **body) -> dict:
    r = await client.post("/crm/templates", json={"name": "Eid offer", "subject": "Eid Mubarak, {{first_name}}!",
                                                  "body": "Dear {{first_name|Customer}},\n20% off at {{business_name}}.",
                                                  **body})
    assert r.status_code == 201, r.text
    return r.json()


async def campaign(client, seg: dict, tpl: dict) -> dict:
    r = await client.post("/crm/campaigns", json={"name": "Eid 2026", "segment_id": seg["id"],
                                                  "template_id": tpl["id"]})
    assert r.status_code == 201, r.text
    return r.json()


async def outbox_for(tenant_id: str) -> list[dict]:
    rows = await q("select * from outbox where tenant_id = $1 and kind = 'email.send' "
                   "and payload->>'template' = 'campaign' order by id", uuid.UUID(tenant_id))
    return [{**dict(r), "payload": json.loads(r["payload"])} for r in rows]   # a raw connection: jsonb is text


# ── Consent ─────────────────────────────────────────────────────────────────
async def test_consent_is_per_channel_and_recorded(client, shop):
    c = await contact(client, "Sara", "sara@example.com")
    assert (await consent(client, c["id"], "opted_in")).status_code == 200
    assert (await consent(client, c["id"], "opted_out", "sms")).status_code == 200
    got = {x["channel"]: x for x in (await client.get(f"/contacts/{c['id']}/consents")).json()}
    assert got["email"]["status"] == "opted_in" and got["sms"]["status"] == "opted_out"
    assert got["email"]["source"] == "Told us at the counter" and got["email"]["updated_at"]
    assert (await consent(client, c["id"], "maybe")).status_code == 422


async def test_an_opt_out_survives_a_merge(client, shop):
    keep = await contact(client, "Sara Malik", "sara@example.com")
    dupe = await contact(client, "Sara M.", "sara.m@example.com")
    await consent(client, keep["id"], "opted_in")
    await consent(client, dupe["id"], "opted_out")
    r = await client.post("/contacts/merge", json={"winner_id": keep["id"], "loser_ids": [dupe["id"]]})
    assert r.status_code == 200, r.text
    got = {x["channel"]: x["status"] for x in (await client.get(f"/contacts/{keep['id']}/consents")).json()}
    assert got["email"] == "opted_out"


# ── Segments ────────────────────────────────────────────────────────────────
async def test_a_segment_previews_who_it_reaches(client, shop):
    tag, _ = await tagged_audience(client)
    seg = await segment(client, tag_ids=[tag])
    r = await client.get(f"/crm/segments/{seg['id']}/preview", params={"channel": "email"})
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["total"] == 4 and p["reachable"] == 1
    assert p["skipped"] == {"no_address": 1, "no_consent": 1, "opted_out": 1}
    assert [s["name"] for s in p["sample"]] == ["Sara Malik"]


async def test_segment_filters_come_from_a_fixed_list(client, shop):
    for bad in ({"sql": "1=1"}, {"tag_ids": "x"}, {"kind": "robot"}, {"city": "x" * 200}):
        r = await client.post("/crm/segments", json={"name": "Bad", "filter": bad})
        assert r.status_code == 422, (bad, r.text)
    other = str(uuid.uuid4())
    assert (await client.post("/crm/segments", json={"name": "T", "filter": {"tag_ids": [other]}})).status_code == 404


async def test_segments_filter_by_kind_city_and_role(client, shop):
    await contact(client, "Karachi Co", "k@example.com", kind="company", city="Karachi", roles=["customer"])
    await contact(client, "Lahore Person", "l@example.com", city="Lahore", roles=["customer"])
    seg = await segment(client, kind="company", city="karachi", roles=["customer"])
    p = (await client.get(f"/crm/segments/{seg['id']}/preview", params={"channel": "email"})).json()
    assert p["total"] == 1


# ── Templates ───────────────────────────────────────────────────────────────
async def test_templates_accept_only_known_merge_tokens(client, shop):
    r = await client.post("/crm/templates", json={"name": "Bad", "subject": "Hi", "body": "Hi {{password}}"})
    assert r.status_code == 422 and "password" in r.text
    r = await client.post("/crm/templates", json={"name": "Bad", "subject": "Hi {{name", "body": "x"})
    assert r.status_code == 422


def test_rendering_fills_tokens_and_falls_back():
    data = {"first_name": "", "name": "Sara Malik", "company": "", "city": "Lahore", "business_name": "Raza Mart"}
    assert campaigns.render("Hi {{first_name|Customer}} from {{city}}", data) == "Hi Customer from Lahore"
    assert campaigns.render("{{ name }} @ {{business_name}}", data) == "Sara Malik @ Raza Mart"
    # A value can't smuggle in a token or a header line.
    assert campaigns.render("{{name}}", {**data, "name": "X {{city}}\r\nBcc: a@b.c"}) == "X {{city}} Bcc: a@b.c"


# ── Sending ─────────────────────────────────────────────────────────────────
async def test_sending_queues_the_consenting_and_records_the_rest(client, shop):
    tag, people = await tagged_audience(client)
    cmp = await campaign(client, await segment(client, tag_ids=[tag]), await template(client))
    r = await client.post(f"/crm/campaigns/{cmp['id']}/send")
    assert r.status_code == 200, r.text
    sent = r.json()
    assert sent["status"] == "sent" and sent["queued_count"] == 1 and sent["skipped_count"] == 3
    rec = {x["contact_id"]: x for x in (await client.get(f"/crm/campaigns/{cmp['id']}/recipients")).json()}
    assert rec[people["in"]["id"]]["status"] == "queued"
    assert rec[people["out"]["id"]]["skip_reason"] == "opted_out"
    assert rec[people["unknown"]["id"]]["skip_reason"] == "no_consent"
    assert rec[people["no_email"]["id"]]["skip_reason"] == "no_address"

    [row] = await outbox_for(shop)
    p = row["payload"]
    assert p["to"] == "sara@example.com" and p["subject"] == "Eid Mubarak, Sara!"
    assert p["body"].startswith("Dear Sara,") and "/u/" in p["unsubscribe_url"]
    assert (await client.post(f"/crm/campaigns/{cmp['id']}/send")).status_code == 409   # once


async def test_the_daily_cap_holds_back_the_rest(client, shop):
    tag = (await client.post("/tags", json={"name": "Cap"})).json()["id"]
    for i in range(3):
        c = await contact(client, f"Person {i}", f"p{i}@example.com", tag)
        await consent(client, c["id"], "opted_in")
    await client.put("/crm/settings", json={"max_discount_pct": None, "campaign_daily_cap": 2})
    cmp = await campaign(client, await segment(client, tag_ids=[tag]), await template(client))
    sent = (await client.post(f"/crm/campaigns/{cmp['id']}/send")).json()
    assert sent["queued_count"] == 2 and sent["skipped_count"] == 1
    reasons = [x["skip_reason"] for x in (await client.get(f"/crm/campaigns/{cmp['id']}/recipients")).json()]
    assert reasons.count("daily_cap") == 1


async def test_sms_and_whatsapp_wait_for_their_senders(client, shop):
    tag, _ = await tagged_audience(client)
    seg = await segment(client, tag_ids=[tag])
    r = await client.post("/crm/campaigns", json={"name": "SMS", "segment_id": seg["id"], "channel": "sms",
                                                  "template_id": (await template(client))["id"]})
    assert r.status_code == 422, r.text


def test_quiet_hours_hold_mail_until_nine_in_the_morning():
    pkt = campaigns.PKT
    late = datetime(2026, 10, 23, 22, 30, tzinfo=pkt)
    early = datetime(2026, 10, 24, 7, 0, tzinfo=pkt)
    day = datetime(2026, 10, 24, 11, 0, tzinfo=pkt)
    assert campaigns.quiet_until(late) == datetime(2026, 10, 24, 9, 0, tzinfo=pkt)
    assert campaigns.quiet_until(early) == datetime(2026, 10, 24, 9, 0, tzinfo=pkt)
    assert campaigns.quiet_until(day) is None
    assert campaigns.quiet_until(day.astimezone(timezone.utc)) is None


async def test_drafting_is_write_but_sending_is_admin(client, shop):
    tag, _ = await tagged_audience(client)
    seg = await segment(client, tag_ids=[tag])
    tpl = await template(client)
    _, rep = await add_teammate(client, ["read", "write"])
    await login(client, rep)
    cmp = await campaign(client, seg, tpl)
    assert (await client.post(f"/crm/campaigns/{cmp['id']}/send")).status_code == 403


# ── Unsubscribe ─────────────────────────────────────────────────────────────
async def test_unsubscribe_link_opts_out_on_post_only(client, shop):
    tag, people = await tagged_audience(client)
    cmp = await campaign(client, await segment(client, tag_ids=[tag]), await template(client))
    await client.post(f"/crm/campaigns/{cmp['id']}/send")
    [row] = await outbox_for(shop)
    token = row["payload"]["unsubscribe_url"].rsplit("/u/", 1)[1]

    client.cookies.clear()
    page = await client.get(f"/public/unsubscribe/{token}")
    assert page.status_code == 200 and page.json()["business_name"]
    assert "sara@example.com" not in page.text            # the address isn't shown to whoever holds the link
    [c] = await q("select status from contact_consents where contact_id = $1 and channel = 'email'",
                  uuid.UUID(people["in"]["id"]))
    assert c["status"] == "opted_in"                      # a link scanner's GET changed nothing

    for _ in range(2):                                    # idempotent
        assert (await client.post(f"/public/unsubscribe/{token}")).status_code == 200
    [c] = await q("select status, source from contact_consents where contact_id = $1 and channel = 'email'",
                  uuid.UUID(people["in"]["id"]))
    assert c["status"] == "opted_out" and "unsubscribe" in c["source"].lower()


@pytest.mark.parametrize("token", ["nope", "00000000-0000-0000-0000-000000000000.00000000-0000-0000-0000-000000000000.x"])
async def test_a_forged_unsubscribe_link_is_not_found(client, shop, token):
    assert (await client.get(f"/public/unsubscribe/{token}")).status_code == 404
    assert (await client.post(f"/public/unsubscribe/{token}")).status_code == 404


async def test_the_outbox_renders_a_campaign_email_with_its_unsubscribe_line():
    from app import email
    subject, body = await email._render({"tenant_id": None, "payload": {
        "template": "campaign", "to": "sara@example.com", "subject": "Eid Mubarak", "body": "Dear Sara,",
        "business": "Raza Mart", "unsubscribe_url": "https://app.example/u/abc"}})
    assert subject == "Eid Mubarak"
    assert body.startswith("Dear Sara,") and body.endswith("To stop these emails: https://app.example/u/abc")
