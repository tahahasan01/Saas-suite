"""Provident fund (0113): for companies that run one instead of gratuity.

The company sets the fund on the Pay policies: the employee's and the
employer's rate, on basic pay or on gross, and the months of service after
which the employer's share belongs to the employee. HR enrols people from a
date. Payroll deducts the employee's share (PF_EE) and records the
employer's (PF_ER) every month. The balance is those lines in final runs,
plus what HR records (an opening balance, a withdrawal). On leaving, the
final settlement pays out the employee's share and the vested employer
share, tax-free, and empties the fund.
"""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from httpx import ASGITransport, AsyncClient

from app import payroll_engine as eng
from app.main import app
from app.security import SESSION_COOKIE

from ..core.test_rbac_v2 import _role, _user_on
from .payroll_helpers import new_employee
from .test_employee_portal import _link_login
from .test_payroll_engine import RS, emp, line
from .test_payroll_runs import calc, new_run

FUND = {"pf_enabled": True, "pf_employee_rate": 8.33, "pf_employer_rate": 8.33, "pf_base": "basic",
        "pf_vesting_months": 24}


# ── The engine ──────────────────────────────────────────────────────────────
def test_payroll_takes_the_members_share_and_records_the_employers():
    rule = eng.ProvidentFund(employee_rate=Decimal("0.0833"), employer_rate=Decimal("0.0833"), base="basic")
    res = eng.calculate(emp(provident_fund=rule))
    assert line(res, "PF_EE").amount_minor == 20_825 * RS           # 8.33% of 250,000
    assert line(res, "PF_EE").kind == "deduction"
    assert line(res, "PF_ER").kind == "employer_contribution" and line(res, "PF_ER").amount_minor == 20_825 * RS
    plain = eng.calculate(emp())
    assert res.tax_minor == plain.tax_minor                          # the member's share isn't tax relief
    assert res.net_minor == plain.net_minor - 20_825 * RS


def test_a_part_month_pays_a_part_contribution():
    rule = eng.ProvidentFund(employee_rate=Decimal("0.10"), employer_rate=Decimal("0.10"), base="basic")
    res = eng.calculate(emp(provident_fund=rule, period_start=date(2026, 9, 1), period_end=date(2026, 9, 30),
                            pay_date=date(2026, 9, 30),
                            segments=[eng.Segment(date(2026, 9, 16), date(2026, 9, 30), 60_000 * RS)]))
    assert line(res, "PF_EE").amount_minor == 3_000 * RS             # 10% of the 30,000 paid


# ── Through the API ─────────────────────────────────────────────────────────
async def _member(client, **extra) -> dict:
    assert (await client.put("/payroll/policies", json={"encash_basis": "days_30", "gratuity_tax": "taxed",
                                                        **FUND})).status_code == 200
    e = await new_employee(client, name="Farah", salary_minor=10_000_000, join_date="2023-01-02", **extra)
    r = await client.put(f"/payroll/pf/{e['id']}", json={"member": True, "joined_on": "2023-01-02"})
    assert r.status_code == 200, r.text
    return e


async def test_a_run_contributes_and_the_balance_adds_up(client, tenant):
    e = await _member(client)
    r = await client.post(f"/payroll/pf/{e['id']}/entries",
                          json={"kind": "opening", "employee_minor": 5_000_000, "employer_minor": 5_000_000,
                                "note": "Brought over from the old system"})
    assert r.status_code == 201, r.text
    run = await new_run(client, "2026-09")
    detail = await calc(client, run["id"])
    slip = next(p for p in detail["payslips"] if p["employee_id"] == e["id"])
    full = (await client.get(f"/payroll/runs/{run['id']}/payslips/{slip['id']}")).json()
    codes = {ln["code"]: ln["amount_minor"] for ln in full["lines"]}
    assert codes["PF_EE"] == 833_000 and codes["PF_ER"] == 833_000     # 8.33% of 100,000
    # Not counted until the run is final.
    assert (await client.get(f"/payroll/pf/{e['id']}")).json()["employee_minor"] == 5_000_000
    assert (await client.post(f"/payroll/runs/{run['id']}/approve")).status_code == 200
    bal = (await client.get(f"/payroll/pf/{e['id']}")).json()
    assert (bal["employee_minor"], bal["employer_minor"]) == (5_833_000, 5_833_000)
    assert bal["vested_employer_minor"] == 5_833_000                    # 3+ years: past the 24-month vesting

    token = await _link_login(tenant.tenant_id, e["id"], f"pf+{uuid.uuid4().hex[:8]}@example.com")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test",
                           cookies={SESSION_COOKIE: token}) as me:
        mine = (await me.get("/me/pf")).json()
        assert mine["employee_minor"] == 5_833_000 and len(mine["history"]) >= 2


