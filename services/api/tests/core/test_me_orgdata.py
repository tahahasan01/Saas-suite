"""/auth/me carries the caller's branches and the tenant's branding (St04 #5,
D-03, D-12), so the shell can label the branch and theme itself without
extra round trips."""
from __future__ import annotations

import uuid

import asyncpg

from app.config import settings


async def test_me_lists_the_branches_the_caller_works_in(client, crm_tenant):
    me = (await client.get("/auth/me")).json()
    assert [(b["code"], b["is_default"]) for b in me["branches"]] == [("MAIN", True)]
    assert set(me["branches"][0]) == {"id", "code", "name", "is_default"}


async def test_me_follows_x_branch_ids(client, crm_tenant):
    conn = await asyncpg.connect(settings.database_url)
    try:
        other = await conn.fetchval(
            "insert into branches (tenant_id, code, name) values ($1, 'LHR2', 'Second') returning id",
            uuid.UUID(crm_tenant.tenant_id))
    finally:
        await conn.close()
    assert len((await client.get("/auth/me")).json()["branches"]) == 2
    me = (await client.get("/auth/me", headers={"X-Branch-Ids": str(other)})).json()
    assert [b["code"] for b in me["branches"]] == ["LHR2"]


async def test_me_carries_branding_tokens(client, crm_tenant):
    await client.put("/org/branding", json={"primary_color": "#1d4ed8"})
    b = (await client.get("/auth/me")).json()["branding"]
    assert b["primary_color"] == "#1d4ed8" and b["tokens"]["on_primary"] == "#ffffff"
    assert "logo_file_id" in b and "version" in b


async def test_signup_returns_them_too(client):
    from ..conftest import _drop
    r = await client.post("/auth/signup", json={
        "company_name": "Me Co", "industry_type": "retail", "sections": ["crm"], "name": "O",
        "email": f"me+{uuid.uuid4().hex[:8]}@example.com", "password": "Sup3rSecret!23"})
    body = r.json()
    try:
        assert body["branches"][0]["code"] == "MAIN"
        assert body["branding"]["tokens"]["primary"]
    finally:
        await _drop(body["tenant"]["id"])
