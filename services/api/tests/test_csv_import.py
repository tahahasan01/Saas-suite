"""CSV import — the switching path.

The parser is tested against what real exports actually contain (Excel BOM,
"Rs 1,500" money, per-source header names), and the endpoints against the
behaviours that decide whether a migration survives: partial success with named
bad rows, and duplicate skipping that also sees rows earlier in the same file.
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.csv_io import LEAD_HEADERS, parse_money_minor, read_rows

CSV = "text/csv"


# ── parser ──────────────────────────────────────────────────────────────────
def test_header_synonyms_map_to_canonical_fields():
    rows = read_rows(
        "Full Name,Company Name,Mobile Number,E-mail Address,Deal Value\n"
        "Asad,Khan Traders,0300 1234567,asad@khan.pk,50000\n".encode(),
        LEAD_HEADERS)
    assert rows == [{"name": "Asad", "company": "Khan Traders", "phone": "0300 1234567",
                     "email": "asad@khan.pk", "value": "50000"}]


def test_excel_bom_does_not_break_the_first_header():
    rows = read_rows("﻿name\nAsad\n".encode("utf-8"), LEAD_HEADERS)
    assert rows[0]["name"] == "Asad"


def test_legacy_encoding_is_rescued_not_rejected():
    body = "name\nCafé Karachi\n".encode("latin-1")
    assert read_rows(body, LEAD_HEADERS)[0]["name"] == "Café Karachi"


def test_blank_trailing_lines_are_ignored():
    rows = read_rows(b"name\nAsad\n\n,,\n", LEAD_HEADERS)
    assert len(rows) == 1


def test_missing_name_column_is_a_422_with_guidance():
    with pytest.raises(HTTPException) as e:
        read_rows(b"foo,bar\n1,2\n", LEAD_HEADERS)
    assert e.value.status_code == 422
    assert "name" in e.value.detail.lower()


def test_money_parses_real_world_formats():
    assert parse_money_minor("Rs 1,500.50") == 150_050
    assert parse_money_minor("50000") == 5_000_000
    assert parse_money_minor("") == 0
    assert parse_money_minor("N/A") == 0


# ── leads endpoint ──────────────────────────────────────────────────────────
async def test_lead_import_creates_skips_and_reports(client, crm_tenant):
    before = len((await client.get("/crm/leads")).json())
    csv = (
        "Name,Company,Phone,Value\n"
        "Imran,Alpha Co,0311 1111111,10000\n"      # created
        ",No Name Co,0322 2222222,5\n"             # bad: no name -> reported
        "Imran Again,Beta Co,0311 1111111,20000\n"  # same phone as row 2 -> skipped
    )
    r = await client.post("/crm/leads/import", content=csv.encode(), headers={"Content-Type": CSV})
    assert r.status_code == 200
    result = r.json()
    assert result["created"] == 1
    assert result["skipped_duplicates"] == 1
    assert result["errors"] == [{"row": 3, "error": "Missing name"}]
    assert len((await client.get("/crm/leads")).json()) == before + 1


async def test_lead_import_can_force_past_duplicates(client, crm_tenant):
    csv = "Name,Phone\nA,0399 9999999\nB,0399 9999999\n"
    r = await client.post("/crm/leads/import?skip_duplicates=false",
                          content=csv.encode(), headers={"Content-Type": CSV})
    assert r.json()["created"] == 2


async def test_lead_export_round_trips(client, crm_tenant):
    r = await client.get("/crm/leads/export")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    header, *lines = r.text.strip().splitlines()
    assert header == "name,company,phone,email,source,value,stage,created_at"
    assert lines  # sample data seeded at signup

    # What we export, we must accept back.
    rows = read_rows(r.text.encode(), LEAD_HEADERS)
    assert rows[0]["name"]


# ── products endpoint ───────────────────────────────────────────────────────
async def test_product_import_with_prices_and_tax(client, pos_tenant):
    csv = (
        "Item Name,Sale Price,Qty,Barcode,Tax %\n"
        "Lux Soap,Rs 120.50,48,890123,18\n"
    )
    r = await client.post("/pos/products/import", content=csv.encode(), headers={"Content-Type": CSV})
    assert r.json()["created"] == 1
    p = next(p for p in (await client.get("/pos/products")).json() if p["name"] == "Lux Soap")
    assert p["price_minor"] == 12_050
    assert p["stock_qty"] == 48
    assert p["tax_rate"] == 18


async def test_product_import_skips_existing_barcode(client, pos_tenant):
    csv = "name,barcode\nSoap A,111222\n"
    assert (await client.post("/pos/products/import", content=csv.encode(),
                              headers={"Content-Type": CSV})).json()["created"] == 1
    again = await client.post("/pos/products/import",
                              content="name,barcode\nSoap A renamed,111222\n".encode(),
                              headers={"Content-Type": CSV})
    assert again.json() == {"created": 0, "skipped_duplicates": 1, "errors": []}


async def test_product_export_round_trips(client, pos_tenant):
    r = await client.get("/pos/products/export")
    assert r.status_code == 200
    assert r.text.startswith("name,sku,barcode,category,price,cost,stock,hs_code,tax_rate")
