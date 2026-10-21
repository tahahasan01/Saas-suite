"""Payroll set-up through the API: components and structures (validated at
save time), one-offs, advances with instalment recovery, and statutory
registrations — EOBI, and PESSI/SESSI by work province (D-45, §6.5)."""
from __future__ import annotations

import uuid

import pytest_asyncio

from app import jobs

from .payroll_helpers import login_with_role, new_employee, owner_execute

MONTH = "2026-09"


async def calc(client, month=MONTH) -> dict:
    run = (await client.post("/payroll/runs", json={"month": month})).json()
    await client.post(f"/payroll/runs/{run['id']}/calculate")
    await jobs.HANDLERS["payroll.calculate"]()
    return (await client.get(f"/payroll/runs/{run['id']}")).json()


async def lines_of(client, run: dict, employee_id: str) -> dict[str, dict]:
    slip = next(p for p in run["payslips"] if p["employee_id"] == employee_id)
    full = (await client.get(f"/payroll/runs/{run['id']}/payslips/{slip['id']}")).json()
    return {ln["code"]: ln for ln in full["lines"]}


async def component(client, **body) -> dict:
    r = await client.post("/payroll/components", json=body)
    assert r.status_code == 201, r.text
    return r.json()


@pytest_asyncio.fixture
async def hr_clerk(client, tenant):
    c = await login_with_role(client, "HR clerk", {"hrms": ["read", "write"]})
    yield c
    await c.aclose()


# ── Components and structures ────────────────────────────────────────────────
async def test_a_structure_splits_pay_and_runs_use_it(client, tenant):
    basic = await component(client, code="BASIC", name="Basic", calc="formula", formula="round(BASE / 1.5)")
    hra = await component(client, code="HRA", name="House rent", calc="percent", percent=40, percent_of="BASIC")
    med = await component(client, code="MEDICAL", name="Medical", calc="formula", formula="BASE - BASIC - HRA",
                          taxable=False)
    r = await client.post("/payroll/structures", json={"name": "Staff", "component_ids": [med["id"], hra["id"],
                                                                                         basic["id"]]})
    assert r.status_code == 201, r.text
    s = r.json()
    assert s["order"] == ["BASIC", "HRA", "MEDICAL"]
    emp = await new_employee(client, salary_minor=0, join_date="2026-01-01")
    assert (await client.post(f"/payroll/employees/{emp['id']}/compensation", json={
        "effective_from": "2026-01-01", "base_minor": 15_000_000, "structure_id": s["id"]})).status_code == 201
    lines = await lines_of(client, await calc(client), emp["id"])
    assert (lines["BASIC"]["amount_minor"], lines["HRA"]["amount_minor"], lines["MEDICAL"]["amount_minor"]) == (
        10_000_000, 4_000_000, 1_000_000)
    assert lines["MEDICAL"]["taxable"] is False


async def test_a_cycle_is_refused_when_the_structure_is_saved(client, tenant):
    a = await component(client, code="AAA", name="A", calc="formula", formula="BBB + 1")
    b = await component(client, code="BBB", name="B", calc="formula", formula="AAA + 1")
    r = await client.post("/payroll/structures", json={"name": "Loop", "component_ids": [a["id"], b["id"]]})
    assert r.status_code == 422 and "loop" in r.text


async def test_unknown_codes_and_bad_formulas_are_refused(client, tenant):
    r = await client.post("/payroll/components", json={"code": "X", "name": "X", "calc": "formula",
                                                       "formula": "BASE * "})
    assert r.status_code == 422 and "Formula" in r.text
    c = await component(client, code="BONUS2", name="B", calc="formula", formula="TIPS * 2")
    r = await client.post("/payroll/structures", json={"name": "S", "component_ids": [c["id"]]})
    assert r.status_code == 422 and "TIPS" in r.text


async def test_editing_a_component_into_a_loop_is_refused(client, tenant):
    a = await component(client, code="AAA", name="A", calc="fixed", amount_minor=100)
    b = await component(client, code="BBB", name="B", calc="formula", formula="AAA + 1")
    assert (await client.post("/payroll/structures", json={"name": "S", "component_ids": [a["id"], b["id"]]})
            ).status_code == 201
    r = await client.patch(f"/payroll/components/{a['id']}", json={"calc": "formula", "formula": "BBB"})
    assert r.status_code == 422
    assert (await client.get("/payroll/components")).json()[0]["calc"] == "fixed"   # rolled back


