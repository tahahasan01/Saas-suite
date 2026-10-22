"""Reports with CSV export (3G): sales by day, item, cashier and method;
stock valuation (cost is field-guarded); tax summary; attendance; payroll.
Each answers JSON for the screen and `?format=csv` for a spreadsheet."""
from __future__ import annotations

import csv
import io
import uuid
from datetime import date

import asyncpg

from app.config import settings

from ..hrms.payroll_helpers import new_employee
from ..hrms.test_payroll_exports import approved
from .test_rbac_v2 import _role, _user_on

TODAY = date.today().isoformat()
RANGE = f"from={TODAY}&to={TODAY}"


async def _owner(sql: str, *args):
    conn = await asyncpg.connect(settings.database_url)
    try:
        return await conn.fetch(sql, *args)
    finally:
        await conn.close()


def _csv(text: str) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(text)))


async def _product(client, **extra) -> dict:
    r = await client.post("/pos/products", json={"name": "Report item " + uuid.uuid4().hex[:5],
                                                 "price_minor": 10_000, "cost_minor": 6_000, "stock_qty": 10, **extra})
    assert r.status_code == 201, r.text
    return r.json()


async def _sell(client, product_id: str, qty: int, method: str) -> dict:
    r = await client.post("/pos/sales", json={"items": [{"product_id": product_id, "qty": qty}], "payment_method": method})
    assert r.status_code == 201, r.text
    return r.json()


async def _report(client, path: str) -> list[dict]:
    r = await client.get(path)
    assert r.status_code == 200, r.text
    return r.json()["rows"]


async def test_sales_by_day_item_cashier_and_method(client, pos_tenant):
    before = {r["method"]: r for r in await _report(client, f"/reports/sales?by=method&{RANGE}")}
    day0 = (await _report(client, f"/reports/sales?by=day&{RANGE}") or [{"sales_count": 0, "net_minor": 0,
                                                                         "refunds_minor": 0}])[0]
    p = await _product(client)
    sale = await _sell(client, p["id"], 2, "card")
    await _sell(client, p["id"], 1, "cash")
    line = (await client.get(f"/pos/sales/{sale['id']}")).json()["returnable"][0]
    r = await client.post(f"/pos/sales/{sale['id']}/returns",
                          json={"items": [{"sale_item_id": line["sale_item_id"], "qty": 1}], "reason": "Damaged"})
    assert r.status_code == 201, r.text

    day = (await _report(client, f"/reports/sales?by=day&{RANGE}"))[0]
    assert day["date"] == TODAY
    assert day["sales_count"] - day0["sales_count"] == 2
    assert day["net_minor"] - day0["net_minor"] == 30_000
    assert day["refunds_minor"] - day0["refunds_minor"] == 10_000

    item = next(r for r in await _report(client, f"/reports/sales?by=item&{RANGE}") if r["name"] == p["name"])
    assert item["qty"] == 3 and item["net_minor"] == 30_000
    assert item["returned_qty"] == 1

    after = {r["method"]: r for r in await _report(client, f"/reports/sales?by=method&{RANGE}")}
    taken = lambda m, src: src.get(m, {}).get("amount_minor", 0)   # noqa: E731
    assert taken("card", after) - taken("card", before) == 20_000
    assert taken("cash", after) - taken("cash", before) == 10_000

    cashiers = await _report(client, f"/reports/sales?by=cashier&{RANGE}")
    assert any(r["cashier"] == "Test Owner" and r["sales_count"] >= 2 for r in cashiers)

    r = await client.get(f"/reports/sales?by=item&{RANGE}&format=csv")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    rows = _csv(r.text)
    assert any(row["Item"] == p["name"] and row["Qty"] == "3" for row in rows)


async def test_a_voided_sale_is_not_counted(client, pos_tenant):
    p = await _product(client)
    sale = await _sell(client, p["id"], 1, "card")
    assert (await client.post(f"/pos/sales/{sale['id']}/void", json={"reason": "Rang up twice"})).status_code in (200, 201)
    rows = await _report(client, f"/reports/sales?by=item&{RANGE}")
    assert not [r for r in rows if r["name"] == p["name"]]


async def test_sales_reports_need_the_report_key_and_a_sane_range(client, pos_tenant):
    assert (await client.get("/reports/sales?by=nope")).status_code == 422
    assert (await client.get("/reports/sales?by=day&from=2026-10-10&to=2026-01-01")).status_code == 422
    assert (await client.get("/reports/sales?by=day&from=2024-01-01&to=2026-01-01")).status_code == 422  # > 1 year
    clerk_role = await _role(client, [{"permission_key": "pos.sale.create", "scope": "all"}])
    clerk, _, _ = await _user_on(client, [clerk_role])
    try:
        assert (await clerk.get(f"/reports/sales?by=day&{RANGE}")).status_code == 403
    finally:
        await clerk.aclose()


