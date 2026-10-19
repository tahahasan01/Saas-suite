"""Salaried income tax, effective-dated by tax year (decision D-10, audit P1-1).

A tax year runs 1 July – 30 June and is chosen from the pay date, never from
"today". Figures are annual rupees unless noted.

TY2026 = Finance Act 2025. TY2027 = Finance Act 2026, as reported by several
secondary sources — both are marked unverified until checked against the
Gazette text (docs/10-decisions.md open item 2).
"""
from datetime import date

import pytest

from app.payroll import annual_tax, monthly_tax_minor, tax_year_for

TY2026_DAY = date(2026, 6, 30)   # last day of TY2026
TY2027_DAY = date(2026, 7, 1)    # first day of TY2027


def test_tax_year_is_chosen_by_pay_date():
    assert tax_year_for(TY2026_DAY).label == "TY2026"
    assert tax_year_for(TY2027_DAY).label == "TY2027"
    assert tax_year_for(date(2025, 7, 1)).label == "TY2026"


@pytest.mark.parametrize("income, tax", [
    (500_000, 0),
    (600_000, 0),
    (1_200_000, 6_000),        # 1% over 600k
    (2_200_000, 116_000),      # 6,000 + 11% over 1.2M
    (3_200_000, 346_000),      # 116,000 + 23% over 2.2M
    (4_100_000, 616_000),      # 346,000 + 30% over 3.2M
    (5_000_000, 931_000),      # 616,000 + 35% over 4.1M
    # Above PKR 10M a 9% surcharge applies on the tax.
    (12_000_000, 3_685_290),   # (616,000 + 35% × 7.9M) × 1.09
])
def test_ty2026_slabs(income, tax):
    assert annual_tax(income, tax_year_for(TY2026_DAY)) == tax


@pytest.mark.parametrize("income, tax", [
    (600_000, 0),
    (1_200_000, 6_000),
    (2_200_000, 116_000),
    (3_200_000, 316_000),      # 116,000 + 20% over 2.2M
    (4_100_000, 541_000),      # 316,000 + 25% over 3.2M
    (5_600_000, 976_000),      # 541,000 + 29% over 4.1M
    (7_000_000, 1_424_000),    # 976,000 + 32% over 5.6M
    (12_000_000, 3_174_000),   # 1,424,000 + 35% over 7M — no surcharge any more
])
def test_ty2027_slabs(income, tax):
    assert annual_tax(income, tax_year_for(TY2027_DAY)) == tax


def test_monthly_withholding_uses_the_pay_dates_tax_year():
    # PKR 400,000 a month = 4.8M a year.
    # TY2026: 616,000 + 35% × 700k = 861,000 → 71,750 a month.
    # TY2027: 541,000 + 29% × 700k = 744,000 → 62,000 a month.
    assert monthly_tax_minor(40_000_000, TY2026_DAY) == 7_175_000
    assert monthly_tax_minor(40_000_000, TY2027_DAY) == 6_200_000


def test_unverified_tables_say_so():
    assert tax_year_for(TY2027_DAY).verified is False


async def test_payroll_run_taxes_each_month_under_its_own_tax_year(client, tenant):
    """June 2026 is TY2026 and July 2026 is TY2027, whatever today is."""
    r = await client.patch(f"/hrms/employees/{tenant.employee_id}", json={"salary_minor": 40_000_000})
    r.raise_for_status()

    def tax_for(run):
        return next(p for p in run["payslips"] if p["employee_id"] == tenant.employee_id)["tax_minor"]

    june = (await client.get("/hrms/payroll?month=2026-06")).json()
    july = (await client.get("/hrms/payroll?month=2026-07")).json()
    assert tax_for(june) == 7_175_000
    assert tax_for(july) == 6_200_000
    assert (june["tax_year"], july["tax_year"]) == ("TY2026", "TY2027")
    assert july["tax_rates_verified"] is False  # the UI shows a warning until checked
