"""Receivables aging (PRD INV-10; research sweep 2026-10-23): what each
customer still owes, by how late it is: not yet due, 1-30, 31-60, 61-90 and
over 90 days past the due date, with totals and a CSV."""
from __future__ import annotations

import uuid
from datetime import date, timedelta

from .helpers import login_as_rep, q


async def today(tenant_id: str) -> date:
    [r] = await q("select tenant_today(timezone) as d from tenants where id = $1", uuid.UUID(tenant_id))
    return r["d"]


async def owed(client, contact_id: str, amount: int, due: date, paid: int = 0) -> dict:
    inv = (await client.post("/invoices", json={"contact_id": contact_id, "submit": True, "due_date": due.isoformat(),
                                                "lines": [{"description": "Goods", "qty": 1,
                                                           "unit_price_minor": amount}]})).json()
    r = await client.post(f"/invoices/{inv['id']}/approve")
    assert r.status_code == 200, r.text
    if paid:
        r = await client.post(f"/invoices/{inv['id']}/payments",
                              json={"method": "cash", "amount_minor": paid, "paid_on": date.today().isoformat()})
        assert r.status_code == 200, r.text
    return r.json()


async def company(client, name: str) -> str:
    return (await client.post("/contacts", json={"kind": "company", "name": name, "force": True})).json()["id"]


async def test_balances_land_in_the_bucket_of_their_lateness(client, crm_tenant):
    t = await today(crm_tenant.tenant_id)
    bilal, nadia = await company(client, "Bilal Traders"), await company(client, "Nadia Stores")
    await owed(client, bilal, 1_000_00, t + timedelta(days=5))              # not yet due
    await owed(client, bilal, 2_000_00, t - timedelta(days=10), paid=500_00)  # 1-30, part paid
    await owed(client, bilal, 3_000_00, t - timedelta(days=45))             # 31-60
    await owed(client, nadia, 4_000_00, t - timedelta(days=75))             # 61-90
    await owed(client, nadia, 5_000_00, t - timedelta(days=120))            # 90+
    paid_off = await owed(client, nadia, 9_000_00, t - timedelta(days=200), paid=9_000_00)
    assert paid_off["status"] == "paid"

    r = await client.get("/invoices/aging")
    assert r.status_code == 200, r.text
    rep = r.json()
    rows = {x["contact_name"]: x for x in rep["rows"]}
    assert rows["Bilal Traders"] == {**rows["Bilal Traders"], "current_minor": 1_000_00, "d1_30_minor": 1_500_00,
                                     "d31_60_minor": 3_000_00, "d61_90_minor": 0, "d90_plus_minor": 0,
                                     "total_minor": 5_500_00, "invoices": 3}
    assert rows["Nadia Stores"]["d61_90_minor"] == 4_000_00 and rows["Nadia Stores"]["d90_plus_minor"] == 5_000_00
    assert rows["Nadia Stores"]["total_minor"] == 9_000_00        # the paid invoice owes nothing
    assert rep["totals"]["total_minor"] == 14_500_00 and rep["totals"]["d90_plus_minor"] == 5_000_00
    # Most owed first.
    assert [x["contact_name"] for x in rep["rows"]][:2] == ["Nadia Stores", "Bilal Traders"]


async def test_aging_as_of_another_day(client, crm_tenant):
    t = await today(crm_tenant.tenant_id)
    c = await company(client, "Late Co")
    await owed(client, c, 1_000_00, t + timedelta(days=10))        # not due yet today...
    rows = (await client.get("/invoices/aging", params={"as_of": (t + timedelta(days=25)).isoformat()})).json()["rows"]
    [row] = [x for x in rows if x["contact_name"] == "Late Co"]
    assert row["d1_30_minor"] == 1_000_00 and row["current_minor"] == 0    # ...15 days late then


async def test_aging_downloads_as_csv(client, crm_tenant):
    t = await today(crm_tenant.tenant_id)
    await owed(client, await company(client, "CSV Co"), 1_234_56, t - timedelta(days=3))
    r = await client.get("/invoices/aging", params={"format": "csv"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    lines = r.text.strip().splitlines()
    assert lines[0].startswith("customer,not_yet_due,1_30,31_60,61_90,over_90,total")
    assert any(ln.startswith("CSV Co,0.00,1234.56,") for ln in lines)


async def test_aging_needs_invoice_read(client, crm_tenant):
    await login_as_rep(client, crm_tenant.tenant_id, ["write"])
    assert (await client.get("/invoices/aging")).status_code == 403
