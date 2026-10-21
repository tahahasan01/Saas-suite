"""Security review of RBAC v2 (three findings), each pinned by a denial test.

1. The legacy `require(section, action)` shim must not pass a v2 role that
   holds just one narrow key mapped to that grant: it needs every key the
   grant mapped to, at scope 'all' (old routes apply no record scope).
2. A narrower-than-'all' scope may only be granted, and only counts, on keys
   whose every route applies the scope predicate (scopes.WIRED).
3. Owner-template ('*') holders: only another '*' holder may change them or
   hand out '*', and no change may leave the tenant without one.
"""
from __future__ import annotations

import uuid

import asyncpg
import pytest

from app import rbac, scopes
from app.config import settings

from .test_rbac_v2 import _role, _user_on


async def _owner(sql: str, *args):
    conn = await asyncpg.connect(settings.database_url)
    try:
        return await conn.fetch(sql, *args)
    finally:
        await conn.close()


def _principal(rows: list[tuple[str, str]]) -> rbac.Principal:
    return rbac.Principal(user_id="u", role_id="r", v2=rows, legacy_decides=False,
                          modules_on={"crm", "contacts"})


# ── 1. The require() shim ───────────────────────────────────────────────────
def test_one_narrow_key_does_not_open_a_whole_section_grant():
    p = _principal([("settings.workflows.manage", "all")])
    assert not p.allows_section("settings", "admin")
    every = [(k, "all") for k, perm in rbac.PERMISSIONS.items() if perm.section == "settings" and perm.action == "admin"]
    assert _principal(every).allows_section("settings", "admin")
    # Old routes apply no record scope, so a narrowed key doesn't count there.
    reads = [(k, "own") for k, perm in rbac.PERMISSIONS.items() if perm.section == "crm" and perm.action == "read"]
    assert not _principal(reads).allows_section("crm", "read")


async def test_a_narrow_settings_role_reaches_no_admin_route(client, crm_tenant):
    rid = await _role(client, [{"permission_key": "settings.workflows.manage", "scope": "all"},
                               {"permission_key": "settings.team.read", "scope": "all"}])
    mate, _, _ = await _user_on(client, [rid])
    try:
        roles = (await client.get("/team/roles")).json()
        assert (await mate.post("/team/users", json={"name": "X", "email": f"x+{uuid.uuid4().hex[:8]}@example.com",
                                                     "password": "Sup3rSecret!23", "role_id": roles[0]["id"]})).status_code == 403
        assert (await mate.post("/team/invite", json={"email": "y@example.com", "role_id": roles[0]["id"]})).status_code == 403
        assert (await mate.post("/team/roles", json={"name": "Z", "permissions": {}})).status_code == 403
        assert (await mate.post("/billing/upgrade", json={"plan": "growth"})).status_code == 403
        assert (await mate.get("/team/users")).status_code == 200        # settings.team.read
        assert (await mate.post("/workflows", json={"name": "W", "trigger": "lead.created"})).status_code == 201
    finally:
        await mate.aclose()


# ── 2. Scopes only where they are enforced ──────────────────────────────────
async def test_a_narrow_scope_on_an_unwired_key_is_refused_and_never_counts(client, crm_tenant):
    assert "crm.lead.export" not in scopes.WIRED   # the export route applies no scope
    rid = await _role(client, [])
    r = await client.put(f"/roles/{rid}/grants", json={"grants": [{"permission_key": "crm.lead.export", "scope": "own"}]})
    assert r.status_code == 422
    # A narrow grant that got in anyway (old data, a direct write) is a deny.
    await _owner("insert into role_grants (tenant_id, role_id, permission_key, scope) values ($1,$2,'crm.lead.export','own')",
                 uuid.UUID(crm_tenant.tenant_id), uuid.UUID(rid))
    mate, _, _ = await _user_on(client, [rid])
    try:
        assert "crm.lead.export" not in (await mate.get("/auth/me")).json()["permissions"]
        assert (await mate.get("/crm/leads/export")).status_code == 403
    finally:
        await mate.aclose()


