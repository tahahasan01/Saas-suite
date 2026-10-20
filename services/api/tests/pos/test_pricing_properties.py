"""Property tests for the money maths (checklist 1D, 6.1): the vector
invariants must hold on random carts of up to 50 lines, not just the
hand-picked ones. Pure functions, no database.
"""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from hypothesis import given, settings
from hypothesis import strategies as st

from app import pricing

RATES = st.sampled_from([Decimal(r) for r in ("0", "5", "10", "12.5", "16", "17", "18", "25")])
QTYS = st.one_of(st.integers(1, 20).map(Decimal),
                 st.decimals(min_value=Decimal("0.001"), max_value=Decimal("50"), places=3))
LINE = st.tuples(st.integers(0, 5_000_000), QTYS, RATES, st.integers(0, 6_000_000))
CARTS = st.lists(LINE, min_size=1, max_size=50)


def _price(cart, order_discount, *, tax_on=True, inclusive=False):
    return pricing.price_sale([(p, q, r) for p, q, r, _ in cart], order_discount,
                              tax_on=tax_on, inclusive=inclusive,
                              line_discounts=[d for *_, d in cart])


# ── Allocation ──────────────────────────────────────────────────────────────
@given(st.integers(0, 10**9), st.lists(st.integers(0, 10**8), min_size=1, max_size=50))
def test_allocation_sums_exactly_and_stays_within_a_paisa_of_pro_rata(amount, weights):
    parts = pricing.allocate(amount, weights)
    total = sum(weights)
    assert len(parts) == len(weights)
    if total == 0 or amount == 0:
        assert parts == [0] * len(weights)
        return
    assert sum(parts) == amount
    for part, w in zip(parts, weights):
        # Each part is the exact share rounded down, or that plus one paisa.
        assert amount * w // total <= part <= amount * w // total + 1


@given(st.integers(1, 10**6), st.integers(1, 10**6), st.integers(2, 50))
def test_equal_lines_differ_by_at_most_a_paisa_and_the_first_lines_get_it(amount, weight, n):
    parts = pricing.allocate(amount, [weight] * n)
    assert parts == sorted(parts, reverse=True)
    assert max(parts) - min(parts) <= 1


@given(st.integers(0, 10**9), st.lists(st.integers(0, 10**8), min_size=1, max_size=50))
def test_allocation_is_deterministic(amount, weights):
    assert pricing.allocate(amount, weights) == pricing.allocate(amount, list(weights))


# ── Sale pricing ────────────────────────────────────────────────────────────
@settings(max_examples=300)
@given(CARTS, st.integers(0, 50_000_000), st.booleans(), st.booleans())
def test_a_priced_sale_adds_up_and_nothing_is_negative(cart, order_discount, tax_on, inclusive):
    sale = _price(cart, order_discount, tax_on=tax_on, inclusive=inclusive)
    lines = sale.lines

    # Discount shares sum exactly to the (capped) order discount.
    assert sum(l.share_minor for l in lines) == sale.discount_minor
    assert sale.discount_minor == min(order_discount, sum(l.line_net_minor for l in lines))
    # Totals are the sums of the lines.
    assert sale.total_minor == sum(l.total_minor for l in lines)
    assert sale.tax_minor == sum(l.tax_minor for l in lines)
    assert sale.subtotal_minor == sum(l.gross_minor for l in lines)

    for l, (_, _, rate, _) in zip(lines, cart):
        for v in (l.gross_minor, l.line_discount_minor, l.share_minor, l.net_minor,
                  l.excl_minor, l.tax_minor, l.total_minor):
            assert v >= 0
        assert l.line_discount_minor <= l.gross_minor
        assert l.net_minor == l.gross_minor - l.line_discount_minor - l.share_minor
        assert l.excl_minor + l.tax_minor == l.total_minor
        assert l.discount_minor == l.line_discount_minor + l.share_minor
        if not tax_on or rate == 0:
            assert l.tax_minor == 0 and l.total_minor == l.net_minor
        elif inclusive:
            assert l.total_minor == l.net_minor       # the customer pays the shelf price
        else:
            assert l.excl_minor == l.net_minor        # tax goes on top


@given(CARTS, st.integers(0, 50_000_000))
def test_pricing_is_idempotent(cart, order_discount):
    assert _price(cart, order_discount) == _price(cart, order_discount)


@given(st.integers(0, 10**9), RATES)
def test_inclusive_and_exclusive_round_trip_within_one_paisa(net, rate):
    """Split a tax-inclusive amount, then price the excl part tax-exclusive:
    the customer total comes back within 1 minor unit."""
    incl = pricing.price_sale([(net, Decimal(1), rate)], 0, tax_on=True, inclusive=True).lines[0]
    excl = pricing.price_sale([(incl.excl_minor, Decimal(1), rate)], 0, tax_on=True, inclusive=False).lines[0]
    assert abs(excl.total_minor - incl.total_minor) <= 1


@given(st.integers(0, 10**9), RATES)
def test_exclusive_tax_is_half_up(excl, rate):
    line = pricing.price_sale([(excl, Decimal(1), rate)], 0, tax_on=True, inclusive=False).lines[0]
    exact = Decimal(excl) * rate / 100
    assert line.tax_minor == int(exact.quantize(Decimal(1), rounding=ROUND_HALF_UP))


# ── Refunds ─────────────────────────────────────────────────────────────────
@st.composite
def _return_plan(draw):
    """A line (amount paid, units sold) and the returns made against it, in order."""
    paid = draw(st.integers(0, 10**8))
    sold = draw(st.integers(1, 40))
    returns, left = [], sold
    while left and draw(st.booleans()):
        q = draw(st.integers(1, left))
        returns.append(q)
        left -= q
    if draw(st.booleans()) and left:
        returns.append(left)        # sometimes the customer brings back the rest
    return paid, sold, returns


@settings(max_examples=300)
@given(_return_plan())
def test_refunds_never_exceed_what_was_paid(plan):
    paid, sold, returns = plan
    refunded = returned = 0
    for q in returns:
        r = pricing.refund_for(paid, sold, refunded, returned, q)
        assert r >= 0
        # Never more than a paisa away from the pro-rata share of this return.
        assert abs(Decimal(r) - Decimal(paid) * q / sold) < 1
        refunded += r
        returned += q
        assert refunded <= paid
    if returned == sold:
        assert refunded == paid     # returning everything refunds exactly what was paid


@given(_return_plan())
def test_refund_does_not_depend_on_how_earlier_returns_were_split(plan):
    """Cumulative rounding: after any returns totalling k units, the amount
    refunded so far is the same as one return of k units."""
    paid, sold, returns = plan
    refunded = returned = 0
    for q in returns:
        refunded += pricing.refund_for(paid, sold, refunded, returned, q)
        returned += q
        assert refunded == pricing.refund_for(paid, sold, 0, 0, returned)


# ── Cash rounding ───────────────────────────────────────────────────────────
@given(st.integers(0, 10**9), st.sampled_from([0, 1, 50, 100, 500, 1000]))
def test_cash_rounding_stays_within_half_a_unit_and_is_idempotent(total, unit):
    due, rounding = pricing.cash_due(total, unit)
    assert due == total + rounding
    if unit == 0:
        assert rounding == 0
        return
    assert due % unit == 0
    assert -unit / 2 < rounding <= unit / 2
    assert pricing.cash_due(due, unit) == (due, 0)
