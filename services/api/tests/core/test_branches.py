"""Branches inside a tenant and Pakistan regions (D-03, 3A, migration 0055).

Every tenant has one default branch (backfilled, and created with the tenant
at signup). Transactional tables carry a `branch_id` that a trigger fills with
the active branch, so existing inserts keep working without naming one. A
second, RESTRICTIVE policy hides rows of branches outside `app.branch_ids`,
which the server sets per request from `X-Branch-Ids` intersected with the
branches the user may use. With a single default branch all of this is
invisible; the tests below add a second branch to prove it bites.
"""
from __future__ import annotations

import uuid

import asyncpg
import pytest

from app import branches, context, db
from app.config import settings

from .test_me_permissions import _member

# Tables that hold transactions: branch_id required, branch policy on.
TRANSACTIONAL = ["pos_sales", "pos_returns", "pos_drawers", "pos_purchase_orders",
                 "hrms_attendance", "hrms_punches", "crm_invoice_requests"]
# Masters: branch_id nullable (null = shared by every branch).
MASTERS = ["pos_products"]

SELLER = {"seller_ntn_cnic": "1234567", "seller_business_name": "Fixture Traders",
          "seller_address": "1 Mall Road, Lahore", "token": "sandbox-token"}


async def _owner():
    return await asyncpg.connect(settings.database_url)


async def _default_branch(tenant_id: str) -> uuid.UUID:
    conn = await _owner()
    try:
        return await conn.fetchval(
            "select id from branches where tenant_id=$1 and is_default", uuid.UUID(tenant_id))
    finally:
        await conn.close()


async def _second_branch(tenant_id: str, code: str = "LHR2") -> uuid.UUID:
    conn = await _owner()
    try:
        return await conn.fetchval(
            "insert into branches (tenant_id, code, name) values ($1, $2, 'Second shop') returning id",
            uuid.UUID(tenant_id), code)
    finally:
        await conn.close()


# ── Regions ─────────────────────────────────────────────────────────────────
async def test_pk_regions_are_seeded_with_stable_codes_and_fbr_names():
    conn = await _owner()
    try:
        rows = await conn.fetch("select code, name, fbr_name, kind, pst_authority from pk_regions")
    finally:
        await conn.close()
    by_code = {r["code"]: r for r in rows}
    assert set(by_code) == {"PB", "SD", "KP", "BA", "ICT", "GB", "AJK"}
    assert by_code["PB"]["name"] == "Punjab" and by_code["PB"]["pst_authority"] == "PRA"
    assert by_code["SD"]["pst_authority"] == "SRB"
    assert by_code["KP"]["pst_authority"] == "KPRA"
    assert by_code["BA"]["pst_authority"] == "BRA"
    assert by_code["ICT"]["kind"] == "territory"
    assert all(r["fbr_name"] for r in rows)
    assert len({r["fbr_name"] for r in rows}) == 7


async def test_regions_endpoint_lists_them(client, crm_tenant):
    r = await client.get("/org/regions")
    assert r.status_code == 200
    assert [x["code"] for x in r.json()][:2] == ["PB", "SD"]


# ── Default branch ──────────────────────────────────────────────────────────
async def test_signup_creates_a_default_branch_and_a_home_branch_for_the_owner(client, crm_tenant):
    conn = await _owner()
    try:
        rows = await conn.fetch("select id, code, is_default from branches where tenant_id=$1",
                                uuid.UUID(crm_tenant.tenant_id))
        homes = await conn.fetch(
            """select ub.branch_id from user_branches ub join users u on u.id = ub.user_id
                where u.tenant_id = $1 and ub.is_home""", uuid.UUID(crm_tenant.tenant_id))
    finally:
        await conn.close()
    assert len(rows) == 1 and rows[0]["code"] == "MAIN" and rows[0]["is_default"]
    assert [h["branch_id"] for h in homes] == [rows[0]["id"]]


async def test_a_teammate_gets_the_default_branch_as_home(client, crm_tenant):
    mate, user_id = await _member(client, {"crm": ["read"]})
    await mate.aclose()
    conn = await _owner()
    try:
        home = await conn.fetchval("select branch_id from user_branches where user_id=$1 and is_home",
                                   uuid.UUID(user_id))
    finally:
        await conn.close()
    assert home == await _default_branch(crm_tenant.tenant_id)


async def test_only_one_default_branch_per_tenant(client, crm_tenant):
    conn = await _owner()
    try:
        with pytest.raises(asyncpg.UniqueViolationError):
            await conn.execute("insert into branches (tenant_id, code, name, is_default) values ($1,'X2','x',true)",
                               uuid.UUID(crm_tenant.tenant_id))
    finally:
        await conn.close()