async def test_reserved_and_duplicate_codes(client, tenant):
    assert (await client.post("/payroll/components", json={"code": "INCOME_TAX", "name": "x"})).status_code == 422
    assert (await client.post("/payroll/components", json={"code": "BASE", "name": "x"})).status_code == 422
    assert (await client.post("/payroll/components", json={"code": "lower", "name": "x"})).status_code == 422
    await component(client, code="FUEL", name="Fuel")
    assert (await client.post("/payroll/components", json={"code": "FUEL", "name": "x"})).status_code == 409


async def test_setup_needs_payroll_keys(client, tenant, hr_clerk):
    assert (await hr_clerk.get("/payroll/components")).status_code == 403
    assert (await hr_clerk.post("/payroll/components", json={"code": "X", "name": "x"})).status_code == 403
    assert (await hr_clerk.get("/payroll/statutory")).status_code == 403


# ── One-offs and advances ────────────────────────────────────────────────────
async def test_a_one_off_is_paid_once_by_the_run_that_approves_it(client, tenant):
    r = await client.post("/payroll/one-offs", json={"employee_id": tenant.employee_id, "month": MONTH,
                                                     "code": "BONUS", "name": "Eid bonus", "amount_minor": 2_000_000})
    assert r.status_code == 201
    oid = r.json()["id"]
    run = await calc(client)
    assert (await lines_of(client, run, tenant.employee_id))["BONUS"]["amount_minor"] == 2_000_000
    await client.post(f"/payroll/runs/{run['id']}/approve")
    one = next(o for o in (await client.get(f"/payroll/one-offs?month={MONTH}")).json() if o["id"] == oid)
    assert one["status"] == "applied" and one["run_id"] == run["id"]
    assert (await client.post(f"/payroll/one-offs/{oid}/void")).status_code == 409
    # Reopening returns it to pending.
    await client.post(f"/payroll/runs/{run['id']}/reopen", json={"note": "Check bonus"})
    one = next(o for o in (await client.get(f"/payroll/one-offs?month={MONTH}")).json() if o["id"] == oid)
    assert one["status"] == "pending"


async def test_an_advance_is_recovered_in_instalments_and_closes(client, tenant):
    r = await client.post("/payroll/advances", json={"employee_id": tenant.employee_id, "principal_minor": 1_500_000,
                                                     "installment_minor": 1_000_000, "start_month": "2026-08"})
    assert r.status_code == 201, r.text
    aid = r.json()["id"]
    for month, expected in (("2026-08", 1_000_000), ("2026-09", 500_000)):
        run = await calc(client, month)
        assert (await lines_of(client, run, tenant.employee_id))["ADVANCE"]["amount_minor"] == expected
        await client.post(f"/payroll/runs/{run['id']}/approve")
    adv = next(a for a in (await client.get("/payroll/advances")).json() if a["id"] == aid)
    assert (adv["recovered_minor"], adv["outstanding_minor"], adv["status"]) == (1_500_000, 0, "closed")
    run = await calc(client, "2026-10")
    assert "ADVANCE" not in await lines_of(client, run, tenant.employee_id)


async def test_an_instalment_larger_than_the_advance_is_422(client, tenant):
    r = await client.post("/payroll/advances", json={"employee_id": tenant.employee_id, "principal_minor": 100,
                                                     "installment_minor": 200, "start_month": MONTH})
    assert r.status_code == 422


async def test_one_offs_for_unknown_employees_are_404(client, tenant):
    r = await client.post("/payroll/one-offs", json={"employee_id": str(uuid.uuid4()), "month": MONTH,
                                                     "name": "x", "amount_minor": 1})
    assert r.status_code == 404


# ── Statutory (D-45) ─────────────────────────────────────────────────────────
async def _set_province(tenant, name: str) -> None:
    await owner_execute(
        """insert into fbr_settings (tenant_id, seller_province) values ($1, $2)
           on conflict (tenant_id) do update set seller_province = excluded.seller_province""",
        uuid.UUID(tenant.tenant_id), name)


async def test_statutory_lists_schemes_with_unverified_rates(client, tenant):
    s = (await client.get("/payroll/statutory")).json()
    codes = {x["code"]: x for x in s["schemes"]}
    assert set(codes) >= {"EOBI", "PESSI", "SESSI", "KP_ESSI", "BESSI"}
    assert codes["KP_ESSI"]["available"] is False and codes["BESSI"]["available"] is False
    assert all(not r["verified"] for r in codes["EOBI"]["rates"])
    assert s["rates_verified"] is False
    r = await client.put("/payroll/statutory/KP_ESSI", json={"enabled": True})
    assert r.status_code == 422


