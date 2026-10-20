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

from . import crypto

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
    # The request may have reached FBR, but no answer came back (read timeout,
    # connection dropped after sending, gateway timeout). FBR has no
    # idempotency key, so such a filing must be reconciled, never blindly resent.
    maybe_delivered: bool = False


@dataclass
class LookupResult:
    status: str                      # found | not_found | unsupported
    invoice_number: str | None = None


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
    """`items` carry name, qty, hs_code, fbr_uom, tax_rate and line totals in minor units.

    An item may carry the amounts app/pricing.py already settled for it
    (`excl_minor`, `tax_minor`, `discount_minor`, with `line_total_minor` =
    what the customer paid). Those are sent as-is, so FBR is told exactly
    what was charged; otherwise the line total is split here.
    """
    inclusive = settings["prices_include_tax"]
    lines = []
    for it in items:
        rate = Decimal(str(it["tax_rate"] or 0))
        if "excl_minor" in it:
            excl_minor, tax_minor = it["excl_minor"], it["tax_minor"]
        else:
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
            "discount": _rupees(it.get("discount_minor", 0)),
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


def token_aad(tenant_id) -> bytes:
    return crypto.aad(tenant_id, "fbr_settings", "token")


def bearer_token(settings) -> str:
    """The FBR token from an fbr_settings row. Stored only encrypted (S14)."""
    blob = settings.get("token_enc")
    return crypto.decrypt(blob, token_aad(settings["tenant_id"])) if blob else ""


async def post_invoice(settings, payload: dict) -> FbrResult:
    """Transmit one invoice. Never raises — a government outage must not take
    the till down with it; the caller queues anything that is not ok."""
    url = POST_URL.get(settings["environment"], POST_URL["sandbox"])
    try:
        token = bearer_token(settings)
    except crypto.DecryptError:
        # Wrong/missing BOS_DATA_KEYS, or a blob copied from another tenant:
        # nothing was sent, and resending will not help until it is fixed.
        log.error("FBR token for tenant %s does not decrypt", settings.get("tenant_id"))
        return FbrResult(ok=False, error_code="token",
                         error="The saved FBR token cannot be read. Enter it again in Settings.")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
            r = await client.post(url, json=payload, headers=headers)
        if r.status_code == 401:
            return FbrResult(ok=False, error_code="401", error="FBR rejected the token — check it in Settings.")
        if r.status_code == 504:
            # The gateway gave up waiting on PRAL, which may still have filed it.
            return FbrResult(ok=False, error_code="504", error="FBR's gateway timed out",
                             maybe_delivered=True)
        if r.status_code != 200:
            return FbrResult(ok=False, error_code=str(r.status_code), error=f"FBR returned HTTP {r.status_code}")
        return _parse(r.json())
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout) as e:
        # Never left this machine: safe to send again.
        log.warning("FBR unreachable: %s", e)
        return FbrResult(ok=False, error_code="network", error="Could not reach FBR")
    except (httpx.TimeoutException, httpx.ReadError, httpx.WriteError, httpx.RemoteProtocolError) as e:
        # The request was (or may have been) sent and no answer came back.
        log.warning("FBR did not answer: %r", e)
        return FbrResult(ok=False, error_code="timeout", error="FBR did not respond in time",
                         maybe_delivered=True)
    except Exception as e:  # DNS, malformed body …
        log.warning("FBR submission failed: %s", e)
        return FbrResult(ok=False, error_code="network", error="Could not reach FBR")


async def lookup_invoice(settings, document: dict) -> LookupResult:
    """Ask FBR whether a document whose filing ended without an answer was
    received. PRAL's DI API (v1.12) documents no lookup or idempotency key
    (studies/01 §8.1), so this answers 'unsupported' and the filing waits for
    an owner to check IRIS and settle it (POST /fbr/invoices/{id}/resolve).
    The outbox calls this before any resend; plug a real lookup in here if
    PRAL ever offers one."""
    return LookupResult(status="unsupported")
