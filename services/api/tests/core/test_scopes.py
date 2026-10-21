"""Record scopes own < team < branch < all (D-04, St04 #10, app/scopes.py).

The predicate is proven here against real rows under RLS: who owns a record,
who shares a team, who leads it. A write outside scope finds nothing and is a
404, never a 403 that would confirm the record exists.
"""
from __future__ import annotations

import uuid

import asyncpg
import pytest
from fastapi import HTTPException

from app import context, db, scopes
from app.config import settings

from .test_me_permissions import PASSWORD


async def _owner(sql: str, *args):
    conn = await asyncpg.connect(settings.database_url)
    try:
        return await conn.fetch(sql, *args)
    finally:
        await conn.close()


# ── The predicate ───────────────────────────────────────────────────────────
def test_scoped_resources_come_from_the_manifests():
    assert scopes.OWNERSHIP["crm.lead"] == "owner_id"
    assert scopes.OWNERSHIP["pos.sale"] == "cashier_id"
    assert scopes.is_scoped("crm.lead.read") and not scopes.is_scoped("settings.team.manage")


def test_not_held_matches_nothing_and_wide_scopes_match_everything():
    assert scopes.where("crm.lead", None, "l") == "false"
    assert scopes.where("crm.lead", "all", "l") == "true"
    assert scopes.where("crm.lead", "branch", "l") == "true"   # branch RLS narrows it
    assert "l.owner_id" in scopes.where("crm.lead", "own", "l")


def test_only_code_reaches_the_sql():
    with pytest.raises(ValueError):
        scopes.where("crm.secrets", "own", "l")
    with pytest.raises(ValueError):
        scopes.where("crm.lead", "own", "l; drop table users")


# ── Against real rows ───────────────────────────────────────────────────────
async def _users(client, n: int) -> list[str]:
    role = (await client.post("/team/roles", json={"name": f"S{uuid.uuid4().hex[:5]}",
                                                   "permissions": {"crm": ["read", "write"]}})).json()["id"]
    ids = []
    for _ in range(n):
        r = await client.post("/team/users", json={"name": "U", "email": f"s+{uuid.uuid4().hex[:10]}@example.com",
                                                   "password": PASSWORD, "role_id": role})
        ids.append(r.json()["id"])
    return ids


async def _visible(tenant_id: str, actor: str, scope) -> set[str]:
    context.set_actor(actor)
    async with db.tenant_conn(tenant_id) as conn:
        rows = await conn.fetch(f"select l.name from crm_leads l where {scopes.where('crm.lead', scope, 'l')}")
    return {r["name"] for r in rows}


@pytest.fixture
async def world(client, crm_tenant):
    """me, mate (same team) and stranger, each owning one lead; a team of me
    and mate; and a team led by `lead` that only `stranger` belongs to."""
    tid = uuid.UUID(crm_tenant.tenant_id)
    me = (await client.get("/auth/me")).json()["user"]["id"]
    mate, stranger, lead = await _users(client, 3)
    await _owner("delete from crm_leads where tenant_id=$1", tid)
    pipe = (await _owner("select id, (select id from crm_stages s where s.pipeline_id=p.id limit 1) as stage "
                         "from crm_pipelines p where tenant_id=$1 limit 1", tid))[0]
    for name, owner in (("mine", me), ("mates", mate), ("strangers", stranger)):
        await _owner("insert into crm_leads (tenant_id, pipeline_id, stage_id, name, owner_id) values ($1,$2,$3,$4,$5)",
                     tid, pipe["id"], pipe["stage"], name, uuid.UUID(owner))
    t1 = (await client.post("/teams", json={"name": "Counter"})).json()["id"]
    await client.put(f"/teams/{t1}/members", json={"user_ids": [me, mate]})
    t2 = (await client.post("/teams", json={"name": "Field", "lead_user_id": lead})).json()["id"]
    await client.put(f"/teams/{t2}/members", json={"user_ids": [stranger]})
    return {"tenant": crm_tenant.tenant_id, "me": me, "mate": mate, "stranger": stranger, "lead": lead}


async def test_reads_narrow_by_scope(world):
    t = world["tenant"]
    assert await _visible(t, world["me"], "own") == {"mine"}
    assert await _visible(t, world["me"], "team") == {"mine", "mates"}
    assert await _visible(t, world["me"], "all") == {"mine", "mates", "strangers"}
    assert await _visible(t, world["me"], None) == set()
    # A team lead sees the team's records without being a member.
    assert await _visible(t, world["lead"], "team") == {"strangers"}
    assert await _visible(t, world["stranger"], "team") == {"strangers"}


async def test_a_write_outside_scope_is_a_404(world):
    context.set_actor(world["me"])
    async with db.tenant_conn(world["tenant"]) as conn:
        theirs = await conn.fetchval("select id from crm_leads where name='strangers'")
        row = await conn.fetchrow(
            f"update crm_leads l set company='x' where l.id=$1 and {scopes.where('crm.lead', 'team', 'l')} returning l.id",
            theirs)
        with pytest.raises(HTTPException) as e:
            scopes.found_or_404(row, "Lead")
        assert e.value.status_code == 404
        ours = await conn.fetchval("select id from crm_leads where name='mates'")
        row = await conn.fetchrow(
            f"update crm_leads l set company='x' where l.id=$1 and {scopes.where('crm.lead', 'team', 'l')} returning l.id",
            ours)
        assert scopes.found_or_404(row, "Lead")["id"] == ours
