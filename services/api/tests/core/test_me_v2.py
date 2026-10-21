"""/auth/me v2 (St04 #5, D-04, 12-trd §5.2): one bootstrap call carrying the
modules, the permission map, a server-computed nav, locale/dir/tz, feature
flags and the terminology ETag. The web never derives access itself."""
from __future__ import annotations

import uuid

import asyncpg

from app.config import settings

from .test_me_permissions import _member


async def _owner(sql: str, *args):
    conn = await asyncpg.connect(settings.database_url)
    try:
        return await conn.fetch(sql, *args)
    finally:
        await conn.close()


def _nav(me: dict) -> dict[str, dict]:
    return {n["key"]: n for n in me["nav"]}


async def test_me_lists_every_module_with_its_state(client, crm_tenant):
    me = (await client.get("/auth/me")).json()
    mods = {m["key"]: m for m in me["modules"]}
    assert mods["crm"] == {"key": "crm", "state": "enabled", "application": True}
    assert mods["contacts"]["state"] == "enabled" and mods["contacts"]["application"] is False
    assert mods["pos"]["state"] == "disabled"
    assert mods["core"]["state"] == "enabled"


async def test_nav_is_manifests_cap_enabled_modules_cap_permissions(client, crm_tenant):
    nav = _nav((await client.get("/auth/me")).json())
    assert {"dashboard", "crm", "invoices", "automations", "settings"} <= set(nav)
    assert "pos" not in nav and "hrms" not in nav and "payroll" not in nav
    settings_tabs = [c["href"] for c in nav["settings"]["children"]]
    assert "/settings/roles" in settings_tabs and "/settings/fbr" not in settings_tabs   # FBR needs POS
    assert nav["crm"]["module"] == "crm" and nav["crm"]["href"] == "/crm"


async def test_nav_follows_the_callers_keys(client, crm_tenant):
    mate, _ = await _member(client, {"crm": ["read"], "settings": ["read"]})
    try:
        nav = _nav((await mate.get("/auth/me")).json())
        assert "crm" in nav
        tabs = [c["href"] for c in nav["settings"]["children"]]
        assert "/settings/team" in tabs and "/settings/roles" not in tabs
    finally:
        await mate.aclose()
    mate, _ = await _member(client, {"crm": ["read"]})
    try:
        assert "settings" not in _nav((await mate.get("/auth/me")).json())
    finally:
        await mate.aclose()


async def test_turning_a_module_on_reshapes_the_nav(client, crm_tenant):
    assert (await client.post("/platform/modules/pos/enable")).status_code == 200
    nav = _nav((await client.get("/auth/me")).json())
    assert "pos" in nav
    tabs = [c["href"] for c in nav["pos"]["children"]]
    assert {"/pos", "/pos/products", "/pos/purchase-orders"} <= set(tabs)
    assert "/settings/fbr" in [c["href"] for c in nav["settings"]["children"]]


async def test_flags_default_globally_and_a_tenant_row_overrides(client, crm_tenant):
    me = (await client.get("/auth/me")).json()
    assert me["flags"]["pos_offline"] is False
    await _owner("insert into feature_flags (flag_key, tenant_id, enabled) values ('pos_offline', $1, true)",
                 uuid.UUID(crm_tenant.tenant_id))
    assert (await client.get("/auth/me")).json()["flags"]["pos_offline"] is True


async def test_me_carries_the_terminology_etag_and_locale(client, crm_tenant):
    me = (await client.get("/auth/me")).json()
    term = me["terminology"]
    assert term["etag"].startswith('W/"') and term["industry_type"] == "retail"
    assert me["locale"]["dir"] == "ltr" and me["locale"]["timezone"] == "Asia/Karachi"
    # The tag moves when the labels do.
    await _owner("insert into terminology (industry_type, key, locale, label) values ('retail', $1, 'en', 'X')",
                 f"test.{uuid.uuid4().hex[:8]}")
    try:
        assert (await client.get("/auth/me")).json()["terminology"]["etag"] != term["etag"]
    finally:
        await _owner("delete from terminology where key like 'test.%'")
