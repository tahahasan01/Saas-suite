"""FBR payload construction and tax arithmetic.

Money is the part that gets a retailer fined, so the split has to be exact and
the parts must always re-add to the total the customer actually paid.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.fbr import FbrResult, _parse, build_payload, split_tax

SETTINGS = {
    "environment": "sandbox",
    "token": "t",
    "seller_ntn_cnic": "1234567",
    "seller_business_name": "Khan Traders",
    "seller_province": "Sindh",
    "seller_address": "Karachi",
    "prices_include_tax": True,
}


def _item(total_minor: int, rate: float = 18.0, qty: float = 1.0) -> dict:
    return {"name": "Item", "quantity": qty, "hs_code": "0101.2100",
            "fbr_uom": "Numbers, pieces, units", "tax_rate": rate,
            "line_total_minor": total_minor}


# ── tax split ───────────────────────────────────────────────────────────────
def test_inclusive_split_reconstructs_the_total():
    # Rs 1180.00 inclusive of 18% -> Rs 1000.00 + Rs 180.00
    excl, tax = split_tax(118_000, Decimal("18"), inclusive=True)
    assert excl == 100_000
    assert tax == 18_000
    assert excl + tax == 118_000


def test_exclusive_split_adds_tax_on_top():
    excl, tax = split_tax(100_000, Decimal("18"), inclusive=False)
    assert excl == 100_000
    assert tax == 18_000


def test_zero_rate_means_no_tax():
    assert split_tax(50_000, Decimal("0"), inclusive=True) == (50_000, 0)


def test_parts_always_re_add_for_awkward_amounts():
    """Rounding must never lose or invent a paisa — the customer paid the total."""
    for minor in (1, 33, 99, 12_345, 99_999, 7_777_777):
        excl, tax = split_tax(minor, Decimal("18"), inclusive=True)
        assert excl + tax == minor, f"lost a paisa at {minor}"


def test_odd_rates_still_reconcile():
    for rate in ("1", "5", "16", "17.5", "18", "25"):
        excl, tax = split_tax(99_999, Decimal(rate), inclusive=True)
        assert excl + tax == 99_999


# ── payload ─────────────────────────────────────────────────────────────────
def test_payload_matches_the_pral_contract():
    p = build_payload(SETTINGS, [_item(118_000)], invoice_date=date(2026, 4, 21))
    assert p["invoiceType"] == "Sale Invoice"
    assert p["invoiceDate"] == "2026-04-21"
    assert p["sellerNTNCNIC"] == "1234567"
    line = p["items"][0]
    assert line["rate"] == "18%"
    assert line["totalValues"] == 1180.00
    assert line["valueSalesExcludingST"] == 1000.00
    assert line["salesTaxApplicable"] == 180.00


def test_walk_in_customer_is_unregistered():
    p = build_payload(SETTINGS, [_item(118_000)], invoice_date=date(2026, 4, 21))
    assert p["buyerRegistrationType"] == "Unregistered"
    assert p["buyerBusinessName"] == "General Public"


def test_buyer_with_an_ntn_is_registered():
    p = build_payload(SETTINGS, [_item(118_000)], invoice_date=date(2026, 4, 21),
                      buyer_ntn_cnic="7654321", buyer_name="Acme Ltd")
    assert p["buyerRegistrationType"] == "Registered"
    assert p["buyerNTNCNIC"] == "7654321"


def test_scenario_id_is_sandbox_only():
    """Sandbox rejects invoices without it; production rejects invoices with it."""
    sandbox = build_payload(SETTINGS, [_item(118_000)], invoice_date=date(2026, 4, 21))
    assert sandbox["scenarioId"] == "SN001"

    prod = build_payload({**SETTINGS, "environment": "production"}, [_item(118_000)],
                         invoice_date=date(2026, 4, 21))
    assert "scenarioId" not in prod


# ── response parsing ────────────────────────────────────────────────────────
def test_valid_response_yields_the_invoice_number():
    r = _parse({
        "invoiceNumber": "7000007DI1747119701593",
        "dated": "2025-05-13 12:01:41",
        "validationResponse": {"statusCode": "00", "status": "Valid", "error": "",
                               "invoiceStatuses": [{"itemSNo": "1", "statusCode": "00"}]},
    })
    assert r == FbrResult(ok=True, invoice_number="7000007DI1747119701593")


def test_invalid_response_carries_the_error_code():
    r = _parse({
        "dated": "2025-05-13 13:09:05",
        "validationResponse": {"statusCode": "01", "status": "Invalid", "errorCode": "0052",
                               "error": "Provide proper HS Code with invoice no. null",
                               "invoiceStatuses": None},
    })
    assert r.ok is False
    assert r.error_code == "0052"
    assert "HS Code" in r.error


def test_statuscode_00_without_a_number_is_not_a_success():
    """Absence of invoiceNumber is the reliable failure signal — never claim an
    invoice was filed when FBR did not issue one."""
    assert _parse({"validationResponse": {"statusCode": "00", "status": "Valid"}}).ok is False


def test_garbage_response_is_a_failure_not_a_crash():
    assert _parse({}).ok is False