# ── Structure ───────────────────────────────────────────────────────────────
@pytest.mark.parametrize("table", TRANSACTIONAL)
async def test_transactional_tables_require_a_branch_and_have_the_restrictive_policy(table):
    conn = await _owner()
    try:
        notnull = await conn.fetchval(
            "select attnotnull from pg_attribute where attrelid=$1::regclass and attname='branch_id'", table)
        pol = await conn.fetchrow(
            """select polpermissive, polcmd::text as cmd, pg_get_expr(polqual, polrelid) as qual,
                      pg_get_expr(polwithcheck, polrelid) as wcheck
                 from pg_policy where polrelid=$1::regclass and polname='branch_scope'""", table)
    finally:
        await conn.close()
    assert notnull is True, f"{table}.branch_id must be NOT NULL"
    assert pol is not None and not pol["polpermissive"] and pol["cmd"] == "*"
    assert "app_branch_visible(branch_id)" in pol["qual"] and "app_branch_visible(branch_id)" in pol["wcheck"]


@pytest.mark.parametrize("table", MASTERS)
async def test_masters_have_a_nullable_branch(table):
    conn = await _owner()
    try:
        notnull = await conn.fetchval(
            "select attnotnull from pg_attribute where attrelid=$1::regclass and attname='branch_id'", table)
        pol = await conn.fetchval(
            "select 1 from pg_policy where polrelid=$1::regclass and polname='branch_scope'", table)
    finally:
        await conn.close()
    assert notnull is False and pol == 1


# ── Inserts keep working and land in the default branch ─────────────────────
async def test_a_sale_made_without_naming_a_branch_lands_in_the_default_one(client, pos_tenant):
    product = (await client.get("/pos/products")).json()[0]
    r = await client.post("/pos/sales", json={"items": [{"product_id": product["id"], "qty": 1}],
                                              "paid_minor": 10**9, "payment_method": "cash"})
    assert r.status_code == 201, r.text
    conn = await _owner()
    try:
        branch = await conn.fetchval("select branch_id from pos_sales where id=$1", uuid.UUID(r.json()["id"]))
    finally:
        await conn.close()
    assert branch == await _default_branch(pos_tenant.tenant_id)


async def test_a_check_in_lands_in_the_default_branch(client, tenant):
    r = await client.post("/hrms/attendance/checkin", json={"employee_id": tenant.employee_id})
    assert r.status_code in (200, 201), r.text
    conn = await _owner()
    try:
        branches_ = {row["branch_id"] for row in await conn.fetch(
            "select branch_id from hrms_attendance where employee_id=$1", uuid.UUID(tenant.employee_id))}
    finally:
        await conn.close()
    assert branches_ == {await _default_branch(tenant.tenant_id)}


# ── The restrictive policy ──────────────────────────────────────────────────
async def _sale(client) -> str:
    product = (await client.get("/pos/products")).json()[0]
    r = await client.post("/pos/sales", json={"items": [{"product_id": product["id"], "qty": 1}],
                                              "paid_minor": 10**9, "payment_method": "cash"})
    r.raise_for_status()
    return r.json()["id"]


async def _app_count(tenant_id: str, branch_ids: str | None, table: str = "pos_sales") -> int:
    """Count rows as app_user with an explicit app.branch_ids (None = unset)."""
    conn = await asyncpg.connect(settings.app_database_url)
    try:
        async with conn.transaction():
            await conn.execute("select set_config('app.tenant_id', $1, true)", tenant_id)
            if branch_ids is not None:
                await conn.execute("select set_config('app.branch_ids', $1, true)", branch_ids)
            return await conn.fetchval(f"select count(*) from {table}")
    finally:
        await conn.close()


async def test_rows_of_inactive_branches_are_hidden_and_a_missing_setting_shows_none(client, pos_tenant):
    await _sale(client)
    main = await _default_branch(pos_tenant.tenant_id)
    other = await _second_branch(pos_tenant.tenant_id)
    assert await _app_count(pos_tenant.tenant_id, "*") == 1
    assert await _app_count(pos_tenant.tenant_id, str(main)) == 1
    assert await _app_count(pos_tenant.tenant_id, str(other)) == 0
    assert await _app_count(pos_tenant.tenant_id, f"{other},{main}") == 1
    # D-03: fail closed. No setting, or an empty one, returns no branch rows.
    assert await _app_count(pos_tenant.tenant_id, None) == 0
    assert await _app_count(pos_tenant.tenant_id, "") == 0
    # Masters with a null branch are shared, whatever the setting.
    assert await _app_count(pos_tenant.tenant_id, str(other), "pos_products") > 0


