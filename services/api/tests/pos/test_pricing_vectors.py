"""The shared pricing vectors (D-21, checklist 6.1) run against app/pricing.py.

packages/pos-core/vectors/pricing.json is the single source of expected
figures; the TypeScript till implementation runs the same file (Phase 3).
Every intermediate value is checked, not just the total, so the two
implementations cannot agree on a total while disagreeing on what FBR is told.
"""
from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

import pytest

from app import pricing

VECTORS_FILE = Path(__file__).resolve().parents[4] / "packages" / "pos-core" / "vectors" / "pricing.json"
VECTORS = json.loads(VECTORS_FILE.read_text(encoding="utf-8"))["vectors"]
BY_ID = {v["id"]: v for v in VECTORS}


def price(inp: dict) -> dict:
    """Run one sale vector's input through pricing.py, in the vector file's shape."""
    sale = pricing.price_sale(
        [(l["unit_price_minor"], Decimal(str(l["qty"])), Decimal(str(l["tax_rate_pct"])))
         for l in inp["lines"]],
        inp["order_discount_minor"],
        tax_on=inp["tax_on"], inclusive=inp["tax_inclusive"],
        line_discounts=[l.get("line_discount_minor", 0) for l in inp["lines"]])
    if inp["tender"] == "cash":
        due, rounding = pricing.cash_due(sale.total_minor, inp["cash_rounding_minor"])
    else:
        due, rounding = sale.total_minor, 0
    return {
        "lines": [{"gross_minor": l.gross_minor, "line_discount_minor": l.line_discount_minor,
                   "line_net_minor": l.line_net_minor, "discount_share_minor": l.share_minor,
                   "net_minor": l.net_minor, "excl_minor": l.excl_minor, "tax_minor": l.tax_minor,
                   "incl_minor": l.total_minor} for l in sale.lines],
        "subtotal_minor": sale.subtotal_minor, "line_discount_minor": sale.line_discount_minor,
        "order_discount_minor": sale.discount_minor, "tax_minor": sale.tax_minor,
        "total_minor": sale.total_minor, "rounding_minor": rounding, "amount_due_minor": due,
    }


def refunds(inp: dict) -> list[int]:
    if "from_vector" in inp:
        incl = price(BY_ID[inp["from_vector"]]["input"])["lines"][inp["line_index"]]["incl_minor"]
    else:
        incl = inp["line_incl_minor"]
    out, refunded, returned = [], 0, 0
    for qty in inp["returns"]:
        r = pricing.refund_for(incl, inp["qty_sold"], refunded, returned, qty)
        out.append(r)
        refunded += r
        returned += qty
    return out


def test_the_minimum_vector_set_is_present():
    assert {f"PV-{n:02d}" for n in range(1, 12)} <= set(BY_ID)


@pytest.mark.parametrize("vector", VECTORS, ids=[v["id"] for v in VECTORS])
def test_vector(vector):
    if vector["kind"] == "sale":
        assert price(vector["input"]) == vector["expected"]
    else:
        assert refunds(vector["input"]) == vector["expected"]["refunds"]
