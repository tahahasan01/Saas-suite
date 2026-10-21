"""Sales-tax rate lookup (D-10, migration 0058).

Rates are effective-dated platform data. Resolve them at the document's
date and the region of the selling branch (or the service recipient):

    r = await tax.rate_for(conn, "pst_services", sale_date, branch_region)
    # r["rate_pct"] (Decimal percentage), r["verified"], r["id"] to snapshot on the line

A region-specific row wins over the national one. Documents must snapshot
the code, rate and amounts on each line, never look them up again later.
"""
from __future__ import annotations

from datetime import date

import asyncpg

_COLS = ("id, code, kind, name, region_code, rate_pct, applies_to, included_in_price, effective_from, "
         "effective_to, verified, source_ref")
_IN_FORCE = "effective_from <= $1 and (effective_to is null or effective_to > $1)"


async def rate_for(conn: asyncpg.Connection, code: str, on: date, region: str | None = None) -> asyncpg.Record | None:
    row: asyncpg.Record | None = await conn.fetchrow(
        f"""select {_COLS} from tax_rates
             where code = $2 and {_IN_FORCE} and (region_code is null or region_code = $3)
             order by region_code is null limit 1""", on, code, region)
    return row


async def rates_on(conn: asyncpg.Connection, on: date, region: str | None = None) -> list[asyncpg.Record]:
    """Every rate in force on `on`; with a region, that region's rows plus national ones."""
    rows: list[asyncpg.Record] = await conn.fetch(
        f"""select {_COLS} from tax_rates
             where {_IN_FORCE} and ($2::text is null or region_code is null or region_code = $2)
             order by kind, code, region_code nulls first""", on, region)
    return rows


async def categories(conn: asyncpg.Connection) -> list[asyncpg.Record]:
    rows: list[asyncpg.Record] = await conn.fetch(
        "select code, name, description, rate_codes from tax_categories order by sort, code")
    return rows
