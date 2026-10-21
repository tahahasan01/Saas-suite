"""The payslip calculator, without a database (St03 §6.5–6.6, checklist §6.4,
§6.5). Every number on a payslip comes from here — the preview, the
calculate job and adjustment runs all call the same function.

Money is integer paisa, rounded half-up. Formulas work in rupees.
"""
from __future__ import annotations

from dataclasses import replace
from datetime import date
from decimal import Decimal

import pytest

from app import payroll
from app import payroll_engine as eng

RS = 100  # paisa per rupee


def emp(**kw) -> eng.EmployeeInput:
    base = dict(
        employee_id="e1", name="Ayesha",
        period_start=date(2026, 7, 1), period_end=date(2026, 7, 31), pay_date=date(2026, 7, 31),
        segments=[eng.Segment(date(2026, 7, 1), date(2026, 7, 31), 250_000 * RS)],
        components=[], attendance=eng.Attendance(working_days=27),
        tax_history=eng.TaxHistory(),
    )
    base.update(kw)
    return eng.EmployeeInput(**base)


def line(res: eng.PayslipResult, code: str) -> eng.Line:
    found = [ln for ln in res.lines if ln.code == code]
    assert found, f"no {code} line in {[ln.code for ln in res.lines]}"
    return found[0]


def codes(res: eng.PayslipResult) -> list[str]:
    return [ln.code for ln in res.lines]


# ── Base pay and income tax (§6.4) ───────────────────────────────────────────
def test_without_a_structure_the_whole_base_is_basic_pay():
    res = eng.calculate(emp())
    assert line(res, "BASIC").amount_minor == 250_000 * RS
    assert res.gross_minor == 250_000 * RS
    assert res.error is None


def test_vector_250k_a_month_from_july():
    """§6.4: PKR 250,000 a month from July, no other income → TY2027 23,000
    a month (TY2026 would be 25,000)."""
    res = eng.calculate(emp())
    assert line(res, "INCOME_TAX").amount_minor == 23_000 * RS
    assert res.tax_year == "TY2027" and res.tax_verified is False
    assert res.net_minor == (250_000 - 23_000) * RS
    ty26 = emp(period_start=date(2025, 7, 1), period_end=date(2025, 7, 31), pay_date=date(2025, 7, 31),
               segments=[eng.Segment(date(2025, 7, 1), date(2025, 7, 31), 250_000 * RS)])
    assert line(eng.calculate(ty26), "INCOME_TAX").amount_minor == 25_000 * RS


def test_months_with_no_saved_payslip_are_assumed_at_the_current_rate():
    """A business that starts using us in October: July–September were paid
    elsewhere. Treating them as paid at the same rate keeps the old ×12
    answer instead of under-deducting."""
    oct_ = emp(period_start=date(2026, 10, 1), period_end=date(2026, 10, 31), pay_date=date(2026, 10, 31),
               segments=[eng.Segment(date(2026, 10, 1), date(2026, 10, 31), 400_000 * RS)],
               tax_history=eng.TaxHistory(assumed_months=3))
    assert line(eng.calculate(oct_), "INCOME_TAX").amount_minor == payroll.monthly_tax_minor(
        400_000 * RS, date(2026, 10, 31))


def test_a_raise_in_january_changes_the_remaining_months_only():
    six_months = eng.TaxHistory(taxable_minor=6 * 250_000 * RS, tax_minor=6 * 23_000 * RS, months=6)
    jan = emp(period_start=date(2027, 1, 1), period_end=date(2027, 1, 31), pay_date=date(2027, 1, 31),
              segments=[eng.Segment(date(2027, 1, 1), date(2027, 1, 31), 300_000 * RS)],
              tax_history=six_months)
    # Projected 1.5M + 6 × 300k = 3.3M → 316,000 + 25% × 100k = 341,000;
    # (341,000 − 138,000) over the 6 months left.
    assert line(eng.calculate(jan), "INCOME_TAX").amount_minor == 3_383_333