async def test_a_withdrawal_cant_exceed_the_balance(client, tenant):
    e = await _member(client)
    await client.post(f"/payroll/pf/{e['id']}/entries", json={"kind": "opening", "employee_minor": 1_000_000,
                                                              "employer_minor": 0})
    too_much = await client.post(f"/payroll/pf/{e['id']}/entries",
                                 json={"kind": "withdrawal", "employee_minor": 2_000_000, "employer_minor": 0})
    assert too_much.status_code == 422
    ok = await client.post(f"/payroll/pf/{e['id']}/entries",
                           json={"kind": "withdrawal", "employee_minor": 400_000, "employer_minor": 0,
                                 "note": "Daughter's wedding"})
    assert ok.status_code == 201
    assert (await client.get(f"/payroll/pf/{e['id']}")).json()["employee_minor"] == 600_000


async def test_leaving_pays_out_the_fund_with_the_vested_employer_share(client, tenant):
    await client.put("/payroll/policies", json={"encash_basis": "days_30", "gratuity_tax": "taxed",
                                                "paid_on_leaving_ids": [], **FUND})
    e = await new_employee(client, name="Waqas", salary_minor=10_000_000, join_date="2025-06-02")
    await client.put(f"/payroll/pf/{e['id']}", json={"member": True, "joined_on": "2025-06-02"})
    await client.post(f"/payroll/pf/{e['id']}/entries", json={"kind": "opening", "employee_minor": 3_000_000,
                                                              "employer_minor": 3_000_000})
    await client.post(f"/hrms/employees/{e['id']}/offboarding", json={"reason": "resigned",
                                                                      "last_working_day": "2026-09-30"})
    s = (await client.post(f"/hrms/employees/{e['id']}/final-settlement")).json()
    pf = [ln for ln in s["lines"] if ln["code"] == "PF_PAYOUT"]
    # 16 months: under 24, so only their own share.
    assert [(ln["amount_minor"], ln["taxable"]) for ln in pf] == [(3_000_000, False)]
    assert (await client.post(f"/hrms/final-settlements/{s['id']}/approve")).status_code == 200
    bal = (await client.get(f"/payroll/pf/{e['id']}")).json()
    assert bal["employee_minor"] == 0 and bal["member"] is False


async def test_the_fund_needs_payroll_rights_and_is_per_company(client, tenant):
    e = await _member(client)
    rid = await _role(client, [{"permission_key": "hrms.employee.read", "scope": "all"}])
    mate, _, _ = await _user_on(client, [rid])
    try:
        assert (await mate.get(f"/payroll/pf/{e['id']}")).status_code == 403
        assert (await mate.put(f"/payroll/pf/{e['id']}", json={"member": False})).status_code == 403
    finally:
        await mate.aclose()
    assert (await client.get(f"/payroll/pf/{uuid.uuid4()}")).status_code == 404


# ── The report ──────────────────────────────────────────────────────────────
async def test_the_fund_report_lists_a_runs_contributions_with_the_fund_to_date(client, tenant):
    e = await _member(client)
    await client.post(f"/payroll/pf/{e['id']}/entries", json={"kind": "opening", "employee_minor": 5_000_000,
                                                              "employer_minor": 4_000_000})
    run = await new_run(client, "2026-09")
    await calc(client, run["id"])
    assert (await client.get(f"/reports/provident-fund?run_id={run['id']}")).status_code == 409   # not final yet
    assert (await client.post(f"/payroll/runs/{run['id']}/approve")).status_code == 200
    r = await client.get(f"/reports/provident-fund?run_id={run['id']}")
    assert r.status_code == 200, r.text
    body = r.json()
    farah = next(x for x in body["rows"] if x["employee_id"] == e["id"])
    assert (farah["employee_minor"], farah["employer_minor"], farah["total_minor"]) == (833_000, 833_000, 1_666_000)
    assert farah["fund_minor"] == 5_000_000 + 4_000_000 + 1_666_000
    assert body["total"]["total_minor"] >= 1_666_000 and body["masked"] is False
    # Only members with fund lines are listed.
    assert all(x["total_minor"] > 0 for x in body["rows"])
    table = (await client.get(f"/reports/provident-fund?run_id={run['id']}&format=csv")).text
    assert "Employee share (PKR)" in table and "8330.00" in table and table.strip().splitlines()[-1].startswith("Total")

    # Someone who may export reports but not see pay gets the names only.
    rid = await _role(client, [{"permission_key": "payroll.report.export", "scope": "all"}])
    mate, _, _ = await _user_on(client, [rid])
    try:
        masked = (await mate.get(f"/reports/provident-fund?run_id={run['id']}")).json()
        row = next(x for x in masked["rows"] if x["employee_id"] == e["id"])
        assert masked["masked"] is True and row["employee_minor"] is None and row["fund_minor"] is None
    finally:
        await mate.aclose()
    assert (await client.get(f"/reports/provident-fund?run_id={uuid.uuid4()}")).status_code == 404


async def test_the_balance_says_whether_the_company_runs_a_fund(client, tenant):
    """The profile card and My provident fund explain an empty fund."""
    e = await _member(client)
    bal = (await client.get(f"/payroll/pf/{e['id']}")).json()
    assert bal["fund_on"] is True and bal["vesting_months"] == 24
    await client.put("/payroll/policies", json={"encash_basis": "days_30", "gratuity_tax": "taxed",
                                                **{**FUND, "pf_enabled": False}})
    assert (await client.get(f"/payroll/pf/{e['id']}")).json()["fund_on"] is False
