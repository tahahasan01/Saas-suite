"""Company profile and branch settings (3A settings screens, migration 0055).

Name, timezone and FY start live on `tenants` (written through the owner
connection, field by field); legal name, NTN/STRN, address and province in
`tenant_company`. Only settings admins may change them.
"""
from __future__ import annotations

import uuid

import asyncpg

from app.config import settings

from .test_me_permissions import _member


async def test_company_profile_round_trip(client, crm_tenant):
    r = await client.get("/org/company")
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Fixture Co" and body["timezone"] == "Asia/Karachi" and body["fy_start_month"] == 7
    assert body["ntn"] is None and body["region_code"] is None

    r = await client.put("/org/company", json={
        "name": "Karachi Mart", "legal_name": "Karachi Mart (Pvt) Ltd", "ntn": "1234567-8",
        "strn": "1700000000017", "address": "Shop 4, Tariq Road", "city": "Karachi",
        "phone": "+922134567890", "email": "accounts@example.com", "region_code": "SD",
        "timezone": "Asia/Karachi", "fy_start_month": 7})
    assert r.status_code == 200, r.text
    got = (await client.get("/org/company")).json()
    assert got["name"] == "Karachi Mart" and got["ntn"] == "1234567-8" and got["region_code"] == "SD"
    assert got["city"] == "Karachi"
    # The tenant name is what the shell shows.
    assert (await client.get("/auth/me")).json()["tenant"]["name"] == "Karachi Mart"


async def test_partial_update_keeps_other_fields(client, crm_tenant):
    await client.put("/org/company", json={"legal_name": "A Ltd", "city": "Lahore"})
    r = await client.put("/org/company", json={"city": "Multan"})
    assert r.status_code == 200
    got = r.json()
    assert got["legal_name"] == "A Ltd" and got["city"] == "Multan"


async def test_company_profile_validation(client, crm_tenant):
    for bad in ({"ntn": "12ab"}, {"strn": "12"}, {"region_code": "XX"}, {"timezone": "Mars/Base"},
                {"fy_start_month": 13}, {"name": "  "}, {"email": "nope"}):
        r = await client.put("/org/company", json=bad)
        assert r.status_code == 422, (bad, r.text)


async def test_an_empty_ntn_clears_it(client, crm_tenant):
    await client.put("/org/company", json={"ntn": "1234567"})
    r = await client.put("/org/company", json={"ntn": ""})
    assert r.status_code == 200 and r.json()["ntn"] is None


async def test_changing_the_timezone_changes_the_tenant_clock(client, crm_tenant):
    r = await client.put("/org/company", json={"timezone": "Asia/Dubai"})
    assert r.status_code == 200
    conn = await asyncpg.connect(settings.database_url)
    try:
        tz = await conn.fetchval("select timezone from tenants where id=$1", uuid.UUID(crm_tenant.tenant_id))
    finally:
        await conn.close()
    assert tz == "Asia/Dubai"
    assert (await client.get("/auth/me")).json()["locale"]["timezone"] == "Asia/Dubai"


async def test_only_settings_admins_change_the_company(client, crm_tenant):
    mate, _ = await _member(client, {"crm": ["write"], "settings": ["read"]})
    try:
        assert (await mate.get("/org/company")).status_code == 200
        assert (await mate.put("/org/company", json={"city": "Quetta"})).status_code == 403
    finally:
        await mate.aclose()


async def test_company_change_is_audited(client, crm_tenant):
    await client.put("/org/company", json={"legal_name": "Audit Ltd", "name": "Audit Co"})
    conn = await asyncpg.connect(settings.database_url)
    try:
        actions = {(r["entity"], r["action"]) for r in await conn.fetch(
            "select entity, action from audit_log where tenant_id=$1", uuid.UUID(crm_tenant.tenant_id))}
    finally:
        await conn.close()
    assert ("tenant_company", "insert") in actions or ("tenant_company", "update") in actions
    assert ("tenant", "company.update") in actions


async def test_app_user_column_grants_are_exactly_the_reviewed_ones():
    """The company screen may change three tenant columns; never status or plan."""
    from . import grant_matrix
    conn = await asyncpg.connect(settings.database_url)
    try:
        rows = await conn.fetch(
            """select table_name, column_name from information_schema.column_privileges
                where grantee = 'app_user' and privilege_type = 'UPDATE' and table_schema = 'public'
                  and table_name not in (select table_name from information_schema.role_table_grants
                                          where grantee = 'app_user' and privilege_type = 'UPDATE')""")
    finally:
        await conn.close()
    got: dict[str, set[str]] = {}
    for r in rows:
        got.setdefault(r["table_name"], set()).add(r["column_name"])
    assert got == grant_matrix.APP_USER_COLUMN_UPDATES


# ── Branches ────────────────────────────────────────────────────────────────
async def test_branches_list_and_update_the_default_branch(client, crm_tenant):
    r = await client.get("/org/branches")
    assert r.status_code == 200
    [main] = r.json()
    assert main["code"] == "MAIN" and main["is_default"]
    r = await client.patch(f"/org/branches/{main['id']}", json={
        "name": "Tariq Road", "address": "Shop 4", "region_code": "SD", "fbr_pos_id": "123456"})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Tariq Road" and r.json()["region_code"] == "SD"


async def test_the_default_branch_cannot_be_deactivated(client, crm_tenant):
    [main] = (await client.get("/org/branches")).json()
    r = await client.patch(f"/org/branches/{main['id']}", json={"active": False})
    assert r.status_code == 422


async def test_branch_code_is_validated(client, crm_tenant):
    [main] = (await client.get("/org/branches")).json()
    r = await client.patch(f"/org/branches/{main['id']}", json={"code": "bad code"})
    assert r.status_code == 422


async def test_another_tenants_branch_is_not_found(client, crm_tenant):
    r = await client.patch(f"/org/branches/{uuid.uuid4()}", json={"name": "x"})
    assert r.status_code == 404