def test_the_catalog_only_offers_narrow_scopes_on_wired_keys():
    for key in rbac.PERMISSIONS:
        assert scopes.narrowable(key) == (key in scopes.WIRED)


# ── 3. Owner-template holders ───────────────────────────────────────────────
async def _admin(client) -> tuple:
    """A teammate who manages team and roles but is not an Owner-template holder."""
    rid = await _role(client, [{"permission_key": k, "scope": "all"} for k in
                               ("settings.team.read", "settings.team.manage", "settings.roles.manage")])
    return await _user_on(client, [rid])


async def test_a_non_owner_admin_cannot_touch_owners_or_hand_out_star(client, crm_tenant):
    owner_id = (await client.get("/auth/me")).json()["user"]["id"]
    owner_role = next(r["id"] for r in (await client.get("/roles")).json() if r["template_key"] == "owner")
    reader = await _role(client, [{"permission_key": "crm.lead.read", "scope": "all"}])
    admin, _, _ = await _admin(client)
    try:
        assert (await admin.put(f"/team/users/{owner_id}/roles", json={"role_ids": [reader]})).status_code == 403
        assert (await admin.patch(f"/team/users/{owner_id}", json={"status": "disabled"})).status_code == 403
        assert (await admin.patch(f"/team/users/{owner_id}", json={"role_id": reader})).status_code == 403
        assert (await admin.post("/team/users", json={"name": "E", "email": f"e+{uuid.uuid4().hex[:8]}@example.com",
                                                      "password": "Sup3rSecret!23", "role_id": owner_role})).status_code == 403
        assert (await admin.post("/team/invite", json={"email": "z@example.com", "role_id": owner_role})).status_code == 403
        assert (await admin.put(f"/roles/{reader}/inherits", json={"role_ids": [owner_role]})).status_code == 403
        assert (await admin.post(f"/roles/{owner_role}/copy", json={"name": "Mine now"})).status_code == 403
        mate, mate_id, _ = await _user_on(client, [reader])
        await mate.aclose()
        assert (await admin.put(f"/team/users/{mate_id}/roles", json={"role_ids": [reader, owner_role]})).status_code == 403
    finally:
        await admin.aclose()


async def test_no_change_leaves_the_tenant_without_an_owner(client, crm_tenant):
    owner_id = (await client.get("/auth/me")).json()["user"]["id"]
    owner_role = next(r["id"] for r in (await client.get("/roles")).json() if r["template_key"] == "owner")
    deputy = (await client.post(f"/roles/{owner_role}/copy", json={"name": "Deputy"})).json()["id"]
    reader = await _role(client, [{"permission_key": "crm.lead.read", "scope": "all"}])
    b, b_id, _ = await _user_on(client, [deputy])
    try:
        # B (a '*' holder) may demote A: B is still an owner.
        assert (await b.put(f"/team/users/{owner_id}/roles", json={"role_ids": [reader]})).status_code == 200
        # Now B is the last '*' holder: stripping it from Deputy, or disabling B, would lock the tenant.
        r = await b.put(f"/roles/{deputy}/grants", json={"grants": [{"permission_key": "crm.lead.read", "scope": "all"}]})
        assert r.status_code == 409
        assert (await b.patch(f"/team/users/{b_id}", json={"status": "disabled"})).status_code == 409
        assert (await b.put(f"/roles/{deputy}/inherits", json={"role_ids": []})).status_code == 200   # harmless
    finally:
        await b.aclose()


# ── Second review: role assignment parity, disabled owners ──────────────────
# Every route that can set someone's role, as (method, path, body) builders.
async def _set_role_routes(target_id: str, role_id: str) -> list[tuple[str, str, dict]]:
    return [
        ("post", "/team/users", {"name": "N", "email": f"n+{uuid.uuid4().hex[:8]}@example.com",
                                 "password": "Sup3rSecret!23", "role_id": role_id}),
        ("post", "/team/invite", {"email": f"i+{uuid.uuid4().hex[:8]}@example.com", "role_id": role_id}),
        ("patch", f"/team/users/{target_id}", {"role_id": role_id}),
        ("put", f"/team/users/{target_id}/roles", {"role_ids": [role_id]}),
    ]


