"""A salary structure must pay the salary (bug found 2026-10-23 on the e2e tenant).

The structure is the whole list of earnings. One with no earning that uses
BASE (directly or through other components) never pays the monthly salary:
Rs 85,000 with only "House rent, fixed 5,000" paid Rs 5,000 and then
"deductions are more than pay", with no warning. Now such a payslip fails
with a clear error, and the structure says it doesn't pay the salary so the
set-up screen can warn while it's being built.
"""
from __future__ import annotations

from datetime import date

from app import payroll_engine as eng

from .test_payroll_engine import RS, comp, emp, line


def test_a_structure_without_base_fails_the_payslip_instead_of_underpaying():
    res = eng.calculate(emp(components=[comp("HRENT", calc="fixed", amount=5_000 * RS)]))
    assert res.error and "BASE" in res.error and "salary" in res.error
    assert not res.lines


def test_base_reached_through_another_component_is_fine():
    res = eng.calculate(emp(components=[comp("BASIC", formula="BASE * 0.6"), comp("HRA", formula="BASIC * 0.5"),
                                        comp("HRENT", calc="fixed", amount=5_000 * RS)]))
    assert res.error is None
    assert line(res, "BASIC").amount_minor == 150_000 * RS


def test_a_deduction_using_base_doesnt_count_as_paying_it():
    res = eng.calculate(emp(components=[comp("HRENT", calc="fixed", amount=5_000 * RS),
                                        comp("FINE", kind="deduction", formula="BASE * 0.01")]))
    assert res.error and "BASE" in res.error


def test_without_a_salary_a_fixed_only_structure_is_allowed():
    res = eng.calculate(emp(segments=[eng.Segment(date(2026, 7, 1), date(2026, 7, 31), 0)],
                            components=[comp("STIPEND", calc="fixed", amount=20_000 * RS)]))
    assert res.error is None and line(res, "STIPEND").amount_minor == 20_000 * RS


async def test_a_structure_says_whether_it_pays_the_salary(client, tenant):
    fixed = (await client.post("/payroll/components", json={"code": "HRTN", "name": "House rent", "calc": "fixed",
                                                            "amount_minor": 500_000})).json()
    basic = (await client.post("/payroll/components", json={"code": "BASICX", "name": "Basic pay", "calc": "formula",
                                                            "formula": "BASE"})).json()
    only_rent = (await client.post("/payroll/structures", json={"name": "Rent only",
                                                                "component_ids": [fixed["id"]]})).json()
    assert only_rent["pays_salary"] is False
    both = (await client.post("/payroll/structures", json={"name": "Full",
                                                           "component_ids": [basic["id"], fixed["id"]]})).json()
    assert both["pays_salary"] is True
