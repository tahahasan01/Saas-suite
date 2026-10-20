"""One pricing function for the till (decision D-21, audit P0-5).

Checkout, the receipt, the FBR invoice and every refund read their amounts
from here, so they cannot disagree. The spec is
packages/pos-core/vectors/README.md and the expected figures are
packages/pos-core/vectors/pricing.json (tests/pos/test_pricing_vectors.py);
the Phase 3 TypeScript till implements the same spec against the same file.

Order of operations per line, all integer minor units (paisa), every rounding
half-up (0.5 goes away from zero):

    gross         = round(unit price x qty)
    line discount = capped at gross
    line net      = gross - line discount
    share         = the order discount spread over lines pro rata to line net
                    (largest remainder; ties go to the lowest line index)
    net           = line net - share
    excl, tax     = inclusive: excl = round(net / (1 + rate)), tax = net - excl
                    exclusive: excl = net, tax = round(excl x rate)
    incl (total)  = excl + tax — what the customer pays for the line

Sale total = sum of line incl. Cash rounding (cash only) happens after, in
cash_due, and never changes the invoice total. Refunds use cumulative
rounding (refund_for).
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from .fbr import split_tax


def round_half_up(x: Decimal) -> int:
    return int(x.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def _dec(x: Decimal | int | float | str) -> Decimal:
    # str() first: Decimal(0.1) would carry the float's binary error into money.
    return x if isinstance(x, Decimal) else Decimal(str(x))


@dataclass(frozen=True)
class PricedLine:
    gross_minor: int
    line_discount_minor: int   # this line's own discount (capped at gross)
    share_minor: int           # this line's part of the order discount
    net_minor: int             # gross - both discounts
    excl_minor: int            # value excluding sales tax
    tax_minor: int
    total_minor: int           # incl: what the customer pays for this line

    @property
    def line_net_minor(self) -> int:
        return self.gross_minor - self.line_discount_minor

    @property
    def discount_minor(self) -> int:
        """All discount on the line — what FBR's per-line `discount` reports."""
        return self.line_discount_minor + self.share_minor


@dataclass(frozen=True)
class PricedSale:
    lines: list[PricedLine]
    subtotal_minor: int        # sum of gross
    discount_minor: int        # order discount actually applied (capped at what was left)
    tax_minor: int
    total_minor: int
    line_discount_minor: int = 0   # sum of line discounts


def allocate(amount: int, weights: list[int]) -> list[int]:
    """Split `amount` across `weights` proportionally, in whole paisa, so the
    parts always add back to `amount` (largest-remainder method).

    Integer arithmetic throughout: each part is floor(amount x w / total), and
    the paisa left over go one each to the largest remainders. Equal
    remainders go to the lowest index — exactly, which a decimal division
    cannot promise (its precision depends on the size of the quotient)."""
    total = sum(weights)
    if amount <= 0 or total <= 0:
        return [0] * len(weights)
    parts = [amount * w // total for w in weights]
    remainders = [amount * w % total for w in weights]
    by_remainder = sorted(range(len(weights)), key=lambda i: (-remainders[i], i))
    for i in by_remainder[: amount - sum(parts)]:
        parts[i] += 1
    return parts


def price_sale(lines: list[tuple[int, float | Decimal, Decimal]], discount_minor: int, *,
               tax_on: bool, inclusive: bool,
               line_discounts: list[int] | None = None) -> PricedSale:
    """`lines` are (unit_price_minor, qty, tax_rate_pct); `line_discounts` are
    per-line amounts in minor units (default none)."""
    gross = [round_half_up(Decimal(price) * _dec(qty)) for price, qty, _ in lines]
    line_disc = [min(max(d, 0), g) for d, g in zip(line_discounts or [0] * len(lines), gross)]
    line_net = [g - d for g, d in zip(gross, line_disc)]
    discount = min(max(discount_minor, 0), sum(line_net))
    shares = allocate(discount, line_net)

    priced = []
    for (_, _, rate), g, ld, ln, s in zip(lines, gross, line_disc, line_net, shares):
        net = ln - s
        rate = _dec(rate)
        if tax_on and rate > 0:
            excl, tax = split_tax(net, rate, inclusive)
        else:
            excl, tax = net, 0
        priced.append(PricedLine(gross_minor=g, line_discount_minor=ld, share_minor=s, net_minor=net,
                                 excl_minor=excl, tax_minor=tax, total_minor=excl + tax))

    return PricedSale(priced, sum(gross), discount,
                      sum(p.tax_minor for p in priced), sum(p.total_minor for p in priced),
                      line_discount_minor=sum(line_disc))


def refund_for(line_total_minor: int, qty_sold: float, refunded_minor: int,
               qty_returned: float, qty: float) -> int:
    """What returning `qty` of a line gives back: its share of what was paid.

    Cumulative rounding: after k of n units have come back, the line has
    refunded round(paid x k / n) in total, however the k were split across
    visits — so the parts never run ahead of the line, and the return that
    takes the last unit lands exactly on what was paid. Clamped to what is
    left, for lines refunded before this rule."""
    left = line_total_minor - refunded_minor
    sold, after = _dec(qty_sold), _dec(qty_returned) + _dec(qty)
    if after >= sold:
        return max(left, 0)
    target = round_half_up(Decimal(line_total_minor) * after / sold)
    return min(max(target - refunded_minor, 0), max(left, 0))


def cash_due(total_minor: int, rounding_minor: int) -> tuple[int, int]:
    """What a cash customer pays: the total rounded half-up to the tenant's
    cash unit (100 = Rs 1), and the rounding (due - total). A unit of 0 means
    no rounding. The invoice total itself is never changed."""
    if rounding_minor <= 0:
        return total_minor, 0
    due = (total_minor + rounding_minor // 2) // rounding_minor * rounding_minor
    return due, due - total_minor
