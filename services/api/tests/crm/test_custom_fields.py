"""Custom fields on leads and contacts (wave D, C26, migration 0127).

An admin defines fields (text, number, date, a choice from a list, yes/no)
for leads or for contacts; values live with the record and are checked
against the definition on every write: an unknown or retired field, or a
value of the wrong type, is a 422. Sending null clears a value; fields not
sent are left as they are."""
from __future__ import annotations

import pytest_asyncio

from ..conftest import _drop, _signup
from .helpers import login_as_rep


@pytest_asyncio.fixture
async def shop(client):
    tenant_id = await _signup(client, ["crm"])
    yield tenant_id
    await _drop(tenant_id)


async def field(client, entity: str, label: str, kind: str, **extra) -> dict:
    r = await client.post("/custom-fields", json={"entity": entity, "label": label, "kind": kind, **extra})
    assert r.status_code == 201, r.text
    return r.json()


async def lead(client, **extra) -> dict:
    r = await client.post("/crm/leads", json={"name": "Hamid Ali", "force": True, **extra})
    return r


async def test_fields_are_defined_per_record_type_with_a_stable_key(client, shop):
    size = await field(client, "lead", "Plot size (marla)", "number")
    assert size["key"] == "plot_size_marla" and size["kind"] == "number"
    again = await field(client, "lead", "Plot size (marla)", "text")
    assert again["key"] == "plot_size_marla_2"                   # keys never collide
    await field(client, "contact", "Blood group", "select", options=["A+", "B+", "O+"])
    leads = (await client.get("/custom-fields", params={"entity": "lead"})).json()
    assert [f["label"] for f in leads] == ["Plot size (marla)", "Plot size (marla)"]
    contacts = (await client.get("/custom-fields", params={"entity": "contact"})).json()
    assert contacts[0]["options"] == ["A+", "B+", "O+"]


async def test_a_choice_field_needs_choices(client, shop):
    r = await client.post("/custom-fields", json={"entity": "lead", "label": "Area", "kind": "select"})
    assert r.status_code == 422
    r = await client.post("/custom-fields", json={"entity": "deal", "label": "X", "kind": "text"})
    assert r.status_code == 422


async def test_lead_values_are_checked_against_their_field(client, shop):
    await field(client, "lead", "Plot size", "number")
    await field(client, "lead", "Visit date", "date")
    await field(client, "lead", "Area", "select", options=["DHA", "Bahria", "Gulberg"])
    await field(client, "lead", "Has financing", "checkbox")
    await field(client, "lead", "Referred by", "text")
    good = {"plot_size": 10, "visit_date": "2026-11-02", "area": "DHA", "has_financing": True, "referred_by": "Imran"}
    r = await lead(client, custom=good)
    assert r.status_code == 201, r.text
    assert r.json()["custom"] == good
    for bad in ({"plot_size": "ten"}, {"visit_date": "2nd Nov"}, {"area": "Clifton"}, {"has_financing": "yes"},
                {"referred_by": "x" * 501}, {"unknown_field": 1}, {"plot_size": True}):
        r = await lead(client, custom=bad)
        assert r.status_code == 422, (bad, r.text)


async def test_an_update_changes_only_what_is_sent_and_null_clears(client, shop):
    await field(client, "lead", "Plot size", "number")
    await field(client, "lead", "Area", "select", options=["DHA", "Bahria"])
    created = (await lead(client, custom={"plot_size": 5, "area": "DHA"})).json()
    r = await client.patch(f"/crm/leads/{created['id']}", json={"custom": {"area": "Bahria"}})
    assert r.status_code == 200, r.text
    assert r.json()["custom"] == {"plot_size": 5, "area": "Bahria"}
    r = await client.patch(f"/crm/leads/{created['id']}", json={"custom": {"plot_size": None}})
    assert r.json()["custom"] == {"area": "Bahria"}
    detail = (await client.get(f"/crm/leads/{created['id']}")).json()
    assert detail["lead"]["custom"] == {"area": "Bahria"}


async def test_a_retired_field_keeps_old_values_but_takes_no_new_ones(client, shop):
    f = await field(client, "lead", "Old code", "text")
    created = (await lead(client, custom={"old_code": "A1"})).json()
    r = await client.patch(f"/custom-fields/{f['id']}", json={"archived": True})
    assert r.status_code == 200 and r.json()["archived"] is True
    assert (await client.get("/custom-fields", params={"entity": "lead"})).json() == []
    assert (await client.patch(f"/crm/leads/{created['id']}", json={"custom": {"old_code": "B2"}})).status_code == 422
    assert (await client.get(f"/crm/leads/{created['id']}")).json()["lead"]["custom"] == {"old_code": "A1"}
    # Its kind can't change under existing values; its label and choices can.
    assert (await client.patch(f"/custom-fields/{f['id']}", json={"kind": "number"})).status_code == 422
    assert (await client.patch(f"/custom-fields/{f['id']}", json={"label": "Legacy code"})).json()["label"] == \
        "Legacy code"


async def test_contacts_take_custom_values_too(client, shop):
    await field(client, "contact", "Blood group", "select", options=["A+", "O+"])
    r = await client.post("/contacts", json={"name": "Sara", "force": True, "custom": {"blood_group": "O+"}})
    assert r.status_code == 201, r.text
    c = r.json()
    assert c["custom"] == {"blood_group": "O+"}
    r = await client.patch(f"/contacts/{c['id']}", json={"custom": {"blood_group": "B-"}})
    assert r.status_code == 422
    # A lead field doesn't apply to contacts.
    await field(client, "lead", "Plot size", "number")
    assert (await client.patch(f"/contacts/{c['id']}", json={"custom": {"plot_size": 3}})).status_code == 422


async def test_defining_fields_is_crm_settings(client, shop):
    await field(client, "lead", "Area", "text")
    await login_as_rep(client, shop, ["read", "write"])
    assert (await client.post("/custom-fields", json={"entity": "lead", "label": "X", "kind": "text"})).status_code == 403
    assert (await client.get("/custom-fields", params={"entity": "lead"})).status_code == 200   # reps fill them in
    created = (await lead(client, custom={"area": "DHA"}))
    assert created.status_code == 201, created.text