ROUTE_IDS = ["create_user", "invite", "update_user", "set_user_roles"]


@pytest.mark.parametrize("route", range(4), ids=ROUTE_IDS)
async def test_setting_a_role_needs_the_roles_key(client, crm_tenant, route):
    team_mgr = await _role(client, [{"permission_key": k, "scope": "all"} for k in
                                    ("settings.team.read", "settings.team.manage")])
    reader = await _role(client, [{"permission_key": "crm.lead.read", "scope": "all"}])
    other_role = await _role(client, [{"permission_key": "settings.team.read", "scope": "all"}])
    mgr, _, _ = await _user_on(client, [team_mgr])
    victim, victim_id, _ = await _user_on(client, [reader])
    await victim.aclose()
    try:
        method, path, body = (await _set_role_routes(victim_id, other_role))[route]
        assert (await getattr(mgr, method)(path, json=body)).status_code == 403
    finally:
        await mgr.aclose()


@pytest.mark.parametrize("route", range(4), ids=ROUTE_IDS)
async def test_nobody_hands_out_more_than_they_hold(client, crm_tenant, route):
    admin, _, _ = await _admin(client)          # team + roles keys, no payroll, no CRM
    payroll = await _role(client, [{"permission_key": "payroll.salary.read", "scope": "all"}])
    modest = await _role(client, [{"permission_key": "settings.team.read", "scope": "all"}])
    other, other_id, _ = await _user_on(client, [modest])
    await other.aclose()
    try:
        method, path, body = (await _set_role_routes(other_id, payroll))[route]
        assert (await getattr(admin, method)(path, json=body)).status_code == 403
        method, path, body = (await _set_role_routes(other_id, modest))[route]
        assert (await getattr(admin, method)(path, json=body)).status_code in (200, 201, 204)
    finally:
        await admin.aclose()


async def test_roles_can_only_grant_what_their_editor_holds(client, crm_tenant):
    admin, _, _ = await _admin(client)
    try:
        r = await admin.post("/roles", json={"name": "Pay", "grants": [{"permission_key": "payroll.salary.read", "scope": "all"}]})
        assert r.status_code == 403
        ok = {"name": "Ok", "grants": [{"permission_key": "settings.team.read", "scope": "all"}]}
        rid = (await admin.post("/roles", json=ok)).json()["id"]
        r = await admin.put(f"/roles/{rid}/grants", json={"grants": [{"permission_key": "payroll.salary.read", "scope": "all"}]})
        assert r.status_code == 403
        payroll = await _role(client, [{"permission_key": "payroll.salary.read", "scope": "all"}])
        assert (await admin.put(f"/roles/{rid}/inherits", json={"role_ids": [payroll]})).status_code == 403
        assert (await admin.post(f"/roles/{payroll}/copy", json={"name": "Pay copy"})).status_code == 403
    finally:
        await admin.aclose()


async def test_nobody_changes_their_own_role(client, crm_tenant):
    me = (await client.get("/auth/me")).json()["user"]["id"]
    reader = await _role(client, [{"permission_key": "crm.lead.read", "scope": "all"}])
    assert (await client.patch(f"/team/users/{me}", json={"role_id": reader})).status_code == 409


async def test_a_disabled_owner_is_still_an_owner(client, crm_tenant):
    owner_role = next(r["id"] for r in (await client.get("/roles")).json() if r["template_key"] == "owner")
    deputy = (await client.post(f"/roles/{owner_role}/copy", json={"name": "Deputy 2"})).json()["id"]
    b, b_id, _ = await _user_on(client, [deputy])
    await b.aclose()
    assert (await client.patch(f"/team/users/{b_id}", json={"status": "disabled"})).status_code == 200
    admin, _, _ = await _admin(client)
    reader = await _role(client, [{"permission_key": "settings.team.read", "scope": "all"}])
    try:
        assert (await admin.patch(f"/team/users/{b_id}", json={"status": "active"})).status_code == 403
        assert (await admin.put(f"/team/users/{b_id}/roles", json={"role_ids": [reader]})).status_code == 403
    finally:
        await admin.aclose()

