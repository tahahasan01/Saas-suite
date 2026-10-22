"""Sales targets and the forecast (wave D, C16/C17, migration 0123).

A target is an amount for a month, for one rep or the whole company, on won
value, invoiced or collected; progress is worked out when read. The forecast
puts open deals in the month they're expected to close (value x probability,
and the best case), with explicit buckets for overdue and undated deals, so
nothing is hidden."""
from __future__ import annotations

import uuid
from datetime import date

import pytest_asyncio

from ..conftest import _drop, _signup
from .helpers import add_teammate, login_as_rep, q


@pytest_asyncio.fixture
async def shop(client):
    tenant_id = await _signup(client, ["crm"])
    await q("delete from crm_leads where tenant_id = $1", uuid.UUID(tenant_id))   # no sample deals in the sums
    yield tenant_id
    await _drop(tenant_id)


async def today(tenant_id: str) -> date:
    [r] = await q("select tenant_today(timezone) as d from tenants where id = $1", uuid.UUID(tenant_id))
    return r["d"]


def month_of(d: date) -> str:
    return d.strftime("%Y-%m")


def shift(d: date, months: int) -> date:
    m = d.month - 1 + months
    return date(d.year + m // 12, m % 12 + 1, 1)


async def deal(client, name: str, value: int, *, close: date | None = None, probability: int | None = None,
               owner: str | None = None) -> dict:
    r = await client.post("/crm/leads", json={"name": name, "value_minor": value, "force": True,
                                              "expected_close_date": close.isoformat() if close else None})
    assert r.status_code == 201, r.text
    patch: dict = {}
    if probability is not None:
        patch["probability"] = probability
    if owner:
        patch["owner_id"] = owner
    if patch:
        assert (await client.patch(f"/crm/leads/{r.json()['id']}", json=patch)).status_code == 200
    return r.json()


async def set_target(client, month: str, metric: str, amount: int, user_id: str | None = None):
    return await client.put("/crm/targets", json={"month": month, "metric": metric, "amount_minor": amount,
                                                  "user_id": user_id})


async def test_won_value_progress_per_rep_and_for_the_company(client, shop):
    rep, _ = await add_teammate(client, ["read", "write"])
    month = month_of(await today(shop))
    assert (await set_target(client, month, "won_value", 1_000_000_00, rep)).status_code == 200
    assert (await set_target(client, month, "won_value", 3_000_000_00)).status_code == 200
    mine = await deal(client, "Rep's deal", 400_000_00, owner=rep)
    other = await deal(client, "Owner's deal", 600_000_00)
    await deal(client, "Still open", 900_000_00, owner=rep)
    for d in (mine, other):
        assert (await client.post(f"/crm/leads/{d['id']}/won")).status_code == 200

    r = await client.get("/crm/targets", params={"month": month})
    assert r.status_code == 200, r.text
    by = {(t["user_id"], t["metric"]): t for t in r.json()["targets"]}
    rep_t, company = by[(rep, "won_value")], by[(None, "won_value")]
    assert rep_t["achieved_minor"] == 400_000_00 and rep_t["percent"] == 40
    assert company["achieved_minor"] == 1_000_000_00
    assert rep_t["user_name"] and company["user_name"] is None
    # Where the month should be by today, at an even pace.
    assert 0 < rep_t["pace_minor"] <= 1_000_000_00


async def test_invoiced_and_collected_count_the_reps_deals(client, shop):
    rep, _ = await add_teammate(client, ["read", "write"])
    month = month_of(await today(shop))
    await set_target(client, month, "invoiced", 100_000_00, rep)
    await set_target(client, month, "collected", 100_000_00, rep)
    lead = await deal(client, "Billed deal", 50_000_00, owner=rep)
    contact = (await client.post("/contacts", json={"kind": "company", "name": "Billed Co", "force": True})).json()
    inv = (await client.post("/invoices", json={"contact_id": contact["id"], "lead_id": lead["id"], "submit": True,
                                                "lines": [{"description": "Work", "qty": 1,
                                                           "unit_price_minor": 50_000_00}]})).json()
    assert (await client.post(f"/invoices/{inv['id']}/approve")).status_code == 200
    r = await client.post(f"/invoices/{inv['id']}/payments", json={"method": "cash", "amount_minor": 20_000_00,
                                                                   "paid_on": (await today(shop)).isoformat()})
    assert r.status_code == 200, r.text
    targets = (await client.get("/crm/targets", params={"month": month})).json()["targets"]
    by = {t["metric"]: t for t in targets}
    assert by["invoiced"]["achieved_minor"] == 50_000_00
    assert by["collected"]["achieved_minor"] == 20_000_00


async def test_a_target_is_replaced_and_removed(client, shop):
    month = month_of(await today(shop))
    first = (await set_target(client, month, "won_value", 100)).json()
    again = (await set_target(client, month, "won_value", 200)).json()
    assert again["id"] == first["id"] and again["amount_minor"] == 200
    assert (await client.delete(f"/crm/targets/{first['id']}")).status_code == 204
    assert (await client.get("/crm/targets", params={"month": month})).json()["targets"] == []


async def test_last_months_targets_can_be_copied_forward(client, shop):
    rep, _ = await add_teammate(client, ["read", "write"])
    this = await today(shop)
    last, nxt = month_of(shift(this, -1)), month_of(shift(this, 1))
    await set_target(client, last, "won_value", 500, rep)
    await set_target(client, last, "collected", 700)
    r = await client.post("/crm/targets/copy", json={"from_month": last, "to_month": nxt})
    assert r.status_code == 200 and r.json()["copied"] == 2
    got = (await client.get("/crm/targets", params={"month": nxt})).json()["targets"]
    assert {(t["user_id"], t["metric"], t["amount_minor"]) for t in got} == {(rep, "won_value", 500),
                                                                            (None, "collected", 700)}
    # Copying again doesn't duplicate or overwrite.
    assert (await client.post("/crm/targets/copy", json={"from_month": last, "to_month": nxt})).json()["copied"] == 0


async def test_bad_targets_are_refused(client, shop):
    month = month_of(await today(shop))
    assert (await set_target(client, month, "won_value", 0)).status_code == 422
    assert (await set_target(client, month, "profit", 10)).status_code == 422
    assert (await set_target(client, "2026-13", "won_value", 10)).status_code == 422
    assert (await set_target(client, month, "won_value", 10, str(uuid.uuid4()))).status_code == 404


async def test_setting_targets_is_for_managers_and_reading_needs_reports(client, shop):
    month = month_of(await today(shop))
    await login_as_rep(client, shop, ["read", "write"])
    assert (await set_target(client, month, "won_value", 10)).status_code == 403
    assert (await client.get("/crm/targets", params={"month": month})).status_code == 200


# ── Forecast (C17) ──────────────────────────────────────────────────────────
async def test_the_forecast_buckets_open_deals_by_month(client, shop):
    t = await today(shop)
    this, nxt = shift(t, 0), shift(t, 1)
    await deal(client, "This month", 100_000_00, close=t, probability=50)
    await deal(client, "Next month", 200_000_00, close=nxt, probability=25)
    await deal(client, "Overdue", 300_000_00, close=shift(t, -2), probability=40)
    await deal(client, "Undated", 400_000_00, probability=10)
    won = await deal(client, "Won this month", 50_000_00, close=t)
    await client.post(f"/crm/leads/{won['id']}/won")
    lost = await deal(client, "Lost", 999_00, close=t)
    await client.post(f"/crm/leads/{lost['id']}/lost", json={})

    r = await client.get("/crm/forecast", params={"months": 3})
    assert r.status_code == 200, r.text
    f = r.json()
    months = {m["month"]: m for m in f["months"]}
    assert list(months) == [month_of(this), month_of(nxt), month_of(shift(t, 2))]
    cur = months[month_of(this)]
    assert cur["won_minor"] == 50_000_00
    assert cur["weighted_minor"] == 50_000_00 and cur["best_case_minor"] == 100_000_00 and cur["open_count"] == 1
    assert months[month_of(nxt)]["weighted_minor"] == 50_000_00
    assert f["overdue"]["best_case_minor"] == 300_000_00 and f["overdue"]["weighted_minor"] == 120_000_00
    assert f["no_date"]["best_case_minor"] == 400_000_00 and f["no_date"]["open_count"] == 1
    assert {d["name"] for d in f["overdue"]["deals"]} == {"Overdue"}

