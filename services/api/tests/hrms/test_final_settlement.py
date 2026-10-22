"""Final settlement and gratuity (wave C, H12, St12 §3, 0104).

A leaver's settlement is drafted from their exit date:
  payables    gratuity (when the company pays it), encashed annual leave, others;
  receivables outstanding advances, the cost of assets not returned.
Approval needs every asset returned or charged, and books it all as one-offs
in the leaver's last pay month (deductions for receivables), closing the
advances so payroll doesn't take an instalment too. When that run is marked
paid, the settlement is paid and the employee becomes inactive.

Gratuity (settings per company, all to be verified by the founder): 30
days' wages a year, a part year over 6 months counts as a year, at least 12
months' service, on the last basic salary.
"""
from __future__ import annotations

from datetime import date

from app import payroll_engine as eng
from app.settlement import GratuityRule, gratuity

from .payroll_helpers import new_employee, owner_fetch
from .test_payroll_engine import RS, emp
from .test_payroll_runs import calc, new_run

RULE = GratuityRule(enabled=True, days_per_year=30, min_service_months=12, part_year_months=6)


# ── Gratuity arithmetic ─────────────────────────────────────────────────────
def test_gratuity_counts_a_part_year_over_six_months():
    assert gratuity(60_000 * RS, date(2021, 1, 4), date(2026, 9, 15), RULE)[:2] == (6, 360_000 * RS)   # 5y 8m
    assert gratuity(60_000 * RS, date(2021, 3, 16), date(2026, 9, 15), RULE)[0] == 5                   # 5y 6m exactly
    assert gratuity(60_000 * RS, date(2021, 3, 1), date(2026, 9, 15), RULE)[0] == 6                    # 5y 6m 15d


def test_no_gratuity_under_the_minimum_service_or_when_switched_off():
    assert gratuity(60_000 * RS, date(2025, 11, 1), date(2026, 9, 30), RULE)[:2] == (0, 0)             # 11 months
    off = GratuityRule(enabled=False, days_per_year=30, min_service_months=12, part_year_months=6)
    assert gratuity(60_000 * RS, date(2015, 1, 1), date(2026, 9, 30), off)[:2] == (0, 0)


def test_days_per_year_scales_the_amount():
    half = GratuityRule(enabled=True, days_per_year=15, min_service_months=12, part_year_months=6)
    assert gratuity(60_000 * RS, date(2022, 1, 1), date(2026, 1, 1), half)[1] == 4 * 30_000 * RS


# ── The engine pays one-offs to someone no longer employed ─────────────────
def test_a_leaver_paid_after_their_last_month_gets_only_the_one_offs():
    after = emp(period_start=date(2026, 10, 1), period_end=date(2026, 10, 31), pay_date=date(2026, 10, 31),
                segments=[], leaves_on=date(2026, 9, 15),
                one_offs=[eng.OneOff(id="g", code="GRATUITY", name="Gratuity", kind="earning",
                                     amount_minor=100_000 * RS, taxable=True),
                          eng.OneOff(id="a", code="ADVANCE_SETTLE", name="Advance", kind="deduction",
                                     amount_minor=10_000 * RS, taxable=False)])
    res = eng.calculate(after)
    assert res.error is None
    assert {ln.code for ln in res.lines} >= {"GRATUITY", "ADVANCE_SETTLE"}
    assert "BASIC" not in {ln.code for ln in res.lines}
    assert res.gross_minor == 100_000 * RS
    # 100,000 is the year's only income here: under the threshold, no tax.
    assert res.net_minor == 90_000 * RS


# ── The settlement end to end ──────────────────────────────────────────────
async def _leaver(client, join="2021-01-04", last="2026-09-15") -> dict:
    e = await new_employee(client, name="Imran", salary_minor=6_000_000, join_date=join)
    r = await client.post(f"/hrms/employees/{e['id']}/offboarding",
                          json={"reason": "resigned", "last_working_day": last})
    assert r.status_code == 201, r.text
    return e


async def _gratuity_on(client):
    r = await client.put("/payroll/gratuity-settings", json={"enabled": True, "days_per_year": 30,
                                                             "min_service_months": 12, "part_year_months": 6})
    assert r.status_code == 200, r.text


def _codes(s: dict) -> dict[str, int]:
    return {ln["code"]: ln["amount_minor"] for ln in s["lines"]}