def test_a_december_bonus_spikes_only_decembers_tax():
    hist = eng.TaxHistory(taxable_minor=5 * 250_000 * RS, tax_minor=5 * 23_000 * RS, months=5)
    dec = emp(period_start=date(2026, 12, 1), period_end=date(2026, 12, 31), pay_date=date(2026, 12, 31),
              segments=[eng.Segment(date(2026, 12, 1), date(2026, 12, 31), 250_000 * RS)],
              tax_history=hist,
              one_offs=[eng.OneOff(id="b1", code="BONUS", name="Year-end bonus", kind="earning",
                                   amount_minor=500_000 * RS, taxable=True)])
    res = eng.calculate(dec)
    # Without the bonus: 3.0M → 276,000; (276,000 − 115,000) / 7 = 23,000.
    # With it: 3.5M → 391,000; the extra 115,000 lands in December alone.
    assert line(res, "INCOME_TAX").amount_minor == (23_000 + 115_000) * RS
    assert line(res, "BONUS").amount_minor == 500_000 * RS
    assert res.gross_minor == 750_000 * RS
    # The same month without the bonus is the plain 23,000.
    assert line(eng.calculate(replace(dec, one_offs=[])), "INCOME_TAX").amount_minor == 23_000 * RS


def test_tax_explain_shows_the_projection():
    ex = line(eng.calculate(emp()), "INCOME_TAX").explain
    assert ex["tax_year"] == "TY2027"
    assert ex["months_left"] == 12
    assert ex["projected_annual_taxable_minor"] == 3_000_000 * RS
    assert ex["annual_tax_minor"] == 276_000 * RS
    assert ex["verified"] is False


def test_no_tax_below_the_threshold():
    res = eng.calculate(emp(segments=[eng.Segment(date(2026, 7, 1), date(2026, 7, 31), 40_000 * RS)]))
    assert line(res, "INCOME_TAX").amount_minor == 0


# ── Proration (§6.4 joiners and leavers) ─────────────────────────────────────
def test_a_mid_month_joiner_is_prorated_by_calendar_days():
    sept = emp(period_start=date(2026, 9, 1), period_end=date(2026, 9, 30), pay_date=date(2026, 9, 30),
               segments=[eng.Segment(date(2026, 9, 16), date(2026, 9, 30), 60_000 * RS)])
    res = eng.calculate(sept)
    assert res.employed_days == 15 and res.period_days == 30
    assert line(res, "BASIC").amount_minor == 30_000 * RS
    assert "15/30" in line(res, "BASIC").explain["prorated"]


def test_a_mid_month_raise_splits_the_month():
    res = eng.calculate(emp(segments=[eng.Segment(date(2026, 7, 1), date(2026, 7, 10), 31_000 * RS),
                                      eng.Segment(date(2026, 7, 11), date(2026, 7, 31), 62_000 * RS)]))
    # 10 days at 31,000 + 21 days at 62,000, over 31 days.
    assert line(res, "BASIC").amount_minor == 52_000 * RS


def test_someone_not_employed_in_the_period_gets_nothing():
    res = eng.calculate(emp(segments=[]))
    assert res.lines == [] and res.net_minor == 0 and res.employed_days == 0


# ── Components and formulas ──────────────────────────────────────────────────
def comp(code, *, formula="", kind="earning", calc="formula", taxable=True, prorate=True, amount=0,
         percent=None, percent_of="BASE", sort=0) -> eng.Component:
    return eng.Component(code=code, name=code.title(), kind=kind, calc=calc, amount_minor=amount,
                         percent=Decimal(percent) if percent is not None else None, percent_of=percent_of,
                         formula=formula, taxable=taxable, prorate=prorate, sort=sort)


def test_a_structure_splits_pay_by_formula_in_dependency_order():
    structure = [
        comp("MEDICAL", formula="BASE - BASIC - HRA", taxable=False, sort=3),
        comp("HRA", calc="percent", percent="45", percent_of="BASIC", sort=2),
        comp("BASIC", formula="round(BASE / 1.55)", sort=1),
    ]
    res = eng.calculate(emp(segments=[eng.Segment(date(2026, 7, 1), date(2026, 7, 31), 155_000 * RS)],
                            components=structure))
    assert line(res, "BASIC").amount_minor == 100_000 * RS
    assert line(res, "HRA").amount_minor == 45_000 * RS
    assert line(res, "MEDICAL").amount_minor == 10_000 * RS
    assert res.gross_minor == 155_000 * RS
    # Medical is not taxable: tax is on 145,000 a month.
    assert res.taxable_minor == 145_000 * RS
    assert line(res, "HRA").explain["inputs"] == {"BASIC": "100000.00"}
    # Lines keep the structure's display order, not the evaluation order.
    assert codes(res)[:3] == ["BASIC", "HRA", "MEDICAL"]


