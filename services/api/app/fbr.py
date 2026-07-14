"""FBR Digital Invoicing client (Pakistan).

Contract: PRAL "Technical Documentation for DI API" v1.12.

  POST {base}/di_data/v1/di/postinvoicedata[_sb]
  Authorization: Bearer <token>          (token issued at e.fbr.gov.pk, 5y validity)

Sandbox vs production is chosen by URL *and* by which token is used — FBR routes
on the token, so a production token against the sandbox URL is a configuration
error we cannot detect from here.

Valid response carries `invoiceNumber` and validationResponse.statusCode "00".
Invalid responses omit `invoiceNumber` entirely and carry statusCode "01" plus
an errorCode — so absence of an invoice number is the reliable failure signal.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

import httpx

log = logging.getLogger("fbr")

POST_URL = {
    "sandbox": "https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata_sb",
    "production": "https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata",
}

# The till cannot hang on a government API. Failures are queued and retried.
TIMEOUT_S = 8.0

# Sandbox rejects invoices without a scenario. SN001 = goods at standard rate,
# which is what a retail counter sale is.
SANDBOX_SCENARIO = "SN001"

STANDARD_SALE_TYPE = "Goods at standard rate (default)"


@dataclass
class FbrResult:
    ok: bool
    invoice_number: str | None = None
    error_code: str = ""
    error: str = ""


def _rupees(minor: int) -> float:
    """Minor units -> the 2dp decimal FBR expects. Never float arithmetic on money."""
    return float(Decimal(minor) / Decimal(100))


def split_tax(total_minor: int, rate_pct: Decimal, inclusive: bool) -> tuple[int, int]:
    """Split a line total into (value excluding tax, tax) in minor units.

    Pakistani shelf prices are quoted tax-inclusive, but FBR wants the value
    *excluding* sales tax plus the tax as a separate figure.
    """
    if rate_pct <= 0:
        return total_minor, 0
    total = Decimal(total_minor)
    if inclusive:
        excl = total / (Decimal(1) + rate_pct / Decimal(100))
    else:
        excl = total
    excl_minor = int(excl.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    # Derive tax by subtraction so the parts always re-add to the total.
    tax_minor = total_minor - excl_minor if inclusive else int(
        (excl * rate_pct / Decimal(100)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    return excl_minor, tax_minor


def build_payload(settings, items: list[dict], *, invoice_date: date,
                  buyer_ntn_cnic: str = "", buyer_name: str = "",
                  buyer_province: str = "", buyer_address: str = "") -> dict:
    """`items` carry name, qty, hs_code, fbr_uom, tax_rate and line totals in minor units."""
    inclusive = settings["prices_include_tax"]
    lines = []
    for it in items:
        rate = Decimal(str(it["tax_rate"] or 0))
        excl_minor, tax_minor = split_tax(it["line_total_minor"], rate, inclusive)
        lines.append({
            "hsCode": it["hs_code"],
            "productDescription": it["name"],
            "rate": f"{rate.normalize():f}%",
            "uoM": it["fbr_uom"],
            "quantity": float(it["quantity"]),
            "totalValues": _rupees(it["line_total_minor"]),
            "valueSalesExcludingST": _rupees(excl_minor),
            "fixedNotifiedValueOrRetailPrice": 0.00,
            "salesTaxApplicable": _rupees(tax_minor),
            "salesTaxWithheldAtSource": 0.00,
            "extraTax": 0.00,
            "furtherTax": 0.00,
            "sroScheduleNo": "",
            "fedPayable": 0.00,
            "discount": 0.00,
            "saleType": STANDARD_SALE_TYPE,
            "sroItemSerialNo": "",
        })

    payload = {
        "invoiceType": "Sale Invoice",
        "invoiceDate": invoice_date.isoformat(),
        "sellerNTNCNIC": settings["seller_ntn_cnic"],
        "sellerBusinessName": settings["seller_business_name"],
        "sellerProvince": settings["seller_province"],
        "sellerAddress": settings["seller_address"],
        # A walk-in customer has no NTN; FBR models that as an unregistered buyer.
        "buyerNTNCNIC": buyer_ntn_cnic,
        "buyerBusinessName": buyer_name or "General Public",
        "buyerProvince": buyer_province or settings["seller_province"],
        "buyerAddress": buyer_address or settings["seller_address"],
        "buyerRegistrationType": "Registered" if buyer_ntn_cnic else "Unregistered",
        "invoiceRefNo": "",
        "items": lines,
    }
    if settings["environment"] == "sandbox":
        payload["scenarioId"] = SANDBOX_SCENARIO
    return payload


def _parse(body: dict) -> FbrResult:
    vr = body.get("validationResponse") or {}
    number = body.get("invoiceNumber")
    if vr.get("statusCode") == "00" and number:
        return FbrResult(ok=True, invoice_number=number)
    return FbrResult(
        ok=False,
        error_code=str(vr.get("errorCode") or ""),
        error=str(vr.get("error") or vr.get("status") or "FBR rejected the invoice"),
    )


async def post_invoice(settings, payload: dict) -> FbrResult:
    """Transmit one invoice. Never raises — a government outage must not take
    the till down with it; the caller queues anything that is not ok."""
    url = POST_URL.get(settings["environment"], POST_URL["sandbox"])
    headers = {"Authorization": f"Bearer {settings['token']}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
            r = await client.post(url, json=payload, headers=headers)
        if r.status_code == 401:
            return FbrResult(ok=False, error_code="401", error="FBR rejected the token — check it in Settings.")
        if r.status_code != 200:
            return FbrResult(ok=False, error_code=str(r.status_code), error=f"FBR returned HTTP {r.status_code}")
        return _parse(r.json())
    except httpx.TimeoutException:
        return FbrResult(ok=False, error_code="timeout", error="FBR did not respond in time")
    except Exception as e:  # network down, DNS, malformed body …
        log.warning("FBR submission failed: %s", e)
        return FbrResult(ok=False, error_code="network", error="Could not reach FBR")
