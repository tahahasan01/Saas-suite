"""One pricing function for the till (decision D-21, audit P0-5).

Checkout, the receipt, the FBR invoice and every refund read their amounts
from here, so they cannot disagree. Order of operations per line:

    gross = unit price x qty
    discount = the sale-level discount, spread over lines by value
    net = gross - discount
    tax = split from net (inclusive prices) or added on top (exclusive prices)
    total = what the customer pays for the line

All amounts are integer minor units (paisa).
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from .fbr import split_tax


@dataclass(frozen=True)
class PricedLine:
    gross_minor: int
    discount_minor: int
    net_minor: int
    excl_minor: int    # value excluding sales tax
    tax_minor: int
    total_minor: int   # what the customer pays for this line


@dataclass(frozen=True)
class PricedSale:
    lines: list[PricedLine]
    subtotal_minor: int   # sum of gross
    discount_minor: int   # discount actually applied (capped at the subtotal)
    tax_minor: int
    total_minor: int


def allocate(amount: int, weights: list[int]) -> list[int]:
    """Split `amount` across `weights` proportionally, in whole paisa, so the
    parts always add back to `amount` (largest-remainder method)."""
    total = sum(weights)
    if amount <= 0 or total <= 0:
        return [0] * len(weights)
    exact = [Decimal(amount) * w / total for w in weights]
    parts = [int(x) for x in exact]
    by_remainder = sorted(range(len(weights)), key=lambda i: exact[i] - parts[i], reverse=True)
    for i in by_remainder[: amount - sum(parts)]:
        parts[i] += 1
    return parts


def price_sale(lines: list[tuple[int, float, Decimal]], discount_minor: int, *,
               tax_on: bool, inclusive: bool) -> PricedSale:
    """`lines` are (unit_price_minor, qty, tax_rate_pct)."""
    gross = [round(price * qty) for price, qty, _ in lines]
    subtotal = sum(gross)
    discount = min(max(discount_minor, 0), subtotal)
    shares = allocate(discount, gross)

    priced = []
    for (_, _, rate), g, d in zip(lines, gross, shares):
        net = g - d
        if tax_on and rate > 0:
            excl, tax = split_tax(net, rate, inclusive)
            total = net if inclusive else net + tax
        else:
            excl, tax, total = net, 0, net
        priced.append(PricedLine(g, d, net, excl, tax, total))

    return PricedSale(priced, subtotal, discount,
                      sum(p.tax_minor for p in priced), sum(p.total_minor for p in priced))


def refund_for(line_total_minor: int, qty_sold: float, refunded_minor: int,
               qty_returned: float, qty: float) -> int:
    """What returning `qty` of a line gives back: its share of what was paid.
    The return that takes the last units gets exactly what is left, so a line
    returned in parts refunds precisely what was paid — no paisa invented or lost."""
    if qty_returned + qty >= qty_sold:
        return line_total_minor - refunded_minor
    return round(line_total_minor * Decimal(str(qty)) / Decimal(str(qty_sold)))


def cash_due(total_minor: int, rounding_minor: int) -> tuple[int, int]:
    """What a cash customer pays: the total rounded half-up to the tenant's
    cash unit (100 = Rs 1), and the rounding (due - total). A unit of 0 means
    no rounding. The invoice total itself is never changed."""
    if rounding_minor <= 0:
        return total_minor, 0
    due = (total_minor + rounding_minor // 2) // rounding_minor * rounding_minor
    return due, due - total_minor