def test_fixed_components_and_formula_deductions():
    res = eng.calculate(emp(components=[
        comp("BASIC", formula="BASE"),
        comp("FUEL", calc="fixed", amount=5_000 * RS, prorate=False),
        comp("LUNCH", kind="deduction", formula="if(WORKING_DAYS > 20, 1500, 0)"),
    ]))
    assert line(res, "FUEL").amount_minor == 5_000 * RS
    assert line(res, "LUNCH").amount_minor == 1_500 * RS
    assert res.gross_minor == 255_000 * RS


def test_a_negative_earning_or_a_formula_failure_is_a_payslip_error():
    res = eng.calculate(emp(components=[comp("BASIC", formula="BASE - 999999")]))
    assert res.error and "BASIC" in res.error
    res = eng.calculate(emp(components=[comp("BASIC", formula="BASE / (WORKING_DAYS - WORKING_DAYS)")]))
    assert res.error and "zero" in res.error.lower()


def test_a_cycle_is_a_payslip_error_not_a_crash():
    res = eng.calculate(emp(components=[comp("A", formula="B"), comp("B", formula="A")]))
    assert res.error and "loop" in res.error


# ── Absence (the existing rules, unchanged) ──────────────────────────────────
def test_absence_costs_a_working_days_pay_each():
    res = eng.calculate(emp(
        segments=[eng.Segment(date(2026, 7, 1), date(2026, 7, 31), 52_000 * RS)],
        attendance=eng.Attendance(working_days=26, absent_days=2, unpaid_leave_days=1, half_days=1)))
    # 3.5 days × 52,000 / 26 = 7,000.
    ab = line(res, "ABSENCE")
    assert ab.amount_minor == 7_000 * RS and ab.kind == "deduction"
    assert res.taxable_minor == 45_000 * RS   # tax is on what is actually paid


# ── EOBI, PESSI, minimum wage (§6.5) ─────────────────────────────────────────
EOBI = eng.StatutoryRule(scheme="EOBI", name="EOBI", base_kind="fixed_base", base_minor=40_000 * RS,
                         employee_rate=Decimal("0.01"), employer_rate=Decimal("0.05"),
                         verified=False, source_ref="EOBI notification (unverified)")
PESSI = eng.StatutoryRule(scheme="PESSI", name="PESSI", base_kind="min_wage", base_minor=None,
                          employee_rate=Decimal("0"), employer_rate=Decimal("0.06"),
                          verified=False, source_ref="PESSI (unverified)")


@pytest.mark.parametrize("salary", [30_000, 250_000])
def test_eobi_vector_ignores_actual_salary(salary):
    res = eng.calculate(emp(segments=[eng.Segment(date(2026, 7, 1), date(2026, 7, 31), salary * RS)],
                            statutory=[EOBI], min_wage_minor=40_000 * RS))
    assert line(res, "EOBI_EE").amount_minor == 400 * RS
    assert line(res, "EOBI_EE").kind == "deduction"
    assert line(res, "EOBI_ER").amount_minor == 2_000 * RS
    assert line(res, "EOBI_ER").kind == "employer_contribution"
    assert res.employer_cost_minor == (salary + 2_000) * RS
    assert res.statutory_verified is False


def test_pessi_is_employer_only_on_the_minimum_wage():
    res = eng.calculate(emp(statutory=[PESSI], min_wage_minor=40_000 * RS))
    assert line(res, "PESSI_ER").amount_minor == 2_400 * RS
    assert "PESSI_EE" not in codes(res)
    assert line(res, "PESSI_ER").explain["base_kind"] == "min_wage"


