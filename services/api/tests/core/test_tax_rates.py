"""Effective-dated sales-tax rates owned by the platform (D-10, 3A, 0058).

Rates are data with dates, never constants in code, and never copied from
Odoo's l10n_pk (its GST is still 17%). Every seeded rate is `verified =
false` until the founder checks it against the Gazette / provincial
notification, and the API says so, so the UI can warn while one is in use.
"""
from __future__ import annotations

from datetime import date

import asyncpg
import pytest

from app import db, tax
from app.config import settings

TODAY = date(2026, 10, 21)


async def _owner():
    return await asyncpg.connect(settings.database_url)


async def test_seeded_rates_are_all_unverified_and_cite_a_source():
    conn = await _owner()
    try:
        rows = await conn.fetch("select code, verified, source_ref from tax_rates")
    finally:
        await conn.close()
    assert rows, "no tax rates seeded"
    assert all(r["verified"] is False for r in rows)
    assert all(r["source_ref"].strip() for r in rows)
    codes = {r["code"] for r in rows}
    assert {"gst_standard", "pst_services", "further_tax", "wht_236g", "wht_236h"} <= codes


async def _rate(tenant, code: str, on: date, region: str | None = None):
    async with db.tenant_conn(tenant.tenant_id) as conn:
        return await tax.rate_for(conn, code, on, region)


async def test_gst_is_eighteen_percent_not_odoos_stale_seventeen(client, crm_tenant):
    r = await _rate(crm_tenant, "gst_standard", TODAY)
    assert r is not None and float(r["rate_pct"]) == 18.0 and r["kind"] == "gst"


@pytest.mark.parametrize("region,pct", [("PB", 16.0), ("SD", 15.0), ("KP", 15.0), ("BA", 15.0), ("ICT", 16.0)])
async def test_provincial_sales_tax_on_services_by_province(client, crm_tenant, region, pct):
    r = await _rate(crm_tenant, "pst_services", TODAY, region)
    assert r is not None and float(r["rate_pct"]) == pct and r["region_code"] == region


async def test_a_national_rate_applies_in_every_province(client, crm_tenant):
    r = await _rate(crm_tenant, "gst_standard", TODAY, "SD")
    assert r is not None and r["region_code"] is None


async def test_no_rate_before_it_took_effect(client, crm_tenant):
    assert await _rate(crm_tenant, "gst_standard", date(2001, 1, 1)) is None


async def test_overlapping_periods_for_one_code_and_region_are_refused():
    conn = await _owner()
    try:
        with pytest.raises(asyncpg.ExclusionViolationError):
            await conn.execute(
                """insert into tax_rates (code, kind, name, rate_pct, applies_to, effective_from, source_ref)
                   values ('gst_standard', 'gst', 'clash', 17, 'both', '2025-01-01', 'test')""")
        # A different province is a different rate: no clash.
        tx = conn.transaction()
        await tx.start()
        try:
            await conn.execute(
                """insert into tax_rates (code, kind, name, region_code, rate_pct, applies_to, effective_from,
                                          source_ref)
                   values ('pst_services', 'pst', 'GB services', 'GB', 15, 'sale', '2025-01-01', 'test')""")
        finally:
            await tx.rollback()
    finally:
        await conn.close()


async def test_a_new_rate_can_follow_an_ended_one():
    conn = await _owner()
    tx = conn.transaction()
    await tx.start()
    try:
        await conn.execute("update tax_rates set effective_to = '2027-07-01' where code = 'gst_standard'")
        await conn.execute(
            """insert into tax_rates (code, kind, name, rate_pct, applies_to, effective_from, source_ref)
               values ('gst_standard', 'gst', 'GST (future)', 19, 'both', '2027-07-01', 'test')""")
        assert await conn.fetchval(
            "select rate_pct from tax_rates where code='gst_standard' and effective_from <= '2027-07-01' "
            "and (effective_to is null or effective_to > '2027-07-01')") == 19
    finally:
        await tx.rollback()
        await conn.close()


async def test_app_user_reads_but_never_writes_rates(client, crm_tenant):
    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        async with db.tenant_conn(crm_tenant.tenant_id) as conn:
            await conn.execute("update tax_rates set rate_pct = 0")


async def test_rates_api_flags_unverified_rates_in_use(client, crm_tenant):
    r = await client.get("/tax/rates", params={"on": "2026-10-21"})
    assert r.status_code == 200
    body = r.json()
    assert body["unverified_in_use"] is True
    assert {x["code"] for x in body["rates"]} >= {"gst_standard", "pst_services"}
    r = await client.get("/tax/rates", params={"on": "2026-10-21", "region": "SD"})
    pst = [x for x in r.json()["rates"] if x["code"] == "pst_services"]
    assert [x["region_code"] for x in pst] == ["SD"]


async def test_categories_api(client, crm_tenant):
    r = await client.get("/tax/categories")
    assert r.status_code == 200
    cats = {c["code"]: c for c in r.json()}
    assert "gst_standard" in cats["standard"]["rate_codes"]
    assert cats["exempt"]["rate_codes"] == []
