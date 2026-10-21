"""RBAC v2 (D-04, TR-SEC-35/36, checklist 3A, migration 0053).

Users hold several roles, roles inherit roles, and a role grants permission
keys at a scope. The old (section, action) grants map onto the key catalog;
for one release a shim evaluates both and logs where they disagree, while the
old check still decides for roles that were never edited in v2. RBAC_MODE
(legacy | shadow | v2) is the rollback switch (§7.7).
"""
from __future__ import annotations

import uuid

import asyncpg
from httpx import ASGITransport, AsyncClient

from app import rbac, scopes
from app.config import settings
from app.main import app
from app.security import SESSION_COOKIE

from .test_me_permissions import PASSWORD, _member


async def _owner(sql: str, *args):
    conn = await asyncpg.connect(settings.database_url)
    try:
        return await conn.fetch(sql, *args)
    finally:
        await conn.close()


async def _login(email: str) -> AsyncClient:
    c = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    r = await c.post("/auth/login", json={"email": email, "password": PASSWORD})
    r.raise_for_status()
    c.cookies.set(SESSION_COOKIE, r.cookies[SESSION_COOKIE])
    return c


async def _user_on(owner_client, role_ids: list[str]) -> tuple[AsyncClient, str, str]:
    """A teammate holding exactly `role_ids` (first is the primary), logged in."""
    email = f"mate+{uuid.uuid4().hex[:10]}@example.com"
    r = await owner_client.post("/team/users", json={
        "name": "Mate", "email": email, "password": PASSWORD, "role_id": role_ids[0]})
    r.raise_for_status()
    uid = r.json()["id"]
    if len(role_ids) > 1:
        r = await owner_client.put(f"/team/users/{uid}/roles", json={"role_ids": role_ids})
        assert r.status_code == 200, r.text
    return await _login(email), uid, email


async def _role(owner_client, grants: list[dict], name: str | None = None) -> str:
    r = await owner_client.post("/roles", json={"name": name or f"Role {uuid.uuid4().hex[:6]}",
                                                "grants": grants})
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ── Mapping the legacy grants onto the catalog ──────────────────────────────
def test_legacy_section_action_maps_onto_the_catalog():
    read = rbac.legacy_grants("crm", "read")
    assert {"crm.lead.read", "crm.lead.export", "invoicing.invoice.read"} <= read
    assert "crm.lead.create" not in read
    # Mirrors the old guards exactly: `write` never carried `read` there either.
    assert rbac.legacy_grants("crm", "write") >= {"crm.lead.create", "crm.lead.update"}
    assert rbac.legacy_grants("crm", "admin") >= read | rbac.legacy_grants("crm", "write")
    assert rbac.legacy_grants("accounts", "admin") == {"invoicing.invoice.approve"}
    # Salary and CNIC never ride on an HRMS grant (TR-SEC-36).
    assert not {k for k in rbac.legacy_grants("hrms", "admin") if k.startswith("payroll.")}


async def test_signup_and_legacy_roles_carry_v2_grants(client, crm_tenant):
    tid = uuid.UUID(crm_tenant.tenant_id)
    owner_grants = await _owner(
        """select g.permission_key, g.scope from role_grants g join roles r on r.id = g.role_id
            where r.tenant_id=$1 and r.name='Owner'""", tid)
    assert [(g["permission_key"], g["scope"]) for g in owner_grants] == [("*", "all")]
    links = await _owner("select count(*) as n from user_roles where tenant_id=$1", tid)
    assert links[0]["n"] == 1                      # the owner, via the users trigger

    r = await client.post("/team/roles", json={"name": "Reader", "permissions": {"crm": ["read"]}})
    rid = uuid.UUID(r.json()["id"])
    keys = {g["permission_key"] for g in await _owner(
        "select permission_key from role_grants where role_id=$1", rid)}
    assert keys == rbac.legacy_grants("crm", "read")


