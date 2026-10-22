"""Products and line items on deals (wave D, C14, migration 0120; study 12 §2).

A line has the shape of an invoice line; with a product its unit and
catalog price are snapshotted, so a later catalog change never moves an
open deal. Amounts
come from the one pricing function (D-21) with today's tax rates. While a
deal has lines its value_minor is their pre-tax total, written through
leads.save so the timeline, audit and `lead.*` events see it like any other
value change.

A price typed by hand is kept by "update prices"; a line discount above the
tenant's ceiling (crm_settings.max_discount_pct) needs
crm.deal.discount_override.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

import asyncpg
from fastapi import HTTPException, status

from . import invoicing, leads, sequences
from .crm_selling_models import CrmSettingsOut, DealLineIn, DealLineOut, DealLines
from .pricing import price_sale


def _line_out(r: asyncpg.Record) -> DealLineOut:
    return DealLineOut(
        id=str(r["id"]), position=r["position"], product_id=str(r["product_id"]) if r["product_id"] else None,
        description=r["description"], unit=r["unit"], qty=float(r["qty"]), unit_price_minor=r["unit_price_minor"],
        list_price_minor=r["list_price_minor"], price_overridden=r["price_overridden"],
        line_discount_minor=r["line_discount_minor"], tax_code=r["tax_code"], tax_rate_pct=float(r["tax_rate_pct"]),
        gross_minor=r["gross_minor"], net_excl_minor=r["net_excl_minor"], tax_minor=r["tax_minor"],
        total_minor=r["total_minor"])


async def read(conn: asyncpg.Connection, lead_id: str) -> DealLines:
    lead = await conn.fetchrow("select id, lines_tax_inclusive from crm_leads where id = $1", lead_id)
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead not found")
    rows = await conn.fetch("select * from crm_deal_lines where lead_id = $1 order by position", lead_id)
    lines = [_line_out(r) for r in rows]
    return DealLines(
        lead_id=str(lead["id"]), tax_inclusive=lead["lines_tax_inclusive"], lines=lines,
        subtotal_minor=sum(ln.gross_minor for ln in lines),
        line_discount_minor=sum(ln.line_discount_minor for ln in lines),
        net_minor=sum(ln.net_excl_minor for ln in lines), tax_minor=sum(ln.tax_minor for ln in lines),
        total_minor=sum(ln.total_minor for ln in lines))


async def settings(conn: asyncpg.Connection) -> CrmSettingsOut:
    row = await conn.fetchrow("select max_discount_pct, campaign_daily_cap from crm_settings")
    pct = row["max_discount_pct"] if row else None
    return CrmSettingsOut(max_discount_pct=float(pct) if pct is not None else None,
                          campaign_daily_cap=row["campaign_daily_cap"] if row else 500)


async def _products(conn: asyncpg.Connection, lines: list[DealLineIn]) -> dict[Any, asyncpg.Record]:
    """The catalog rows the lines name. A foreign key ignores RLS, so a
    product must be one this tenant can see."""
    wanted = {ln.product_id for ln in lines if ln.product_id is not None}
    if not wanted:
        return {}
    rows = await conn.fetch("select id, unit, price_minor from pos_products where id = any($1::uuid[])",
                            list(wanted))
    if len(rows) != len(wanted):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    return {r["id"]: r for r in rows}


def _over_ceiling(gross: int, discount: int, ceiling: Decimal | None) -> bool:
    # discount / gross > ceiling%, in integers: no rounding decides a permission.
    return ceiling is not None and discount > 0 and discount * 100 > gross * ceiling


async def replace(conn: asyncpg.Connection, tenant_id: str, actor_id: str, lead_id: str,
                  lines: list[DealLineIn], tax_inclusive: bool, *, can_override: bool) -> DealLines:
    """Price `lines` and make them the deal's lines; the deal's value follows."""
    before = await leads.lock(conn, lead_id)
    catalog = await _products(conn, lines)      # ids first: a foreign product is a 404 whatever the deal's state
    if before["status"] != "open":
        raise HTTPException(status.HTTP_409_CONFLICT, "Only an open deal's products can change")
    rows: list[dict[str, Any]] = []
    for ln in lines:
        p = catalog.get(ln.product_id) if ln.product_id else None
        list_price = p["price_minor"] if p else None
        rows.append({"product_id": ln.product_id, "description": ln.description,
                     "unit": (p["unit"] if p else "")[:20], "qty": ln.qty, "unit_price_minor": ln.unit_price_minor,
                     "list_price_minor": list_price,
                     "price_overridden": p is not None and ln.unit_price_minor != list_price,
                     "line_discount_minor": ln.line_discount_minor, "tax_code": ln.tax_code})
    return await _write(conn, tenant_id, actor_id, before, rows, tax_inclusive, can_override=can_override)


async def update_prices(conn: asyncpg.Connection, tenant_id: str, actor_id: str, lead_id: str,
                        *, can_override: bool) -> DealLines:
    """Re-read the catalog price of every product line not priced by hand."""
    before = await leads.lock(conn, lead_id)
    if before["status"] != "open":
        raise HTTPException(status.HTTP_409_CONFLICT, "Only an open deal's products can change")
    current = await conn.fetch(
        """select l.*, p.price_minor as catalog_price from crm_deal_lines l
             left join pos_products p on p.id = l.product_id
            where l.lead_id = $1 order by l.position""", lead_id)
    rows: list[dict[str, Any]] = []
    for r in current:
        row = {k: r[k] for k in ("product_id", "description", "unit", "qty", "unit_price_minor",
                                 "list_price_minor", "price_overridden", "line_discount_minor", "tax_code")}
        if r["catalog_price"] is not None and not r["price_overridden"]:
            row.update(unit_price_minor=r["catalog_price"], list_price_minor=r["catalog_price"])
        rows.append(row)
    return await _write(conn, tenant_id, actor_id, before, rows, before["lines_tax_inclusive"],
                        can_override=can_override)


async def _write(conn: asyncpg.Connection, tenant_id: str, actor_id: str, before: asyncpg.Record,
                 rows: list[dict[str, Any]], tax_inclusive: bool, *, can_override: bool) -> DealLines:
    today = await sequences.local_date(conn, None)
    rates = await invoicing.rates_for(conn, [r["tax_code"] for r in rows], today)
    priced = price_sale([(r["unit_price_minor"], r["qty"], rate.pct) for r, rate in zip(rows, rates)], 0,
                        tax_on=True, inclusive=tax_inclusive,
                        line_discounts=[r["line_discount_minor"] for r in rows])
    if not can_override:
        ceiling = await conn.fetchval("select max_discount_pct from crm_settings")
        if any(_over_ceiling(p.gross_minor, r["line_discount_minor"], ceiling) for r, p in zip(rows, priced.lines)):
            raise HTTPException(status.HTTP_403_FORBIDDEN,
                                f"A discount above {ceiling.normalize():f}% needs a manager")
    lead_id = before["id"]
    await conn.execute("delete from crm_deal_lines where lead_id = $1", lead_id)
    await conn.executemany(
        """insert into crm_deal_lines (tenant_id, lead_id, position, product_id, description, unit, qty,
                                       unit_price_minor, list_price_minor, price_overridden, line_discount_minor,
                                       tax_code, tax_rate_id, tax_rate_pct, gross_minor, net_excl_minor,
                                       tax_minor, total_minor)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)""",
        [(tenant_id, lead_id, i, r["product_id"], r["description"], r["unit"], r["qty"], r["unit_price_minor"],
          r["list_price_minor"], r["price_overridden"], p.line_discount_minor, rate.code, rate.rate_id, rate.pct,
          p.gross_minor, p.excl_minor, p.tax_minor, p.total_minor)
         for i, (r, rate, p) in enumerate(zip(rows, rates, priced.lines))])
    patch: dict[str, Any] = {"line_count": len(rows), "lines_tax_inclusive": tax_inclusive,
                             "lines_tax_minor": priced.tax_minor, "lines_total_minor": priced.total_minor}
    if rows:
        # No lines left: the last total stays as the typed estimate.
        patch["value_minor"] = sum(p.excl_minor for p in priced.lines)
    patch = {k: v for k, v in patch.items() if before[k] != v}
    await leads.save(conn, actor_id, before, patch)
    return await read(conn, str(lead_id))