async def test_a_write_outside_the_active_branches_is_refused(client, pos_tenant):
    sale_id = await _sale(client)
    other = await _second_branch(pos_tenant.tenant_id)
    conn = await asyncpg.connect(settings.app_database_url)
    try:
        with pytest.raises(asyncpg.InsufficientPrivilegeError, match="row-level security"):
            async with conn.transaction():
                await conn.execute("select set_config('app.tenant_id', $1, true)", pos_tenant.tenant_id)
                main = await _default_branch(pos_tenant.tenant_id)
                await conn.execute("select set_config('app.branch_ids', $1, true)", str(main))
                await conn.execute("update pos_sales set branch_id=$1 where id=$2", other, uuid.UUID(sale_id))
    finally:
        await conn.close()


async def test_a_branch_of_another_tenant_cannot_be_referenced(client, pos_tenant):
    sale_id = await _sale(client)
    conn = await _owner()
    try:
        foreign_tenant = await conn.fetchval(
            "insert into tenants (name, industry_type) values ('Other', 'retail') returning id")
        foreign_branch = await conn.fetchval(
            "select id from branches where tenant_id=$1 and is_default", foreign_tenant)
        try:
            with pytest.raises(asyncpg.ForeignKeyViolationError):
                await conn.execute("update pos_sales set branch_id=$1 where id=$2",
                                   foreign_branch, uuid.UUID(sale_id))
        finally:
            await conn.execute("delete from tenants where id=$1", foreign_tenant)
    finally:
        await conn.close()


async def test_the_owner_sees_every_branch_and_x_branch_ids_narrows_it(client, pos_tenant):
    sale_id = await _sale(client)
    other = await _second_branch(pos_tenant.tenant_id)
    assert (await client.get(f"/pos/sales/{sale_id}")).status_code == 200
    r = await client.get(f"/pos/sales/{sale_id}", headers={"X-Branch-Ids": str(other)})
    assert r.status_code == 404
    # Junk in the header is ignored, not an error and not a widening.
    r = await client.get(f"/pos/sales/{sale_id}", headers={"X-Branch-Ids": "not-a-uuid"})
    assert r.status_code == 200


async def test_a_teammate_is_confined_to_their_own_branches(client, pos_tenant):
    sale_id = await _sale(client)
    other = await _second_branch(pos_tenant.tenant_id)
    mate, user_id = await _member(client, {"pos": ["read", "write"]})
    try:
        assert (await mate.get(f"/pos/sales/{sale_id}")).status_code == 200
        # Asking for a branch they don't belong to falls back to the home branch;
        # it never reveals the other branch's rows.
        r = await mate.get(f"/pos/sales/{sale_id}", headers={"X-Branch-Ids": str(other)})
        assert r.status_code == 200
        # Moved to the other branch only: the default branch's sale disappears.
        conn = await _owner()
        try:
            await conn.execute("delete from user_branches where user_id=$1", uuid.UUID(user_id))
            await conn.execute(
                "insert into user_branches (tenant_id, user_id, branch_id, is_home) values ($1,$2,$3,true)",
                uuid.UUID(pos_tenant.tenant_id), uuid.UUID(user_id), other)
        finally:
            await conn.close()
        assert (await mate.get(f"/pos/sales/{sale_id}")).status_code == 404
    finally:
        await mate.aclose()


async def test_session_branches_resolution(client, pos_tenant):
    """bos_session_branches(tenant, user, requested): '*' for branch admins,
    the user's branches otherwise, narrowed by the request."""
    main = await _default_branch(pos_tenant.tenant_id)
    other = await _second_branch(pos_tenant.tenant_id)
    mate, user_id = await _member(client, {"pos": ["read"]})
    await mate.aclose()
    owner_id = (await client.get("/auth/me")).json()["user"]["id"]
    conn = await _owner()
    try:
        f = "select bos_session_branches($1, $2, $3)"
        t = uuid.UUID(pos_tenant.tenant_id)
        assert await conn.fetchval(f, t, uuid.UUID(owner_id), None) == "*"
        assert await conn.fetchval(f, t, uuid.UUID(owner_id), [str(other)]) == str(other)
        assert await conn.fetchval(f, t, uuid.UUID(user_id), None) == str(main)
        assert await conn.fetchval(f, t, uuid.UUID(user_id), [str(other)]) == str(main)
        # A user of another tenant gets nothing here.
        assert await conn.fetchval(f, uuid.uuid4(), uuid.UUID(user_id), None) == ""
    finally:
        await conn.close()