async def test_a_new_user_gets_a_user_roles_row_and_a_role_change_moves_it(client, crm_tenant):
    roles = (await client.get("/team/roles")).json()
    owner_role = next(r["id"] for r in roles if r["name"] == "Owner")
    reader = (await client.post("/team/roles", json={"name": "R1", "permissions": {"crm": ["read"]}})).json()
    mate, uid, _ = await _user_on(client, [reader["id"]])
    await mate.aclose()
    held = await _owner("select role_id from user_roles where user_id=$1", uuid.UUID(uid))
    assert [str(r["role_id"]) for r in held] == [reader["id"]]
    await client.patch(f"/team/users/{uid}", json={"role_id": owner_role})
    held = await _owner("select role_id from user_roles where user_id=$1", uuid.UUID(uid))
    assert [str(r["role_id"]) for r in held] == [owner_role]


# ── The shim ────────────────────────────────────────────────────────────────
async def test_shadow_mode_logs_a_mismatch_and_lets_the_old_check_decide(client, crm_tenant, monkeypatch):
    monkeypatch.setattr(settings, "rbac_mode", "shadow")
    mate, _ = await _member(client, {"crm": ["read"]})
    try:
        me = (await mate.get("/auth/me")).json()
        role_id = (await _owner("select role_id from users where id=$1", uuid.UUID(me["user"]["id"])))[0]["role_id"]
        # Drift: the migrated grants go missing.
        await _owner("delete from role_grants where role_id=$1", role_id)
        rbac.SHADOW_LOG.clear()
        assert (await mate.get("/crm/leads")).status_code == 200      # legacy still decides
        assert any(m["user_id"] == me["user"]["id"] and m["check"] == "crm:read" for m in rbac.SHADOW_LOG)
        assert "crm.lead.read" in (await mate.get("/auth/me")).json()["permissions"]
        assert any(m["check"] == "crm.lead.read" and m["legacy"] == "all" and m["v2"] is None
                   for m in rbac.SHADOW_LOG)
    finally:
        await mate.aclose()


async def test_v2_mode_enforces_the_new_grants(client, crm_tenant, monkeypatch):
    mate, _ = await _member(client, {"crm": ["read"]})
    try:
        me = (await mate.get("/auth/me")).json()
        role_id = (await _owner("select role_id from users where id=$1", uuid.UUID(me["user"]["id"])))[0]["role_id"]
        await _owner("delete from role_grants where role_id=$1", role_id)
        monkeypatch.setattr(settings, "rbac_mode", "v2")
        assert (await mate.get("/crm/leads")).status_code == 403
        assert "crm.lead.read" not in (await mate.get("/auth/me")).json()["permissions"]
    finally:
        await mate.aclose()


CRM_READ = [{"permission_key": k, "scope": "all"} for k in sorted(rbac.legacy_grants("crm", "read"))]


async def test_legacy_mode_ignores_v2_only_roles(client, crm_tenant, monkeypatch):
    rid = await _role(client, CRM_READ)
    mate, _, _ = await _user_on(client, [rid])
    try:
        assert (await mate.get("/crm/pipelines")).status_code == 200
        monkeypatch.setattr(settings, "rbac_mode", "legacy")
        assert (await mate.get("/crm/pipelines")).status_code == 403
    finally:
        await mate.aclose()


# ── v2 roles end to end ─────────────────────────────────────────────────────
async def test_a_v2_role_passes_an_old_section_guard_only_with_every_key_it_mapped(client, crm_tenant):
    """An old `require("crm", "read")` route needs every key (crm, read) mapped
    to, at 'all' — one narrow key never opens the whole section."""
    rid = await _role(client, [{"permission_key": "crm.lead.read", "scope": "all"}])
    mate, _, _ = await _user_on(client, [rid])
    try:
        assert (await mate.get("/crm/pipelines")).status_code == 403
        assert (await mate.get("/auth/me")).json()["permissions"] == {"crm.lead.read": "all"}
    finally:
        await mate.aclose()
    rid = await _role(client, CRM_READ)
    mate, _, _ = await _user_on(client, [rid])
    try:
        assert (await mate.get("/crm/pipelines")).status_code == 200
        r = await mate.post("/crm/leads", json={"name": "Nope", "phone": "03001234567"})
        assert r.status_code == 403
    finally:
        await mate.aclose()


