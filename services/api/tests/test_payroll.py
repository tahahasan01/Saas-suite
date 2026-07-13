from app.payroll import annual_tax, monthly_tax_minor


def test_zero_below_threshold():
    assert annual_tax(500_000) == 0
    assert annual_tax(600_000) == 0


def test_second_slab_5pct():
    # 5% of the amount over 600k
    assert annual_tax(1_200_000) == 30_000


def test_third_slab():
    # 30,000 + 15% over 1.2M
    assert annual_tax(1_800_000) == 120_000


def test_monthly_withholding_minor():
    # PKR 150,000/mo -> annual 1.8M -> tax 120k/yr -> 10k/mo -> 1,000,000 minor
    assert monthly_tax_minor(15_000_000) == 1_000_000
