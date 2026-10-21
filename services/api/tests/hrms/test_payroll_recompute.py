"""The one-time "recompute this tax year" adjustment run (St03 risk 2).

Before Phase 1 the payroll screen taxed salaries under pre-2025 slabs
(5/15/25/30/35%). Months a tenant paid that way, outside saved runs, are
re-taxed under the current table; the difference is one refund or recovery
line per employee. Months already paid by a saved run are left alone."""
from __future__ import annotations

from app import jobs, payroll


def test_the_legacy_slabs_reproduce_what_the_old_screen_withheld():
    # 400,000 a month = 4.8M a year → 700,000 + 35% × 700,000 = 945,000 → 78,750 a month.
    assert payroll.legacy_monthly_tax_minor(40_000_000) == 7_875_000
    assert payroll.legacy_monthly_tax_minor(5_000_000) == 0          # 600k a year: nothing
    assert payroll.legacy_monthly_tax_minor(10_000_000) == 250_000   # 1.2M: 5% over 600k = 30,000 a year


async def _calc(client, run_id):
    await client.post(f"/payroll/runs/{run_id}/calculate")
    await jobs.HANDLERS["payroll.calculate"]()
    return (await client.get(f"/payroll/runs/{run_id}")).json()


async def test_recompute_refunds_what_the_old_slabs_over_withheld(client, tenant):
    await client.patch(f"/hrms/employees/{tenant.employee_id}", json={"salary_minor": 40_000_000})
    r = await client.post("/payroll/runs/recompute-tax-year", json={"tax_year": "TY2027", "through_month": "2026-09"})
    assert r.status_code == 201, r.text
    run = r.json()
    assert (run["kind"], run["purpose"], run["number"]) == ("adjustment", "recompute_tax_year", "PR-TY2027-RECOMPUTE")
    detail = await _calc(client, run["id"])
    assert detail["status"] == "review"
    slip = next(p for p in detail["payslips"] if p["employee_id"] == tenant.employee_id)
    full = (await client.get(f"/payroll/runs/{run['id']}/payslips/{slip['id']}")).json()
    tax = next(ln for ln in full["lines"] if ln["code"] == "INCOME_TAX")
    # July–September: 3 × (62,000 now − 78,750 then) = −50,250, refunded.
    assert tax["amount_minor"] == -5_025_000
    assert slip["net_minor"] == 5_025_000
    assert [m["month"] for m in tax["explain"]["months"]] == ["2026-07", "2026-08", "2026-09"]
    assert tax["explain"]["withheld_minor"] == 3 * 7_875_000
    assert tax["explain"]["correct_minor"] == 3 * 6_200_000
    assert (await client.post(f"/payroll/runs/{run['id']}/approve")).status_code == 200


async def test_months_paid_by_a_saved_run_are_not_recomputed(client, tenant):
    await client.patch(f"/hrms/employees/{tenant.employee_id}", json={"salary_minor": 40_000_000})
    sept = (await client.post("/payroll/runs", json={"month": "2026-09"})).json()
    await _calc(client, sept["id"])
    await client.post(f"/payroll/runs/{sept['id']}/approve")
    run = (await client.post("/payroll/runs/recompute-tax-year",
                             json={"tax_year": "TY2027", "through_month": "2026-09"})).json()
    detail = await _calc(client, run["id"])
    slip = next(p for p in detail["payslips"] if p["employee_id"] == tenant.employee_id)
    full = (await client.get(f"/payroll/runs/{run['id']}/payslips/{slip['id']}")).json()
    tax = next(ln for ln in full["lines"] if ln["code"] == "INCOME_TAX")
    assert [m["month"] for m in tax["explain"]["months"]] == ["2026-07", "2026-08"]


async def test_a_tax_year_is_recomputed_once(client, tenant):
    body = {"tax_year": "TY2027", "through_month": "2026-08"}
    assert (await client.post("/payroll/runs/recompute-tax-year", json=body)).status_code == 201
    assert (await client.post("/payroll/runs/recompute-tax-year", json=body)).status_code == 409


async def test_bad_recompute_input_is_422(client, tenant):
    assert (await client.post("/payroll/runs/recompute-tax-year",
                              json={"tax_year": "TY1999", "through_month": "1998-08"})).status_code == 422
    assert (await client.post("/payroll/runs/recompute-tax-year",
                              json={"tax_year": "TY2027", "through_month": "2027-08"})).status_code == 422
