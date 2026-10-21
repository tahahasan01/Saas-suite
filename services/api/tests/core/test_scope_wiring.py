"""QA-A06: scope `own` vs `team` vs `all` on CRM leads and POS sales, through
the real endpoints. The list and a direct GET respect the scope; a write
outside it is a 404."""
from __future__ import annotations

import uuid

import asyncpg
from fastapi.routing import APIRoute

from app import scopes
from app.config import settings
from app.main import app

from .test_rbac_v2 import _role, _user_on


async def _owner(sql: str, *args):
    conn = await asyncpg.connect(settings.database_url)
    try:
        return await conn.fetch(sql, *args)
    finally:
        await conn.close()


async def _lead_for(tenant_id: str, owner_id: str, name: str) -> str:
    tid = uuid.UUID(tenant_id)
    p = (await _owner("select id, (select id from crm_stages s where s.pipeline_id=p.id order by position limit 1) as st "
                      "from crm_pipelines p where tenant_id=$1 and is_default", tid))[0]
    return str((await _owner(
        "insert into crm_leads (tenant_id, pipeline_id, stage_id, name, owner_id) values ($1,$2,$3,$4,$5) returning id",
        tid, p["id"], p["st"], name, uuid.UUID(owner_id)))[0]["id"])


async def test_lead_scopes_on_list_get_and_patch(client, crm_tenant):
    own = await _role(client, [{"permission_key": "crm.lead.read", "scope": "own"},
                               {"permission_key": "crm.lead.update", "scope": "own"}])
    team = await _role(client, [{"permission_key": "crm.lead.read", "scope": "team"},
                                {"permission_key": "crm.lead.update", "scope": "team"}])
    alice, alice_id, _ = await _user_on(client, [own])
    bob, bob_id, _ = await _user_on(client, [team])
    try:
        mine = await _lead_for(crm_tenant.tenant_id, alice_id, "Alice's lead")
        bobs = await _lead_for(crm_tenant.tenant_id, bob_id, "Bob's lead")
        everyone = len((await client.get("/crm/leads")).json())

        # own: only Alice's own lead, anywhere she looks.
        names = {lead["name"] for lead in (await alice.get("/crm/leads")).json()}
        assert names == {"Alice's lead"}
        assert (await alice.get(f"/crm/leads/{mine}")).status_code == 200
        assert (await alice.get(f"/crm/leads/{bobs}")).status_code == 404
        assert (await alice.patch(f"/crm/leads/{bobs}", json={"company": "x"})).status_code == 404
        assert (await alice.patch(f"/crm/leads/{mine}", json={"company": "x"})).status_code == 200

        # team: Bob sees Alice's lead once they share a team.
        assert {lead["name"] for lead in (await bob.get("/crm/leads")).json()} == {"Bob's lead"}
        t = (await client.post("/teams", json={"name": "Desk"})).json()["id"]
        await client.put(f"/teams/{t}/members", json={"user_ids": [alice_id, bob_id]})
        assert {lead["name"] for lead in (await bob.get("/crm/leads")).json()} == {"Bob's lead", "Alice's lead"}
        assert (await bob.patch(f"/crm/leads/{mine}", json={"company": "y"})).status_code == 200
        # ... but Alice, on `own`, still only sees her own.
        assert (await alice.get(f"/crm/leads/{bobs}")).status_code == 404

        # all: the owner is unaffected.
        assert len((await client.get("/crm/leads")).json()) == everyone
    finally:
        await alice.aclose()
        await bob.aclose()


