"""Adding a branch or warehouse (wave B, TRD `POST /branches`, 2026-10-24).

Stock per branch (0091) and transfers (0092) need more than the one branch
signup makes, and the app had no way to add one. A manager with
settings.branches.manage adds it; codes are unique within the company; it
belongs to the caller's company only.
"""
from __future__ import annotations

from ..core.test_rbac_v2 import _role, _user_on


async def test_a_manager_adds_a_warehouse(client, pos_tenant):
    r = await client.post("/org/branches", json={"code": "WH1", "name": "Main warehouse", "address": "Sundar estate"})
    assert r.status_code == 201, r.text
    wh = r.json()
    assert wh["code"] == "WH1" and wh["is_default"] is False and wh["active"] is True
    assert "WH1" in [b["code"] for b in (await client.get("/org/branches")).json()]
    assert (await client.post("/org/branches", json={"code": "WH1", "name": "Again"})).status_code == 409
    assert (await client.post("/org/branches", json={"code": "wh 1", "name": "Bad code"})).status_code == 422
    # It can hold stock straight away.
    product = (await client.get("/pos/products")).json()[0]
    r = await client.post("/pos/stock/adjustments", json={"product_id": product["id"], "qty_delta": 3,
                                                          "reason": "count", "branch_id": wh["id"]})
    assert r.status_code == 201, r.text


async def test_adding_a_branch_needs_the_manage_key(client, pos_tenant):
    rid = await _role(client, [{"permission_key": "settings.branches.read", "scope": "all"}])
    mate, _, _ = await _user_on(client, [rid])
    try:
        assert (await mate.post("/org/branches", json={"code": "WH2", "name": "Nope"})).status_code == 403
    finally:
        await mate.aclose()


async def test_branch_codes_are_per_company(client):
    """Two companies can both have a WH1; neither sees the other's."""
    from tests.conftest import _drop, _signup
    a = await _signup(client, ["pos"])
    try:
        mine = (await client.post("/org/branches", json={"code": "WH1", "name": "A warehouse"})).json()
        b = await _signup(client, ["pos"])                      # the client is now company B
        try:
            r = await client.post("/org/branches", json={"code": "WH1", "name": "B warehouse"})
            assert r.status_code == 201, r.text
            assert mine["id"] not in [x["id"] for x in (await client.get("/org/branches")).json()]
            # B can't put stock in A's warehouse.
            product = (await client.get("/pos/products")).json()[0]
            r = await client.post("/pos/stock/adjustments", json={"product_id": product["id"], "qty_delta": 1,
                                                                  "reason": "count", "branch_id": mine["id"]})
            assert r.status_code == 404
        finally:
            await _drop(b)
    finally:
        await _drop(a)