async def test_stock_valuation_needs_the_cost_key(client, pos_tenant):
    p = await _product(client)
    rows = await _report(client, "/reports/stock-valuation")
    mine = next(r for r in rows if r["name"] == p["name"])
    assert mine["stock_qty"] == 10 and mine["cost_minor"] == 6_000 and mine["value_minor"] == 60_000
    r = await client.get("/reports/stock-valuation")
    assert r.json()["total_minor"] >= 60_000
    csv_rows = _csv((await client.get("/reports/stock-valuation?format=csv")).text)
    assert any(row["Product"] == p["name"] and row["Value (PKR)"] == "600.00" for row in csv_rows)

    seller = await _role(client, [{"permission_key": "pos.report.sales", "scope": "all"}])
    viewer, _, _ = await _user_on(client, [seller])
    try:
        assert (await viewer.get("/reports/stock-valuation")).status_code == 403
        assert (await viewer.get(f"/reports/sales?by=day&{RANGE}")).status_code == 200
    finally:
        await viewer.aclose()


async def test_tax_summary_by_rate(client, pos_tenant):
    """The summary reads the sale-line snapshot, so it is what was charged:
    tax applies only with FBR on, so the line is snapshotted as an FBR sale's
    would be (18% inclusive of Rs 100: 84.75 + 15.25)."""
    p = await _product(client, tax_rate=18)
    sale = await _sell(client, p["id"], 1, "card")
    await _owner("""update pos_sale_items set tax_rate = 18, tax_minor = 1525, excl_minor = 8475, tax_inclusive = true
                     where sale_id = $1""", uuid.UUID(sale["id"]))
    rows = await _report(client, f"/reports/tax?{RANGE}")
    row = next(r for r in rows if r["source"] == "pos" and float(r["tax_rate"]) == 18)
    assert (row["taxable_minor"], row["tax_minor"]) == (8475, 1525)
    assert _csv((await client.get(f"/reports/tax?{RANGE}&format=csv")).text)


async def test_attendance_summary_per_employee(client, tenant):
    tid = uuid.UUID(tenant.tenant_id)
    emp = uuid.UUID(tenant.employee_id)
    await _owner("""insert into hrms_attendance (tenant_id, employee_id, work_date, status, worked_min, late_min)
                    values ($1, $2, '2026-09-01', 'present', 480, 0), ($1, $2, '2026-09-02', 'late', 450, 25),
                           ($1, $2, '2026-09-03', 'absent', 0, 0)""", tid, emp)
    rows = await _report(client, "/reports/attendance?from=2026-09-01&to=2026-09-30")
    me = next(r for r in rows if r["employee_id"] == tenant.employee_id)
    assert (me["present"], me["late"], me["absent"]) == (1, 1, 1)
    assert me["worked_min"] == 930 and me["late_min"] == 25
    assert _csv((await client.get("/reports/attendance?from=2026-09-01&to=2026-09-30&format=csv")).text)


async def test_payroll_report_for_an_approved_run_is_audited(client, tenant):
    emp = await new_employee(client, name="Bilal", salary_minor=12_000_000, join_date="2026-01-01")
    run = await approved(client)
    rows = await _report(client, f"/reports/payroll?run_id={run['id']}")
    bilal = next(r for r in rows if r["employee_id"] == emp["id"])
    slip = next(p for p in run["payslips"] if p["employee_id"] == emp["id"])
    assert bilal["net_minor"] == slip["net_minor"] and bilal["gross_minor"] == slip["gross_minor"]
    table = _csv((await client.get(f"/reports/payroll?run_id={run['id']}&format=csv")).text)
    assert table[-1]["Employee"] == "Total"
    audited = await _owner("select 1 from audit_log where tenant_id = $1 and action = 'payroll.export'",
                           uuid.UUID(tenant.tenant_id))
    assert audited
    draft = (await client.post("/payroll/runs", json={"month": "2026-07"})).json()
    assert (await client.get(f"/reports/payroll?run_id={draft['id']}")).status_code == 409


async def test_the_attendance_report_answers_only_to_an_all_grant(client, tenant):
    """The report is tenant-wide. hrms.attendance.read can't be granted at
    'own' or 'team' yet (it isn't scope-wired), so only 'all' holders reach
    it: the same people who see everyone on /hrms/attendance. Wiring the key
    later makes test_scope_wiring demand this route filter too."""
    for scope in ("own", "team"):
        r = await client.post("/roles", json={"name": f"Att {scope} {uuid.uuid4().hex[:4]}",
                                              "grants": [{"permission_key": "hrms.attendance.read", "scope": scope}]})
        assert r.status_code == 422 and "must be 'all'" in r.json()["detail"]
    reader = await _role(client, [{"permission_key": "hrms.attendance.read", "scope": "all"}])
    mate, _, _ = await _user_on(client, [reader])
    try:
        assert (await mate.get("/reports/attendance")).status_code == 200
    finally:
        await mate.aclose()