async def test_a_deactivated_home_branch_is_never_the_fallback(client, pos_tenant):
    """Security review (fail-open): when X-Branch-Ids names none of the user's
    branches, the home branch is the fallback only while it is still one of
    their active branches. Otherwise: '' (no rows, D-03)."""
    main = await _default_branch(pos_tenant.tenant_id)
    other = await _second_branch(pos_tenant.tenant_id)
    mate, user_id = await _member(client, {"pos": ["read"]})
    await mate.aclose()
    t, u = uuid.UUID(pos_tenant.tenant_id), uuid.UUID(user_id)
    conn = await _owner()
    try:
        await conn.execute("delete from user_branches where user_id=$1", u)
        await conn.execute(
            "insert into user_branches (tenant_id, user_id, branch_id, is_home) values ($1,$2,$3,true)", t, u, other)
        await conn.execute("update branches set active=false where id=$1", other)
        f = "select bos_session_branches($1, $2, $3)"
        assert await conn.fetchval(f, t, u, [str(main)]) == ""
        assert await conn.fetchval(f, t, u, [str(uuid.uuid4())]) == ""
        assert await conn.fetchval(f, t, u, None) == ""
    finally:
        await conn.close()


async def test_jobs_and_system_connections_see_every_branch(client, pos_tenant):
    await _sale(client)
    await _second_branch(pos_tenant.tenant_id)
    with context.job("test.branches"):
        async with db.tenant_conn(pos_tenant.tenant_id) as conn:
            assert await conn.fetchval("select current_setting('app.branch_ids', true)") == "*"
            assert await conn.fetchval("select count(*) from pos_sales") == 1


# ── The reusable helper for new tables ──────────────────────────────────────
async def test_bos_branch_scope_attaches_column_trigger_and_policy_to_a_new_table(client, pos_tenant):
    main = await _default_branch(pos_tenant.tenant_id)
    conn = await _owner()
    tx = conn.transaction()
    await tx.start()
    try:
        await conn.execute("""create table branch_scope_probe (
                                id uuid primary key default gen_random_uuid(),
                                tenant_id uuid not null references tenants(id) on delete cascade)""")
        await conn.execute("insert into branch_scope_probe (tenant_id) values ($1)", uuid.UUID(pos_tenant.tenant_id))
        await conn.execute("call bos_branch_scope('branch_scope_probe', true)")
        # Backfilled, required, and filled on insert.
        assert await conn.fetchval("select branch_id from branch_scope_probe") == main
        assert await conn.fetchval(
            "select attnotnull from pg_attribute where attrelid='branch_scope_probe'::regclass and attname='branch_id'")
        await conn.execute("insert into branch_scope_probe (tenant_id) values ($1)", uuid.UUID(pos_tenant.tenant_id))
        assert await conn.fetchval("select count(*) from branch_scope_probe where branch_id=$1", main) == 2
        assert await conn.fetchval(
            "select polpermissive from pg_policy where polrelid='branch_scope_probe'::regclass and polname='branch_scope'"
        ) is False
        # Idempotent: a second call is harmless.
        await conn.execute("call bos_branch_scope('branch_scope_probe', true)")
    finally:
        await tx.rollback()
        await conn.close()


def test_python_helper_reports_the_tables():
    assert set(TRANSACTIONAL) <= set(branches.TRANSACTIONAL_TABLES)
    assert set(MASTERS) <= set(branches.MASTER_TABLES)


# ── FBR seller province ─────────────────────────────────────────────────────
async def _fbr_cfg(tenant_id: str):
    conn = await _owner()
    try:
        return await conn.fetchrow("select seller_province, seller_region_code from fbr_settings where tenant_id=$1",
                                   uuid.UUID(tenant_id))
    finally:
        await conn.close()


async def test_fbr_seller_province_links_to_a_region(client, pos_tenant):
    r = await client.put("/fbr/settings", json={**SELLER, "seller_province": "Punjab"})
    assert r.status_code == 200, r.text
    row = await _fbr_cfg(pos_tenant.tenant_id)
    fbr_names = await _fbr_names()
    assert row["seller_region_code"] == "PB" and row["seller_province"] == fbr_names["PB"]
    assert r.json()["seller_region_code"] == "PB"

    r = await client.put("/fbr/settings", json={"seller_region_code": "SD"})
    assert r.status_code == 200, r.text
    row = await _fbr_cfg(pos_tenant.tenant_id)
    assert row["seller_region_code"] == "SD" and row["seller_province"] == fbr_names["SD"]
    assert r.json()["seller_province"] == fbr_names["SD"]


async def test_an_unknown_province_is_refused(client, pos_tenant):
    r = await client.put("/fbr/settings", json={"seller_province": "Atlantis"})
    assert r.status_code == 422
    r = await client.put("/fbr/settings", json={"seller_region_code": "XX"})
    assert r.status_code == 422


async def _fbr_names() -> dict[str, str]:
    conn = await _owner()
    try:
        return {r["code"]: r["fbr_name"] for r in await conn.fetch("select code, fbr_name from pk_regions")}
    finally:
        await conn.close()