def test_a_wage_ceiling_leaves_higher_earners_uncovered():
    capped = replace(PESSI, coverage_ceiling_minor=100_000 * RS)
    res = eng.calculate(emp(statutory=[capped], min_wage_minor=40_000 * RS))
    assert "PESSI_ER" not in codes(res)
    assert any("PESSI" in w for w in res.notes)


def test_an_override_turns_a_scheme_off_with_its_reason():
    off = replace(EOBI, applies=False, reason="Contractor: not covered")
    res = eng.calculate(emp(statutory=[off]))
    assert "EOBI_EE" not in codes(res)
    assert any("Contractor" in n for n in res.notes)


def test_below_minimum_wage_is_warned():
    res = eng.calculate(emp(segments=[eng.Segment(date(2026, 7, 1), date(2026, 7, 31), 30_000 * RS)],
                            min_wage_minor=40_000 * RS))
    assert any("minimum wage" in w for w in res.warnings)
    assert not any("minimum wage" in w for w in eng.calculate(emp(min_wage_minor=40_000 * RS)).warnings)


# ── One-offs and advances ────────────────────────────────────────────────────
def test_advance_recovery_never_exceeds_whats_outstanding():
    res = eng.calculate(emp(advances=[eng.Advance(id="a1", installment_minor=5_000 * RS,
                                                  outstanding_minor=3_000 * RS)]))
    adv = line(res, "ADVANCE")
    assert adv.amount_minor == 3_000 * RS and adv.kind == "deduction"
    assert adv.explain["advance_id"] == "a1" and adv.explain["outstanding_after_minor"] == 0


def test_a_one_off_deduction_is_taken_from_net():
    res = eng.calculate(emp(one_offs=[eng.OneOff(id="f1", code="FINE", name="Late fine", kind="deduction",
                                                 amount_minor=1_000 * RS, taxable=False)]))
    assert line(res, "FINE").amount_minor == 1_000 * RS
    assert res.net_minor == (250_000 - 23_000 - 1_000) * RS


def test_deductions_larger_than_pay_are_an_error():
    res = eng.calculate(emp(one_offs=[eng.OneOff(id="f1", code="FINE", name="Fine", kind="deduction",
                                                 amount_minor=900_000 * RS, taxable=False)]))
    assert res.error and "more than" in res.error


def test_totals_add_up():
    res = eng.calculate(emp(statutory=[EOBI], min_wage_minor=40_000 * RS,
                            advances=[eng.Advance(id="a", installment_minor=1_000 * RS, outstanding_minor=9_000 * RS)]))
    earnings = sum(ln.amount_minor for ln in res.lines if ln.kind == "earning")
    deductions = sum(ln.amount_minor for ln in res.lines if ln.kind == "deduction")
    assert res.gross_minor == earnings and res.deductions_minor == deductions
    assert res.net_minor == earnings - deductions


# ── Adjustment runs (D-40) ───────────────────────────────────────────────────
def test_an_adjustment_carries_only_the_difference():
    paid = eng.calculate(emp())
    fixed = eng.calculate(emp(segments=[eng.Segment(date(2026, 7, 1), date(2026, 7, 31), 260_000 * RS)]))
    diff = eng.difference(fixed, [(ln.code, ln.name, ln.kind, ln.amount_minor, ln.taxable) for ln in paid.lines])
    by = {ln.code: ln.amount_minor for ln in diff.lines}
    assert by["BASIC"] == 10_000 * RS
    assert by["INCOME_TAX"] == fixed_tax(fixed) - fixed_tax(paid)
    assert diff.net_minor == fixed.net_minor - paid.net_minor
    assert diff.lines[0].explain["previously_minor"] == 250_000 * RS


def fixed_tax(res: eng.PayslipResult) -> int:
    return line(res, "INCOME_TAX").amount_minor


def test_an_adjustment_with_no_change_is_empty():
    paid = eng.calculate(emp())
    diff = eng.difference(paid, [(ln.code, ln.name, ln.kind, ln.amount_minor, ln.taxable) for ln in paid.lines])
    assert diff.lines == [] and diff.net_minor == 0