async def test_a_settlement_is_drafted_approved_and_paid_with_the_last_salary(client, tenant):
    await _gratuity_on(client)
    e = await _leaver(client)
    await client.post("/payroll/advances", json={"employee_id": e["id"], "principal_minor": 2_000_000,
                                                 "installment_minor": 500_000, "start_month": "2026-09"})
    asset = (await client.post("/hrms/assets", json={"name": "Phone", "category": "phone",
                                                     "value_minor": 4_500_000})).json()
    await client.post(f"/hrms/assets/{asset['id']}/issue", json={"employee_id": e["id"]})

    r = await client.post(f"/hrms/employees/{e['id']}/final-settlement")
    assert r.status_code == 201, r.text
    s = r.json()
    assert s["status"] == "draft" and s["last_working_day"] == "2026-09-15"
    codes = _codes(s)
    assert codes["GRATUITY"] == 36_000_000                      # 6 years × 60,000
    assert codes["ADVANCE_SETTLE"] == 2_000_000 and codes["ASSET_RECOVERY"] == 4_500_000
    assert "LEAVE_ENCASH" in codes
    kinds = {ln["code"]: ln["kind"] for ln in s["lines"]}
    assert kinds["GRATUITY"] == "payable" and kinds["ADVANCE_SETTLE"] == "receivable"
    assert s["net_minor"] == sum(v for k, v in codes.items() if kinds[k] == "payable") - 6_500_000
    assert (await client.post(f"/hrms/employees/{e['id']}/final-settlement")).status_code == 409   # one at a time

    # Dropping the asset charge while the phone is still out blocks approval.
    asset_line = next(ln for ln in s["lines"] if ln["code"] == "ASSET_RECOVERY")
    assert (await client.delete(f"/hrms/final-settlement-lines/{asset_line['id']}")).status_code == 204
    r = await client.post(f"/hrms/final-settlements/{s['id']}/approve")
    assert r.status_code == 409 and "Phone" in r.text
    # A notice-pay line can be added by hand; recalculating restores the charge and keeps it.
    r = await client.post(f"/hrms/final-settlements/{s['id']}/lines",
                          json={"kind": "payable", "code": "NOTICE_PAY", "name": "Notice pay", "amount_minor": 1_000_000})
    assert r.status_code == 201, r.text
    s = (await client.post(f"/hrms/final-settlements/{s['id']}/recalculate")).json()
    assert {"ASSET_RECOVERY", "NOTICE_PAY", "GRATUITY"} <= set(_codes(s))

    r = await client.post(f"/hrms/final-settlements/{s['id']}/approve")
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["status"] == "approved" and s["pay_month"] == "2026-09-01"
    assert all(ln["one_off_id"] for ln in s["lines"])
    adv = await owner_fetch("select status from pay_advances where employee_id = $1::uuid", e["id"])
    assert [a["status"] for a in adv] == ["closed"]
    phone = (await client.get(f"/hrms/assets/{asset['id']}/history")).json()[0]
    assert phone["returned_at"] is not None
    assert (await client.get("/hrms/assets")).json()[0]["status"] in ("lost", "available")
    assert (await client.delete(f"/hrms/final-settlement-lines/{s['lines'][0]['id']}")).status_code == 409

    run = await new_run(client, "2026-09")
    detail = await calc(client, run["id"])
    slip = next(p for p in detail["payslips"] if p["employee_id"] == e["id"])
    full = (await client.get(f"/payroll/runs/{run['id']}/payslips/{slip['id']}")).json()
    lines = {ln["code"] for ln in full["lines"]}
    assert {"BASIC", "GRATUITY", "NOTICE_PAY", "ADVANCE_SETTLE", "ASSET_RECOVERY"} <= lines
    assert "ADVANCE" not in lines                                 # the advance was settled in full instead
    for step in ("approve", "mark-paid"):
        assert (await client.post(f"/payroll/runs/{run['id']}/{step}")).status_code == 200
    s = (await client.get(f"/hrms/final-settlements/{s['id']}")).json()
    assert s["status"] == "paid"
    assert (await client.get(f"/hrms/employees/{e['id']}")).json()["status"] == "inactive"


async def test_when_the_exit_month_is_closed_the_settlement_rides_on_a_later_payslip(client, tenant):
    e = await _leaver(client, join="2024-02-05", last="2026-09-10")
    sept = await new_run(client, "2026-09")
    await calc(client, sept["id"])
    assert (await client.post(f"/payroll/runs/{sept['id']}/approve")).status_code == 200
    s = (await client.post(f"/hrms/employees/{e['id']}/final-settlement")).json()
    await client.post(f"/hrms/final-settlements/{s['id']}/lines",
                      json={"kind": "payable", "code": "BONUS", "name": "Last bonus", "amount_minor": 500_000})
    s = (await client.post(f"/hrms/final-settlements/{s['id']}/approve")).json()
    assert s["pay_month"] == "2026-10-01"
    octo = await new_run(client, "2026-10")
    detail = await calc(client, octo["id"])
    slip = next(p for p in detail["payslips"] if p["employee_id"] == e["id"])
    full = (await client.get(f"/payroll/runs/{octo['id']}/payslips/{slip['id']}")).json()
    codes = {ln["code"] for ln in full["lines"]}
    assert "BONUS" in codes and "BASIC" not in codes


async def test_a_settlement_needs_an_exit_date_and_the_settlement_keys(client, tenant):
    e = await new_employee(client, name="Staying")
    r = await client.post(f"/hrms/employees/{e['id']}/final-settlement")
    assert r.status_code == 422 and "leaving" in r.text
    from .payroll_helpers import login_with_role
    hr = await login_with_role(client, "HR only", {"hrms": ["read", "write", "admin"]})
    try:
        assert (await hr.get("/hrms/final-settlements")).status_code == 403
    finally:
        await hr.aclose()


async def test_gratuity_settings_start_off_and_unverified(client, tenant):
    g = (await client.get("/payroll/gratuity-settings")).json()
    assert g["enabled"] is False and g["verified"] is False and g["days_per_year"] == 30
    assert (await client.put("/payroll/gratuity-settings", json={**g, "days_per_year": 0})).status_code == 422
