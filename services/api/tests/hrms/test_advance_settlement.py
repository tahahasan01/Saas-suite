"""Paying off a loan or advance early (wave A leftover, H11, 0107).

Two ways: cash paid back to the company (any part of what's left), or the
whole balance taken from the next salary in one go (an ADVANCE_SETTLE
deduction). Either way payroll then takes only what is still owed, never
the old instalment on top, and a loan paid off in full closes.
"""
from __future__ import annotations

from .payroll_helpers import new_employee, owner_fetch
from .test_payroll_runs import calc, new_run


async def _loan(client, eid: str, principal=3_000_000, inst=1_000_000, start="2026-09") -> dict:
    r = await client.post("/payroll/advances", json={"employee_id": eid, "principal_minor": principal,
                                                     "installment_minor": inst, "start_month": start})
    assert r.status_code == 201, r.text
    return r.json()


async def _slip_codes(client, run_id: str, eid: str) -> dict[str, int]:
    detail = (await client.get(f"/payroll/runs/{run_id}")).json()
    slip = next(p for p in detail["payslips"] if p["employee_id"] == eid)
    full = (await client.get(f"/payroll/runs/{run_id}/payslips/{slip['id']}")).json()
    return {ln["code"]: ln["amount_minor"] for ln in full["lines"]}


async def test_cash_paid_back_lowers_what_payroll_takes(client, tenant):
    e = await new_employee(client, name="Faisal", salary_minor=6_000_000)
    loan = await _loan(client, e["id"])
    r = await client.post(f"/payroll/advances/{loan['id']}/repay",
                          json={"method": "cash", "amount_minor": 2_500_000, "note": "Paid at the counter"})
    assert r.status_code == 200, r.text
    assert r.json()["outstanding_minor"] == 500_000 and r.json()["status"] == "active"

    run = await new_run(client, "2026-09")
    await calc(client, run["id"])
    assert (await _slip_codes(client, run["id"], e["id"]))["ADVANCE"] == 500_000     # not the 10,000 instalment


async def test_paying_the_rest_in_cash_closes_the_loan(client, tenant):
    e = await new_employee(client, name="Rabia", salary_minor=6_000_000)
    loan = await _loan(client, e["id"])
    assert (await client.post(f"/payroll/advances/{loan['id']}/repay",
                              json={"method": "cash", "amount_minor": 3_100_000})).status_code == 422   # more than owed
    r = await client.post(f"/payroll/advances/{loan['id']}/repay", json={"method": "cash"})        # all of it
    assert r.status_code == 200 and r.json()["status"] == "closed" and r.json()["outstanding_minor"] == 0
    assert (await client.post(f"/payroll/advances/{loan['id']}/repay", json={"method": "cash"})).status_code == 409
    run = await new_run(client, "2026-09")
    await calc(client, run["id"])
    assert "ADVANCE" not in await _slip_codes(client, run["id"], e["id"])


async def test_the_whole_balance_can_come_off_the_next_salary(client, tenant):
    e = await new_employee(client, name="Kamran", salary_minor=6_000_000)
    loan = await _loan(client, e["id"], start="2026-10")
    r = await client.post(f"/payroll/advances/{loan['id']}/repay", json={"method": "payroll"})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["status"] == "closed" and out["outstanding_minor"] == 0
    one_off = await owner_fetch(
        "select code, kind, amount_minor, period from pay_one_offs where employee_id = $1::uuid", e["id"])
    assert [(o["code"], o["kind"], o["amount_minor"]) for o in one_off] == [("ADVANCE_SETTLE", "deduction", 3_000_000)]
    run = await new_run(client, f"{one_off[0]['period']:%Y-%m}")
    await calc(client, run["id"])
    codes = await _slip_codes(client, run["id"], e["id"])
    assert codes["ADVANCE_SETTLE"] == 3_000_000 and "ADVANCE" not in codes
    # A part through payroll isn't offered: the whole balance or cash.
    loan2 = await _loan(client, e["id"])
    assert (await client.post(f"/payroll/advances/{loan2['id']}/repay",
                              json={"method": "payroll", "amount_minor": 100})).status_code == 422


async def test_repayments_need_pay_rights_and_a_final_settlement_sees_them(client, tenant):
    from .payroll_helpers import login_with_role
    e = await new_employee(client, name="Zara", salary_minor=6_000_000, join_date="2024-01-01")
    loan = await _loan(client, e["id"])
    hr = await login_with_role(client, "HR only", {"hrms": ["read", "write", "admin"], "payroll": ["read"]})
    try:
        assert (await hr.post(f"/payroll/advances/{loan['id']}/repay", json={"method": "cash"})).status_code == 403
    finally:
        await hr.aclose()
    await client.post(f"/payroll/advances/{loan['id']}/repay", json={"method": "cash", "amount_minor": 1_000_000})
    await client.post(f"/hrms/employees/{e['id']}/offboarding", json={"reason": "resigned", "last_working_day": "2026-09-30"})
    s = (await client.post(f"/hrms/employees/{e['id']}/final-settlement")).json()
    owed = {ln["code"]: ln["amount_minor"] for ln in s["lines"]}
    assert owed["ADVANCE_SETTLE"] == 2_000_000
