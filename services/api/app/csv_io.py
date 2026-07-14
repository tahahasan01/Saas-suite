"""CSV import/export helpers.

Import is the single biggest switching blocker: a business's data lives in the
tool they're leaving (or in the Excel sheet that *is* their current system), and
if it can't come with them, they don't come. So parsing is forgiving about the
things real exports actually contain — Excel's BOM, "Rs 1,500" money, header
names that differ per source ("Mobile Number" vs "phone").
"""
from __future__ import annotations

import csv
import io
import re

from fastapi import HTTPException, status

MAX_ROWS = 2000

# Recognised spellings per canonical field. Matched case-insensitively with
# punctuation/whitespace stripped, so "E-mail Address" hits "emailaddress".
LEAD_HEADERS = {
    "name": ["name", "fullname", "leadname", "contact", "contactname", "customer", "customername"],
    "company": ["company", "companyname", "business", "organisation", "organization", "account", "accountname"],
    "phone": ["phone", "mobile", "phonenumber", "mobilenumber", "contactnumber", "cell", "whatsapp"],
    "email": ["email", "emailaddress"],
    "source": ["source", "leadsource", "channel"],
    "value": ["value", "dealvalue", "amount", "valuepkr", "dealsize", "opportunityvalue"],
}

PRODUCT_HEADERS = {
    "name": ["name", "product", "productname", "item", "itemname", "title", "description"],
    "price": ["price", "saleprice", "retailprice", "pricepkr", "rate", "mrp", "unitprice"],
    "stock": ["stock", "qty", "quantity", "stockqty", "onhand", "inventory", "openingstock"],
    "barcode": ["barcode", "ean", "upc", "code"],
    "sku": ["sku", "itemcode", "productcode", "articleno"],
    "category": ["category", "group", "department"],
    "cost": ["cost", "costprice", "purchaseprice", "buyingprice"],
    "hs_code": ["hscode", "hs"],
    "tax_rate": ["tax", "taxrate", "taxpct", "gst", "salestax"],
}

_NORM = re.compile(r"[^a-z0-9]")
_MONEY_JUNK = re.compile(r"[^\d.\-]")


def _norm(header: str) -> str:
    return _NORM.sub("", header.lower())


def parse_money_minor(raw: str) -> int:
    """'Rs 1,500.50' -> 150050. Empty/garbage -> 0 (a missing price is a fixable
    row, not a failed import)."""
    cleaned = _MONEY_JUNK.sub("", raw or "")
    try:
        return round(float(cleaned) * 100)
    except ValueError:
        return 0


def parse_number(raw: str, default: float = 0) -> float:
    cleaned = _MONEY_JUNK.sub("", raw or "")
    try:
        return float(cleaned)
    except ValueError:
        return default


def read_rows(body: bytes, headers: dict[str, list[str]]) -> list[dict[str, str]]:
    """Decode a CSV upload into dicts keyed by canonical field names.

    Raises 422 with a human-fixable message when the file is unusable — the
    error is shown to the person who exported the file, not to a developer.
    """
    # utf-8-sig eats Excel's BOM; latin-1 rescues legacy exports rather than
    # rejecting them (it can't fail — every byte maps).
    try:
        text = body.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = body.decode("latin-1")

    reader = csv.reader(io.StringIO(text))
    try:
        raw_header = next(reader)
    except StopIteration:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The file is empty.")

    synonyms = {syn: field for field, spellings in headers.items() for syn in spellings}
    mapping: dict[int, str] = {}
    for idx, cell in enumerate(raw_header):
        field = synonyms.get(_norm(cell))
        if field and field not in mapping.values():
            mapping[idx] = field

    if "name" not in mapping.values():
        known = ", ".join(sorted({s[0] for s in headers.values()}))
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Couldn't find a name column. First row must be headers — recognised names include: {known}.")

    rows = []
    for cells in reader:
        if not any(c.strip() for c in cells):
            continue  # blank line, common at the end of Excel exports
        rows.append({field: cells[idx].strip() if idx < len(cells) else ""
                     for idx, field in mapping.items()})
        if len(rows) > MAX_ROWS:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                                f"Maximum {MAX_ROWS} rows per import — split the file and try again.")
    return rows


def to_csv(fieldnames: list[str], rows: list[dict]) -> str:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue()