async def test_without_a_registration_no_contributions_are_taken(client, tenant):
    lines = await lines_of(client, await calc(client), tenant.employee_id)
    assert not any(c.startswith(("EOBI", "PESSI", "SESSI")) for c in lines)


async def test_eobi_and_pessi_for_a_punjab_business(client, tenant):
    """§6.5 vector: EOBI on the 40,000 base → 400 employee, 2,000 employer;
    PESSI 6% employer on the minimum wage. The banner names them."""
    await _set_province(tenant, "Punjab")
    for scheme in ("EOBI", "PESSI"):
        r = await client.put(f"/payroll/statutory/{scheme}", json={"enabled": True, "registration_no": "R-1"})
        assert r.status_code == 200, r.text
    run = await calc(client)
    lines = await lines_of(client, run, tenant.employee_id)
    assert lines["EOBI_EE"]["amount_minor"] == 40_000 and lines["EOBI_EE"]["kind"] == "deduction"
    assert lines["EOBI_ER"]["amount_minor"] == 200_000 and lines["EOBI_ER"]["kind"] == "employer_contribution"
    assert lines["PESSI_ER"]["amount_minor"] == 240_000
    assert "SESSI_ER" not in lines
    assert lines["PESSI_ER"]["explain"]["province"] == "PB"
    assert "FBR" in lines["PESSI_ER"]["explain"]["province_source"]
    assert run["rates_verified"] is False
    assert any("EOBI" in u for u in run["unverified"]) and any("PESSI" in u for u in run["unverified"])


async def test_sindh_gets_sessi_and_its_own_minimum_wage(client, tenant):
    await _set_province(tenant, "SINDH")
    for scheme in ("EOBI", "SESSI", "PESSI"):
        await client.put(f"/payroll/statutory/{scheme}", json={"enabled": True})
    lines = await lines_of(client, await calc(client), tenant.employee_id)
    assert lines["SESSI_ER"]["amount_minor"] == 258_000      # 6% of Sindh's 43,000 from July 2026
    assert "PESSI_ER" not in lines


async def test_the_work_location_decides_the_province_before_the_company(client, tenant):
    """A Punjab company with a Karachi site: that employee pays SESSI (D-45:
    by the province of the work location), and the FBR province is only the
    fallback."""
    await _set_province(tenant, "Punjab")
    for scheme in ("EOBI", "SESSI", "PESSI"):
        await client.put(f"/payroll/statutory/{scheme}", json={"enabled": True})
    site = (await client.post("/hrms/locations", json={"name": "Karachi store", "province": "SD"})).json()
    r = await client.patch(f"/hrms/employees/{tenant.employee_id}/job", json={"location_id": site["id"]})
    assert r.status_code == 200, r.text
    run = await calc(client)
    lines = await lines_of(client, run, tenant.employee_id)
    assert "SESSI_ER" in lines and "PESSI_ER" not in lines
    slip = next(p for p in run["payslips"] if p["employee_id"] == tenant.employee_id)
    full = (await client.get(f"/payroll/runs/{run['id']}/payslips/{slip['id']}")).json()
    assert "Karachi store" in str(full)


async def test_balochistan_eobi_uses_its_lower_base(client, tenant):
    await _set_province(tenant, "Balochistan")
    await client.put("/payroll/statutory/EOBI", json={"enabled": True})
    lines = await lines_of(client, await calc(client), tenant.employee_id)
    assert lines["EOBI_ER"]["amount_minor"] == 185_000       # 5% of 37,000


async def test_an_employee_override_switches_a_scheme_off_with_its_reason(client, tenant):
    await _set_province(tenant, "Punjab")
    await client.put("/payroll/statutory/EOBI", json={"enabled": True})
    await client.put(f"/payroll/employees/{tenant.employee_id}/details",
                     json={"eobi_applicable": False, "statutory_note": "Over retirement age"})
    run = await calc(client)
    lines = await lines_of(client, run, tenant.employee_id)
    assert "EOBI_EE" not in lines
    slip = next(p for p in run["payslips"] if p["employee_id"] == tenant.employee_id)
    full = (await client.get(f"/payroll/runs/{run['id']}/payslips/{slip['id']}")).json()
    assert any("retirement" in n for n in full["notes"])


async def test_pay_below_the_minimum_wage_is_warned(client, tenant):
    await _set_province(tenant, "Punjab")
    emp = await new_employee(client, salary_minor=2_500_000, join_date="2026-01-01")
    run = await calc(client)
    slip = next(p for p in run["payslips"] if p["employee_id"] == emp["id"])
    assert any("minimum wage" in w for w in slip["warnings"])
