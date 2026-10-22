"""Assets issued to staff (wave A, H22, St10, 0087).

An asset register (type, tag or serial, value, condition) and its assignment
history: issued to an employee, returned with its condition. One open
assignment per asset at a time. Employees see their own assets through /me.
"""
from __future__ import annotations

import uuid

from httpx import ASGITransport, AsyncClient

from app.main import app
from app.security import SESSION_COOKIE

from ..core.test_rbac_v2 import _role, _user_on
from .test_employee_portal import _link_login


async def _asset(client, **extra) -> dict:
    body = {"name": "Dell Latitude 5420", "category": "laptop", "tag": f"LT-{uuid.uuid4().hex[:6]}",
            "serial_no": "SN123", "value_minor": 15_000_000, **extra}
    r = await client.post("/hrms/assets", json=body)
    assert r.status_code == 201, r.text
    return r.json()


async def test_an_asset_is_issued_returned_and_its_history_kept(client, tenant):
    a = await _asset(client)
    assert a["status"] == "available" and a["holder_name"] is None
    r = await client.post(f"/hrms/assets/{a['id']}/issue", json={"employee_id": tenant.employee_id, "note": "New joiner"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "issued" and r.json()["holder_id"] == tenant.employee_id
    # One holder at a time.
    assert (await client.post(f"/hrms/assets/{a['id']}/issue", json={"employee_id": tenant.employee_id})).status_code == 409

    r = await client.post(f"/hrms/assets/{a['id']}/return", json={"condition": "damaged", "note": "Cracked screen"})
    assert r.status_code == 200 and r.json()["status"] == "available" and r.json()["condition"] == "damaged"
    assert (await client.post(f"/hrms/assets/{a['id']}/return", json={})).status_code == 409   # nothing out

    history = (await client.get(f"/hrms/assets/{a['id']}/history")).json()
    assert len(history) == 1 and history[0]["returned_at"] is not None and history[0]["return_condition"] == "damaged"
    held = (await client.get(f"/hrms/employees/{tenant.employee_id}/assets")).json()
    assert held == []


async def test_an_employee_sees_only_their_own_assets(client, tenant):
    mine, other = await _asset(client), await _asset(client, name="Samsung A15", category="phone")
    employees = (await client.get("/hrms/employees")).json()
    await client.post(f"/hrms/assets/{mine['id']}/issue", json={"employee_id": tenant.employee_id})
    await client.post(f"/hrms/assets/{other['id']}/issue", json={"employee_id": employees[1]["id"]})
    token = await _link_login(tenant.tenant_id, tenant.employee_id, f"emp+{uuid.uuid4().hex[:8]}@example.com")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test",
                           cookies={SESSION_COOKIE: token}) as me:
        names = [x["name"] for x in (await me.get("/me/assets")).json()]
        assert names == ["Dell Latitude 5420"]
        assert (await me.get("/hrms/assets")).status_code == 403


async def test_tags_are_unique_and_input_is_checked(client, tenant):
    a = await _asset(client)
    assert (await client.post("/hrms/assets", json={"name": "Twin", "category": "laptop", "tag": a["tag"]})).status_code == 409
    assert (await client.post("/hrms/assets", json={"name": "X", "category": "spaceship"})).status_code == 422
    assert (await client.post(f"/hrms/assets/{a['id']}/issue", json={"employee_id": str(uuid.uuid4())})).status_code == 404
    r = await client.patch(f"/hrms/assets/{a['id']}", json={"status": "retired"})
    assert r.status_code == 200 and r.json()["status"] == "retired"
    assert (await client.post(f"/hrms/assets/{a['id']}/issue", json={"employee_id": tenant.employee_id})).status_code == 409


async def test_reading_needs_the_asset_key_and_value_is_hidden_without_manage(client, tenant):
    await _asset(client)
    rid = await _role(client, [{"permission_key": "hrms.asset.read", "scope": "all"}])
    mate, _, _ = await _user_on(client, [rid])
    try:
        rows = (await mate.get("/hrms/assets")).json()
        assert rows and rows[0]["value_minor"] is None              # value is for asset managers
        assert (await mate.post("/hrms/assets", json={"name": "No", "category": "other"})).status_code == 403
    finally:
        await mate.aclose()