async def test_several_roles_add_up_and_the_widest_scope_wins(client, crm_tenant, monkeypatch):
    monkeypatch.setitem(scopes.WIRED, "crm.lead.read", ("test",))   # narrowable for this test
    a = await _role(client, [{"permission_key": "crm.lead.read", "scope": "own"}])
    b = await _role(client, [{"permission_key": "crm.lead.read", "scope": "team"},
                             {"permission_key": "invoicing.invoice.read", "scope": "all"}])
    mate, uid, _ = await _user_on(client, [a, b])
    try:
        perms = (await mate.get("/auth/me")).json()["permissions"]
        assert perms["crm.lead.read"] == "team"
        assert perms["invoicing.invoice.read"] == "all"
        users = (await client.get("/team/users")).json()
        row = next(u for u in users if u["id"] == uid)
        assert {r["id"] for r in row["roles"]} == {a, b}
    finally:
        await mate.aclose()


async def test_changing_someones_roles_signs_them_out(client, crm_tenant):
    a = await _role(client, [{"permission_key": "crm.lead.read", "scope": "all"}])
    b = await _role(client, [{"permission_key": "invoicing.invoice.read", "scope": "all"}])
    mate, uid, email = await _user_on(client, [a])
    try:
        assert (await mate.get("/auth/me")).status_code == 200
        r = await client.put(f"/team/users/{uid}/roles", json={"role_ids": [a, b]})
        assert r.status_code == 200
        assert (await mate.get("/auth/me")).status_code == 401      # D-05
        again = await _login(email)
        assert "invoicing.invoice.read" in (await again.get("/auth/me")).json()["permissions"]
        await again.aclose()
    finally:
        await mate.aclose()


async def test_roles_inherit_roles_without_cycles(client, crm_tenant):
    base = await _role(client, [{"permission_key": "crm.lead.read", "scope": "all"}])
    top = await _role(client, [{"permission_key": "crm.lead.create", "scope": "all"}])
    r = await client.put(f"/roles/{top}/inherits", json={"role_ids": [base]})
    assert r.status_code == 200, r.text
    assert (await client.put(f"/roles/{base}/inherits", json={"role_ids": [top]})).status_code == 409
    assert (await client.put(f"/roles/{top}/inherits", json={"role_ids": [top]})).status_code == 409
    mate, _, _ = await _user_on(client, [top])
    try:
        perms = (await mate.get("/auth/me")).json()["permissions"]
        assert {"crm.lead.read", "crm.lead.create"} <= set(perms)
    finally:
        await mate.aclose()


async def test_grant_validation(client, crm_tenant, monkeypatch):
    monkeypatch.setitem(scopes.WIRED, "crm.lead.read", ("test",))
    rid = await _role(client, [])
    bad = [
        [{"permission_key": "crm.lead.teleport", "scope": "all"}],     # not in the catalog
        [{"permission_key": "settings.team.manage", "scope": "own"}],  # not a scoped resource
        [{"permission_key": "*", "scope": "all"}],                     # Owner only
        [{"permission_key": "crm.lead.read", "scope": "galaxy"}],
    ]
    for grants in bad:
        assert (await client.put(f"/roles/{rid}/grants", json={"grants": grants})).status_code == 422, grants
    ok = [{"permission_key": "crm.*", "scope": "all"}, {"permission_key": "crm.lead.read", "scope": "own"}]
    r = await client.put(f"/roles/{rid}/grants", json={"grants": ok})
    assert r.status_code == 200, r.text
    detail = (await client.get(f"/roles/{rid}")).json()
    assert {(g["permission_key"], g["scope"]) for g in detail["grants"]} == {("crm.*", "all"), ("crm.lead.read", "own")}


async def test_system_roles_are_copied_not_edited(client, crm_tenant, monkeypatch):
    monkeypatch.setitem(scopes.WIRED, "crm.lead.read", ("test",))
    roles = (await client.get("/roles")).json()
    owner = next(r for r in roles if r["name"] == "Owner")
    assert owner["is_system"]
    r = await client.put(f"/roles/{owner['id']}/grants", json={"grants": []})
    assert r.status_code == 409
    assert (await client.delete(f"/roles/{owner['id']}")).status_code == 409
    r = await client.post(f"/roles/{owner['id']}/copy", json={"name": "Deputy owner"})
    assert r.status_code == 201
    copy = (await client.get(f"/roles/{r.json()['id']}")).json()
    assert copy["is_system"] is False and [g["permission_key"] for g in copy["grants"]] == ["*"]
    # The copy may keep the '*' it was born with while its other grants change.
    r = await client.put(f"/roles/{copy['id']}/grants", json={"grants": [
        {"permission_key": "*", "scope": "all"}, {"permission_key": "crm.lead.read", "scope": "own"}]})
    assert r.status_code == 200, r.text


