"""D-05: every session carries the user's auth_epoch from login. A password
reset or change, a deactivation, and a role change or removal bump the epoch,
so each session issued before the event gets 401 on its very next request,
while a fresh login works at once. Status checks alone don't cover this: a
user disabled and re-enabled, or moved to a smaller role, would otherwise keep
every old session (gate S5)."""
from __future__ import annotations

import uuid

import asyncpg
from httpx import ASGITransport, AsyncClient

from app import tokens
from app.config import settings
from app.main import app
from app.security import SESSION_COOKIE

PASSWORD = "Sup3rSecret!23"
NEW_PASSWORD = "N3wSecret!456"


def _anon() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _login(email: str, password: str = PASSWORD) -> AsyncClient:
    c = _anon()
    r = await c.post("/auth/login", json={"email": email, "password": password})
    r.raise_for_status()
    c.cookies.set(SESSION_COOKIE, r.cookies[SESSION_COOKIE])
    return c


async def _role(owner_client, name: str, permissions: dict[str, list[str]]) -> str:
    r = await owner_client.post("/team/roles", json={"name": name, "permissions": permissions})
    r.raise_for_status()
    return r.json()["id"]


async def _teammate(owner_client, role_id: str) -> tuple[str, str]:
    email = f"mate+{uuid.uuid4().hex[:10]}@example.com"
    r = await owner_client.post("/team/users", json={
        "name": "Mate", "email": email, "password": PASSWORD, "role_id": role_id})
    r.raise_for_status()
    return r.json()["id"], email


async def _epoch(user_id: str) -> int:
    owner = await asyncpg.connect(settings.database_url)
    try:
        return await owner.fetchval("select auth_epoch from users where id=$1", uuid.UUID(user_id))
    finally:
        await owner.close()


async def _assert_fresh_login_works(email: str, password: str = PASSWORD) -> dict:
    fresh = await _login(email, password)
    try:
        r = await fresh.get("/auth/me")
        assert r.status_code == 200
        return r.json()
    finally:
        await fresh.aclose()


async def test_a_session_carries_the_epoch_it_was_issued_under(client, crm_tenant):
    """The baseline: an untouched session keeps working across requests."""
    assert (await client.get("/auth/me")).status_code == 200
    assert (await client.get("/auth/me")).status_code == 200


async def test_password_reset_revokes_old_sessions(client, crm_tenant):
    me = (await client.get("/auth/me")).json()
    before = await _epoch(me["user"]["id"])
    token = await tokens.create("reset", email=me["user"]["email"],
                                user_id=me["user"]["id"], ttl_hours=1)
    async with _anon() as anon:
        r = await anon.post("/auth/reset", json={"token": token, "password": NEW_PASSWORD})
        assert r.status_code == 204
    assert await _epoch(me["user"]["id"]) == before + 1
    assert (await client.get("/auth/me")).status_code == 401
    await _assert_fresh_login_works(me["user"]["email"], NEW_PASSWORD)


async def test_password_change_revokes_other_sessions_and_reissues_this_one(client, crm_tenant):
    email = (await client.get("/auth/me")).json()["user"]["email"]
    this = await _login(email)
    other = await _login(email)          # the same owner on a second device
    old_cookie = this.cookies.get(SESSION_COOKIE, domain="")
    try:
        r = await this.post("/auth/password",
                            json={"current_password": PASSWORD, "new_password": NEW_PASSWORD})
        assert r.status_code == 204
        # The device that changed the password stays signed in on a new cookie...
        new_cookie = r.cookies[SESSION_COOKIE]
        assert new_cookie != old_cookie
        this.cookies.set(SESSION_COOKIE, new_cookie)
        assert (await this.get("/auth/me")).status_code == 200
        # ...while the other device, and the replaced cookie, are dead.
        assert (await other.get("/auth/me")).status_code == 401
        async with _anon() as stale:
            stale.cookies.set(SESSION_COOKIE, old_cookie)
            assert (await stale.get("/auth/me")).status_code == 401
    finally:
        await this.aclose()
        await other.aclose()
    await _assert_fresh_login_works(email, NEW_PASSWORD)


async def test_password_change_needs_the_current_password(client, crm_tenant):
    r = await client.post("/auth/password",
                          json={"current_password": "not-my-password", "new_password": NEW_PASSWORD})
    assert r.status_code == 400
    assert (await client.get("/auth/me")).status_code == 200  # nothing was revoked


async def test_deactivation_revokes_sessions_even_after_reactivation(client, crm_tenant):
    role_id = await _role(client, "Sales", {"crm": ["read", "write"]})
    user_id, email = await _teammate(client, role_id)
    mate = await _login(email)
    try:
        assert (await mate.get("/auth/me")).status_code == 200
        (await client.patch(f"/team/users/{user_id}", json={"status": "disabled"})).raise_for_status()
        (await client.patch(f"/team/users/{user_id}", json={"status": "active"})).raise_for_status()
        # Re-enabling the account must not resurrect the sessions it had.
        assert (await mate.get("/auth/me")).status_code == 401
    finally:
        await mate.aclose()
    await _assert_fresh_login_works(email)


async def test_role_change_revokes_sessions(client, crm_tenant):
    sales = await _role(client, "Sales", {"crm": ["read", "write"]})
    viewer = await _role(client, "Viewer", {"crm": ["read"]})
    user_id, email = await _teammate(client, sales)
    mate = await _login(email)
    try:
        assert (await mate.get("/auth/me")).status_code == 200
        (await client.patch(f"/team/users/{user_id}", json={"role_id": viewer})).raise_for_status()
        assert (await mate.get("/auth/me")).status_code == 401
    finally:
        await mate.aclose()
    me = await _assert_fresh_login_works(email)
    assert me["user"]["role"] == "Viewer"


async def test_role_removal_revokes_sessions(client, crm_tenant):
    sales = await _role(client, "Sales", {"crm": ["read", "write"]})
    user_id, email = await _teammate(client, sales)
    mate = await _login(email)
    try:
        assert (await mate.get("/auth/me")).status_code == 200
        r = await client.patch(f"/team/users/{user_id}", json={"role_id": None})
        r.raise_for_status()
        assert r.json()["role"] is None
        assert (await mate.get("/auth/me")).status_code == 401
    finally:
        await mate.aclose()
    me = await _assert_fresh_login_works(email)
    assert me["user"]["role"] is None


async def test_an_edit_that_changes_nothing_keeps_sessions(client, crm_tenant):
    """Only real changes revoke: re-saving a user with the same role and
    status must not sign them out everywhere."""
    sales = await _role(client, "Sales", {"crm": ["read", "write"]})
    user_id, email = await _teammate(client, sales)
    mate = await _login(email)
    try:
        r = await client.patch(f"/team/users/{user_id}", json={"role_id": sales, "status": "active"})
        r.raise_for_status()
        assert (await mate.get("/auth/me")).status_code == 200
    finally:
        await mate.aclose()