async def test_every_lead_route_hides_leads_outside_scope(client, crm_tenant):
    """CRM v2 and contacts added lead routes after scopes landed: on `own`,
    each one treats someone else's lead as not found."""
    own = await _role(client, [{"permission_key": "crm.lead.read", "scope": "own"},
                               {"permission_key": "crm.lead.update", "scope": "own"}])
    alice, alice_id, _ = await _user_on(client, [own])
    try:
        bob_id = (await client.get("/auth/me")).json()["user"]["id"]
        mine = await _lead_for(crm_tenant.tenant_id, alice_id, "Alice's lead")
        bobs = await _lead_for(crm_tenant.tenant_id, bob_id, "Bob's lead")
        activity_type = (await client.get("/activity-types")).json()[0]["id"]
        r = await client.post("/activities", json={"entity_type": "lead", "entity_id": bobs, "type_id": activity_type,
                                                   "due_date": "2027-04-05", "assigned_to": alice_id})
        assert r.status_code == 201, r.text
        item = (await _owner("insert into contact_review_items (tenant_id, lead_id, reason) "
                             "values ($1, $2, 'shared_phone') returning id",
                             uuid.UUID(crm_tenant.tenant_id), uuid.UUID(bobs)))[0]["id"]

        for method, path, body in [
            ("get", f"/crm/leads/{bobs}/timeline", None),
            ("get", f"/crm/leads/{bobs}/contact", None),
            ("post", f"/crm/leads/{bobs}/won", None),
            ("post", f"/crm/leads/{bobs}/lost", {"lost_note": "x"}),
            ("post", f"/crm/leads/{bobs}/restore", None),
            ("post", f"/crm/leads/{bobs}/notes", {"body": "x"}),
            ("post", f"/contacts/review/{item}/dismiss", None),
        ]:
            r = await alice.request(method.upper(), path, json=body)
            assert r.status_code == 404, (path, r.status_code, r.text)
        # The activity on Bob's lead is assigned to Alice, but the lead is out of her scope.
        assert (await alice.get("/activities", params={"entity_type": "lead", "entity_id": bobs})).json() == []
        assert (await alice.get("/activities", params={"assigned": "me", "state": "planned"})).json() == []

        # Her own lead still works end to end.
        assert (await alice.get(f"/crm/leads/{mine}/timeline")).status_code == 200
        assert (await alice.post(f"/crm/leads/{mine}/notes", json={"body": "called"})).status_code == 201
        assert (await alice.post(f"/crm/leads/{mine}/won")).status_code == 200
        # And the owner, on `all`, is unaffected.
        assert (await client.get(f"/crm/leads/{bobs}/timeline")).status_code == 200
    finally:
        await alice.aclose()


async def test_sale_scope_on_lookup_and_returns(client, pos_tenant):
    own = await _role(client, [{"permission_key": "pos.sale.read", "scope": "own"},
                               {"permission_key": "pos.sale.refund", "scope": "own"}])
    cashier, cid, _ = await _user_on(client, [own])
    try:
        product = (await client.get("/pos/products")).json()[0]
        sale = {"items": [{"product_id": product["id"], "qty": 1}], "payment_method": "cash",
                "paid_minor": 10_000_000}
        owners = (await client.post("/pos/sales", json=sale)).json()["id"]
        theirs_id = (await client.post("/pos/sales", json=sale)).json()["id"]
        await _owner("update pos_sales set cashier_id=$1 where id=$2", uuid.UUID(cid), uuid.UUID(theirs_id))

        assert (await cashier.get(f"/pos/sales/{theirs_id}")).status_code == 200
        assert (await cashier.get(f"/pos/sales/{owners}")).status_code == 404
        detail = (await client.get(f"/pos/sales/{owners}")).json()
        line = detail["returnable"][0]["sale_item_id"]
        r = await cashier.post(f"/pos/sales/{owners}/returns",
                               json={"items": [{"sale_item_id": line, "qty": 1}], "reason": "x"})
        assert r.status_code == 404
        assert (await client.get(f"/pos/sales/{theirs_id}")).status_code == 200    # owner: all
    finally:
        await cashier.aclose()


def test_every_route_guarded_by_a_narrowable_key_applies_the_scope():
    """A key accepts own/team/branch only if EVERY route it guards narrows the
    query (scopes.WIRED); a new route guarded by such a key fails here until
    it applies scopes.where() and is listed."""
    guarded: dict[str, set[str]] = {}
    # FastAPI keeps included routers as wrappers; their routes live on the original router.
    routes = [r for top in app.routes
              for r in (getattr(getattr(top, "original_router", None), "routes", None) or [top])]
    for route in routes:
        if not isinstance(route, APIRoute):
            continue
        for dep in route.dependant.dependencies:
            key = getattr(dep.call, "perm_key", None)
            if key:
                for method in route.methods:
                    guarded.setdefault(key, set()).add(f"{method} {route.path}")
    assert scopes.WIRED
    for key, routes in scopes.WIRED.items():
        assert scopes.is_scoped(key), key
        assert guarded.get(key, set()) == set(routes) | set(scopes.EXEMPT.get(key, ())), (key, guarded.get(key))
    assert set(scopes.EXEMPT) <= set(scopes.WIRED)