async def test_role_crud_and_in_use_protection(client, crm_tenant):
    rid = await _role(client, [{"permission_key": "crm.lead.read", "scope": "all"}], name="Temp")
    assert (await client.patch(f"/roles/{rid}", json={"name": "Temp 2", "description": "x"})).status_code == 200
    mate, uid, _ = await _user_on(client, [rid])
    await mate.aclose()
    assert (await client.delete(f"/roles/{rid}")).status_code == 409    # someone holds it
    owner_role = next(r["id"] for r in (await client.get("/roles")).json() if r["name"] == "Owner")
    await client.patch(f"/team/users/{uid}", json={"role_id": owner_role})
    assert (await client.delete(f"/roles/{rid}")).status_code == 204


async def test_the_catalog_lists_keys_by_module_with_scope_support(client, crm_tenant, monkeypatch):
    monkeypatch.setitem(scopes.WIRED, "crm.lead.read", ("test",))
    r = await client.get("/permissions/catalog")
    assert r.status_code == 200
    mods = {m["module"]: m for m in r.json()}
    crm_keys = {k["key"]: k for k in mods["crm"]["keys"]}
    assert crm_keys["crm.lead.read"]["scoped"] is True
    assert crm_keys["invoicing.invoice.approve"]["scoped"] is False
    assert crm_keys["crm.lead.read"]["legacy"] == ["crm", "read"]
    assert set(rbac.PERMISSIONS) == {k["key"] for m in r.json() for k in m["keys"]}


async def test_roles_and_catalog_need_the_roles_permission(client, crm_tenant):
    mate, _ = await _member(client, {"crm": ["read"], "settings": ["read"]})
    try:
        assert (await mate.get("/permissions/catalog")).status_code == 403
        assert (await mate.post("/roles", json={"name": "x", "grants": []})).status_code == 403
        assert (await mate.get("/team/users")).status_code == 200
    finally:
        await mate.aclose()


async def test_roles_are_tenant_private(client, crm_tenant):
    rid = await _role(client, [])
    other = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    r = await other.post("/auth/signup", json={
        "company_name": "Other Co", "industry_type": "retail", "sections": ["crm"], "name": "O",
        "email": f"test+{uuid.uuid4().hex[:10]}@example.com", "password": PASSWORD, "sample_data": False})
    other.cookies.set(SESSION_COOKIE, r.cookies[SESSION_COOKIE])
    try:
        assert (await other.get(f"/roles/{rid}")).status_code == 404
        assert (await other.put(f"/roles/{rid}/grants", json={"grants": []})).status_code == 404
    finally:
        await _owner("delete from tenants where id=$1", uuid.UUID(r.json()["tenant"]["id"]))
        await other.aclose()


# ── Teams (what "team" scope means) ─────────────────────────────────────────
async def test_teams_and_members(client, crm_tenant, monkeypatch):
    monkeypatch.setitem(scopes.WIRED, "crm.lead.read", ("test",))
    rid = await _role(client, [{"permission_key": "crm.lead.read", "scope": "team"}])
    a, a_id, _ = await _user_on(client, [rid])
    await a.aclose()
    r = await client.post("/teams", json={"name": "Lahore sales", "lead_user_id": a_id})
    assert r.status_code == 201, r.text
    team_id = r.json()["id"]
    me = (await client.get("/auth/me")).json()["user"]["id"]
    r = await client.put(f"/teams/{team_id}/members", json={"user_ids": [a_id, me]})
    assert r.status_code == 200
    teams = (await client.get("/teams")).json()
    t = next(t for t in teams if t["id"] == team_id)
    assert set(t["member_ids"]) == {a_id, me} and t["lead_user_id"] == a_id
    assert (await client.post("/teams", json={"name": "Lahore sales"})).status_code == 409
