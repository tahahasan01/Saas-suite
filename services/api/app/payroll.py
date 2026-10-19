"""Payroll math — FBR salaried income tax, effective-dated by tax year (D-10).

A Pakistani tax year runs 1 July – 30 June and is named by the year it ends
in (TY2027 = 1 Jul 2026 – 30 Jun 2027). Each payslip is taxed under the table
for its *pay date*, never "today", so re-running an old month keeps its rules.

Every table records where its numbers came from and whether they have been
checked against the Gazette text. Until `verified` is true the payroll
response says so and the UI shows a warning (docs/10-decisions.md, item 2).

Withholding is the annual tax on the month's salary × 12, spread evenly.
The year-to-date projection (D-41) needs saved payroll runs and comes with
them in Phase 3.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal


@dataclass(frozen=True)
class Slab:
    above: int      # annual income (PKR) this band starts above
    base: int       # tax on the whole of `above`
    rate: Decimal   # marginal rate on the excess


@dataclass(frozen=True)
class TaxYear:
    label: str
    starts: date
    ends: date
    slabs: tuple[Slab, ...]        # ascending by `above`
    surcharge_above: int | None    # income above which a surcharge applies
    surcharge_rate: Decimal
    verified: bool
    source: str

    def contains(self, d: date) -> bool:
        return self.starts <= d <= self.ends


def _slabs(*rows: tuple[int, int, str]) -> tuple[Slab, ...]:
    return tuple(Slab(above, base, Decimal(rate)) for above, base, rate in rows)


TAX_YEARS: tuple[TaxYear, ...] = (
    TaxYear(
        label="TY2026", starts=date(2025, 7, 1), ends=date(2026, 6, 30),
        slabs=_slabs((0, 0, "0"), (600_000, 0, "0.01"), (1_200_000, 6_000, "0.11"),
                     (2_200_000, 116_000, "0.23"), (3_200_000, 346_000, "0.30"),
                     (4_100_000, 616_000, "0.35")),
        surcharge_above=10_000_000, surcharge_rate=Decimal("0.09"),
        verified=False,
        source="Finance Act 2025 (salaried individuals), per secondary summaries; Gazette check pending"),
    TaxYear(
        label="TY2027", starts=date(2026, 7, 1), ends=date(2027, 6, 30),
        slabs=_slabs((0, 0, "0"), (600_000, 0, "0.01"), (1_200_000, 6_000, "0.11"),
                     (2_200_000, 116_000, "0.20"), (3_200_000, 316_000, "0.25"),
                     (4_100_000, 541_000, "0.29"), (5_600_000, 976_000, "0.32"),
                     (7_000_000, 1_424_000, "0.35")),
        surcharge_above=None, surcharge_rate=Decimal("0"),
        verified=False,
        source="Finance Act 2026 (salaried individuals), per secondary summaries; Gazette check pending"),
)


def tax_year_for(pay_date: date) -> TaxYear:
    """The table in force on `pay_date`. Past the newest table, the newest one
    applies (and stays flagged until a new year's table is added)."""
    for ty in TAX_YEARS:
        if ty.contains(pay_date):
            return ty
    return TAX_YEARS[-1] if pay_date > TAX_YEARS[-1].ends else TAX_YEARS[0]


def annual_tax(annual_income: float | int | Decimal, ty: TaxYear) -> int:
    """Annual salaried income tax in whole rupees."""
    income = Decimal(str(annual_income))
    band = next((s for s in reversed(ty.slabs) if income > s.above), ty.slabs[0])
    tax = Decimal(band.base) + (income - band.above) * band.rate if income > band.above else Decimal(0)
    if ty.surcharge_above is not None and income > ty.surcharge_above:
        tax *= 1 + ty.surcharge_rate
    return int(tax.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def monthly_tax_minor(monthly_salary_minor: int, pay_date: date) -> int:
    """Monthly withholding in minor units for a monthly salary in minor units."""
    annual_income = Decimal(monthly_salary_minor) * 12 / 100
    yearly = annual_tax(annual_income, tax_year_for(pay_date))
    return int((Decimal(yearly) * 100 / 12).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
