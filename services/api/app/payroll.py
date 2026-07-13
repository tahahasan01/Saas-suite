"""Payroll math — FBR salaried income-tax slabs (annual) applied monthly.

Slabs are the 2025-26 salaried brackets (approximate). Keep them here as a
single source of truth so they're easy to update per finance-bill year.
"""
from __future__ import annotations

# (upper_bound_annual, base_tax, rate_on_excess, lower_bound)
_SLABS = [
    (600_000, 0, 0.00, 0),
    (1_200_000, 0, 0.05, 600_000),
    (2_200_000, 30_000, 0.15, 1_200_000),
    (3_200_000, 180_000, 0.25, 2_200_000),
    (4_100_000, 430_000, 0.30, 3_200_000),
    (float("inf"), 700_000, 0.35, 4_100_000),
]


def annual_tax(annual_income: float) -> float:
    """Annual salaried income tax in rupees for a given annual income (rupees)."""
    for upper, base, rate, lower in _SLABS:
        if annual_income <= upper:
            return base + (annual_income - lower) * rate
    return 0.0


def monthly_tax_minor(monthly_salary_minor: int) -> int:
    """Monthly tax withholding in minor units from a monthly salary (minor units)."""
    annual = (monthly_salary_minor / 100) * 12
    return round(annual_tax(annual) / 12 * 100)
