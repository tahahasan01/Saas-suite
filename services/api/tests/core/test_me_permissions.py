"""P1-13 / D-04: the web gates controls on what the server says the caller may
do, never on a role name. /auth/me returns a permission map (key -> scope)
computed from the same grants the API guards check, plus the tenant's locale
settings (timezone, locale)."""
from __future__ import annotations

import re
import uuid

import asyncpg
import pytest
from httpx import ASGITransport, AsyncClient

from app import rbac
from app.config import settings
from app.main import app
from app.security import SESSION_COOKIE

PASSWORD = "Sup3rSecret!23"
KEY = re.compile(r"^[a-z_]+\.[a-z_]+\.[a-z_]+$")


async def _member(owner_client, permissions: dict[str, list[str]]) -> tuple[AsyncClient, str]:
    """A teammate on a fresh role with exactly `permissions`, logged in."""
    r = await owner_client.post("/team/roles", json={
        "name": f"Role {uuid.uuid4().hex[:6]}", "permissions": permissions})
    r.raise_for_status()
    email = f"mate+{uuid.uuid4().hex[:10]}@example.com"
    r = await owner_client.post("/team/users", json={
        "name": "Mate", "email": email, "password": PASSWORD, "role_id": r.json()["id"]})
    r.raise_for_status()
    c = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    r = await c.post("/auth/login", json={"email": email, "password": PASSWORD})
    r.raise_for_status()
    c.cookies.set(SESSION_COOKIE, r.cookies[SESSION_COOKIE])
    return c, r.json()["id"]


async def _owner_sql(sql: str, *args) -> None:
    owner = await asyncpg.connect(settings.database_url)
    try:
        await owner.execute(sql, *args)
    finally:
        await owner.close()


# ── The registry ─────────────────────────────────────────────────────────────
def test_every_key_is_module_resource_action_under_its_module():
    assert rbac.PERMISSIONS, "the registry is empty"
    for key, p in rbac.PERMISSIONS.items():
        assert KEY.match(key), key
        assert key.split(".")[0] == p.module, key
        assert key in rbac.MODULE_KEYS[p.module]


def test_registering_a_key_twice_or_outside_its_module_fails():
    with pytest.raises(ValueError):
        rbac.register("crm", {"crm.lead.read": ("crm", "read")})
    with pytest.raises(ValueError):
        rbac.register("crm", {"pos.sale.read": ("pos", "read")})
    with pytest.raises(ValueError):
        rbac.register("crm", {"crm.lead": ("crm", "read")})


def test_a_guard_on_an_undeclared_key_fails_at_import_time():
    """A typo in a router guard must stop the app booting, not 403 forever."""
    with pytest.raises(KeyError):
        rbac.perm("crm.lead.teleport")


# ── /auth/me ─────────────────────────────────────────────────────────────────
async def test_owner_holds_every_key_of_the_enabled_modules(client, crm_tenant):
    perms = (await client.get("/auth/me")).json()["permissions"]
    assert perms["invoicing.invoice.approve"] == "all"
    assert perms["crm.lead.read"] == "all"
    assert perms["settings.team.manage"] == "all"
    # POS is not enabled for this tenant, so its keys are not granted: the
    # API would answer 403 "Section 'pos' is not enabled".
    assert "pos.sale.create" not in perms
    assert set(perms.values()) == {"all"}  # legacy grants carry no narrower scope


async def test_signup_returns_the_same_bootstrap_as_me(client):
    r = await client.post("/auth/signup", json={
        "company_name": "Perm Co", "industry_type": "retail", "sections": ["crm"],
        "name": "Owner", "email": f"test+{uuid.uuid4().hex[:10]}@example.com",
        "password": PASSWORD, "sample_data": False})
    r.raise_for_status()
    body = r.json()
    try:
        assert body["permissions"]["invoicing.invoice.approve"] == "all"
        assert body["locale"]["timezone"] == "Asia/Karachi"
    finally:
        await _owner_sql("delete from tenants where id=$1", uuid.UUID(body["tenant"]["id"]))


async def test_a_read_only_role_gets_read_keys_and_the_api_agrees(client, crm_tenant):
    mate, _ = await _member(client, {"crm": ["read"]})
    try:
        perms = (await mate.get("/auth/me")).json()["permissions"]
        assert "crm.lead.read" in perms
        assert "crm.lead.create" not in perms
        assert "invoicing.invoice.approve" not in perms
        assert "settings.team.manage" not in perms
        # The map mirrors the guards: what it omits, the API refuses.
        assert (await mate.get("/crm/leads")).status_code == 200
        assert (await mate.post(f"/invoices/{uuid.uuid4()}/approve")).status_code == 403
    finally:
        await mate.aclose()


async def test_invoice_approval_follows_the_permission_not_the_owner_role(client, crm_tenant):
    """A non-Owner role holding the accounts grant is an approver."""
    mate, _ = await _member(client, {"crm": ["read", "write"], "accounts": ["admin"]})
    try:
        perms = (await mate.get("/auth/me")).json()["permissions"]
        assert perms["invoicing.invoice.approve"] == "all"
        contact = (await client.post("/contacts", json={"name": "Approver Co", "force": True})).json()
        inv = await client.post("/invoices", json={"contact_id": contact["id"], "submit": True,
                                                   "lines": [{"description": "Services", "qty": 1, "unit_price_minor": 100_000}]})
        inv.raise_for_status()
        r = await mate.post(f"/invoices/{inv.json()['id']}/approve")
        assert r.status_code == 200 and r.json()["status"] == "issued"
    finally:
        await mate.aclose()


async def test_me_carries_the_tenant_locale_settings(client, crm_tenant):
    me = (await client.get("/auth/me")).json()
    assert me["locale"] == {"locale": "en", "dir": "ltr", "timezone": "Asia/Karachi",
                            "currency": "PKR"}
    await _owner_sql("update tenants set timezone='Asia/Dubai' where id=$1",
                     uuid.UUID(crm_tenant.tenant_id))
    await _owner_sql("update users set locale='ur' where id=$1", uuid.UUID(me["user"]["id"]))
    me = (await client.get("/auth/me")).json()
    assert me["locale"]["timezone"] == "Asia/Dubai"
    assert me["locale"]["locale"] == "ur" and me["locale"]["dir"] == "rtl"
