"""CSV parsing against what real exports actually contain: Excel BOM, "Rs 1,500"
money, legacy encodings and per-source header names."""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.csv_io import LEAD_HEADERS, parse_money_minor, read_rows


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
