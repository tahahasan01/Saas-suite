"""Pay policies each company sets (0112): the product is sold to many companies,
so the rules that differ between them are settings with presets, not code.

  encashment     per-day pay for encashed leave: salary ÷ 30, ÷ 26, or that
                 month's working days;
  gratuity tax   taxed, tax-free, or tax-free up to a limit;
  leaving        which leave types are paid out in a final settlement.

Presets fill these in together with the gratuity rule (0104) and the
overtime rates (0109); every field can be changed after. Past payslips and
settlements keep the numbers they were made with.
"""
from __future__ import annotations

from decimal import Decimal

from app import payroll_engine as eng

from ..core.test_rbac_v2 import _role, _user_on
from .payroll_helpers import new_employee


def test_the_per_day_rate_follows_the_divisor():
    base = 6_000_000                                          # Rs 60,000
    assert eng.encash_amount(base, Decimal(3), divisor=30) == (200_000, 600_000)
    assert eng.encash_amount(base, Decimal(2), divisor=26) == (230_769, 461_538)
    assert eng.encash_amount(base, Decimal("1.5"), divisor=25) == (240_000, 360_000)
    assert eng.encash_amount(base, Decimal(1), divisor=0) == (0, 0)


async def test_policies_start_from_safe_defaults(client, tenant):
    r = await client.get("/payroll/policies")
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["encash_basis"] == "days_30" and p["gratuity_tax"] == "taxed" and p["preset"] is None
    annual = next(t for t in p["leave_types"] if t["code"] == "annual")
    casual = next(t for t in p["leave_types"] if t["code"] == "casual")
    assert annual["paid_on_leaving"] is True and casual["paid_on_leaving"] is False
    assert {x["key"] for x in (await client.get("/payroll/policy-presets")).json()} >= {
        "standing_orders", "provident_fund", "small_business"}


async def test_a_preset_sets_every_rule_at_once_and_fields_can_change_after(client, tenant):
    r = await client.post("/payroll/policies/apply-preset", json={"preset": "standing_orders"})
    assert r.status_code == 200, r.text
    assert r.json()["preset"] == "standing_orders"
    g = (await client.get("/payroll/gratuity-settings")).json()
    assert g["enabled"] is True and g["days_per_year"] == 30
    r = await client.post("/payroll/policies/apply-preset", json={"preset": "provident_fund"})
    assert (await client.get("/payroll/gratuity-settings")).json()["enabled"] is False

    casual = next(t for t in r.json()["leave_types"] if t["code"] == "casual")
    r = await client.put("/payroll/policies", json={"encash_basis": "days_26", "gratuity_tax": "exempt_up_to",
                                                    "gratuity_exempt_minor": 7_500_000,
                                                    "paid_on_leaving_ids": [casual["id"]]})
    assert r.status_code == 200, r.text
    p = r.json()
    assert (p["encash_basis"], p["gratuity_tax"], p["gratuity_exempt_minor"]) == ("days_26", "exempt_up_to", 7_500_000)
    assert {t["code"] for t in p["leave_types"] if t["paid_on_leaving"]} == {"casual"}
    assert p["preset"] == "provident_fund"                 # what it started from, then changed
    bad = await client.put("/payroll/policies", json={"encash_basis": "days_26", "gratuity_tax": "exempt_up_to"})
    assert bad.status_code == 422                          # a limit is needed for "up to"


async def test_encashment_uses_the_company_divisor(client, tenant):
    await client.put("/payroll/policies", json={"encash_basis": "days_26", "gratuity_tax": "taxed"})
    e = await new_employee(client, name="Daniyal", salary_minor=5_200_000, join_date="2025-01-06")
    annual = next(b["leave_type_id"] for b in (await client.get("/hrms/leave/balances",
                                                                params={"employee_id": e["id"]})).json()
                  if b["leave_type"] == "annual")
    enc = (await client.post(f"/hrms/employees/{e['id']}/leave-encashments",
                             json={"leave_type_id": annual, "days": 2})).json()
    assert (enc["per_day_minor"], enc["amount_minor"]) == (200_000, 400_000)   # 52,000 ÷ 26


async def test_a_settlement_follows_the_gratuity_tax_and_leaving_payouts(client, tenant):
    await client.put("/payroll/gratuity-settings", json={"enabled": True, "days_per_year": 30,
                                                         "min_service_months": 12, "part_year_months": 6})
    await client.put("/payroll/policies", json={"encash_basis": "days_30", "gratuity_tax": "exempt_up_to",
                                                "gratuity_exempt_minor": 10_000_000, "paid_on_leaving_ids": []})
    e = await new_employee(client, name="Shazia", salary_minor=6_000_000, join_date="2021-01-04")
    await client.post(f"/hrms/employees/{e['id']}/offboarding", json={"reason": "resigned",
                                                                      "last_working_day": "2026-09-15"})
    s = (await client.post(f"/hrms/employees/{e['id']}/final-settlement")).json()
    grat = [ln for ln in s["lines"] if ln["code"] == "GRATUITY"]
    # Rs 360,000 of gratuity: the first Rs 100,000 tax-free, the rest taxed.
    assert sorted((ln["amount_minor"], ln["taxable"]) for ln in grat) == [(10_000_000, False), (26_000_000, True)]
    assert not [ln for ln in s["lines"] if ln["code"] == "LEAVE_ENCASH"]      # no leave type is paid out


async def test_setting_policies_needs_payroll_settings(client, tenant):
    rid = await _role(client, [{"permission_key": "payroll.run.read", "scope": "all"}])
    mate, _, _ = await _user_on(client, [rid])
    try:
        assert (await mate.get("/payroll/policies")).status_code == 200
        assert (await mate.put("/payroll/policies", json={"encash_basis": "days_26",
                                                          "gratuity_tax": "taxed"})).status_code == 403
        assert (await mate.post("/payroll/policies/apply-preset",
                                json={"preset": "small_business"})).status_code == 403
    finally:
        await mate.aclose()
