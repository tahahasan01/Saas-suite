"""Notice board and policy acknowledgement (wave A, H18/H19, St10, 0085).

HR posts notices for everyone, a department or a location. A notice that
requires acknowledgement is a policy: each employee in its audience confirms
it once, and HR sees who has and who hasn't. Acknowledgements are append-only.
"""
from __future__ import annotations

import uuid

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.security import SESSION_COOKIE

from ..core.test_files import PDF
from ..core.test_rbac_v2 import _role, _user_on
from .test_employee_portal import _link_login


@pytest_asyncio.fixture
async def staff(client, tenant):
    """Two employees with their own logins: `me` (the tenant's first sample
    employee) and `other` (the second one). `client` stays HR."""
    employees = (await client.get("/hrms/employees")).json()
    clients = []
    for emp in employees[:2]:
        token = await _link_login(tenant.tenant_id, emp["id"], f"emp+{uuid.uuid4().hex[:8]}@example.com")
        clients.append(AsyncClient(transport=ASGITransport(app=app), base_url="http://test",
                                   cookies={SESSION_COOKIE: token}))
    yield {"me": clients[0], "other": clients[1], "me_id": employees[0]["id"], "other_id": employees[1]["id"]}
    for c in clients:
        await c.aclose()


async def test_a_notice_for_everyone_reaches_every_employee(client, staff):
    r = await client.post("/hrms/notices", json={"title": "Office closed Friday", "body": "For Kashmir Day."})
    assert r.status_code == 201, r.text
    assert r.json()["requires_ack"] is False and r.json()["audience"] == "all"
    for who in ("me", "other"):
        titles = [n["title"] for n in (await staff[who].get("/me/notices")).json()]
        assert "Office closed Friday" in titles


async def test_a_policy_is_acknowledged_once_and_hr_sees_who_has_not(client, staff):
    r = await client.post("/hrms/notices", json={"title": "Attendance policy", "body": "Be on time.",
                                                 "requires_ack": True})
    notice = r.json()
    mine = next(n for n in (await staff["me"].get("/me/notices")).json() if n["id"] == notice["id"])
    assert mine["requires_ack"] is True and mine["acknowledged_at"] is None

    first = await staff["me"].post(f"/me/notices/{notice['id']}/acknowledge")
    assert first.status_code == 200, first.text
    again = await staff["me"].post(f"/me/notices/{notice['id']}/acknowledge")
    assert again.json()["acknowledged_at"] == first.json()["acknowledged_at"]   # once; never moved

    acks = {a["employee_id"]: a for a in (await client.get(f"/hrms/notices/{notice['id']}/acknowledgements")).json()}
    assert acks[staff["me_id"]]["acknowledged_at"] is not None
    assert acks[staff["other_id"]]["acknowledged_at"] is None
    board = next(n for n in (await client.get("/hrms/notices")).json() if n["id"] == notice["id"])
    assert board["acknowledged"] == 1 and board["audience_size"] >= 2

    # The employee was told to read it.
    notes = (await staff["other"].get("/notifications")).json()["items"]
    assert any("Attendance policy" in n["title"] and n["link"] == "/me/notices" for n in notes)


async def test_a_department_notice_reaches_only_that_department(client, staff):
    dept = (await client.post("/hrms/departments", json={"name": f"Sales {uuid.uuid4().hex[:4]}"})).json()
    await client.patch(f"/hrms/employees/{staff['me_id']}/job", json={"department_id": dept["id"]})
    r = await client.post("/hrms/notices", json={"title": "Sales targets", "audience": "department",
                                                 "department_id": dept["id"], "requires_ack": True})
    assert r.status_code == 201, r.text
    nid = r.json()["id"]
    assert nid in [n["id"] for n in (await staff["me"].get("/me/notices")).json()]
    assert nid not in [n["id"] for n in (await staff["other"].get("/me/notices")).json()]
    assert (await staff["other"].post(f"/me/notices/{nid}/acknowledge")).status_code == 404
    acks = (await client.get(f"/hrms/notices/{nid}/acknowledgements")).json()
    assert [a["employee_id"] for a in acks] == [staff["me_id"]]


async def test_archiving_takes_a_notice_off_the_board(client, staff):
    nid = (await client.post("/hrms/notices", json={"title": "Old news"})).json()["id"]
    r = await client.patch(f"/hrms/notices/{nid}", json={"archived": True})
    assert r.status_code == 200 and r.json()["archived_at"] is not None
    assert nid not in [n["id"] for n in (await staff["me"].get("/me/notices")).json()]
    assert nid in [n["id"] for n in (await client.get("/hrms/notices?archived=true")).json()]


async def test_the_attachment_opens_for_the_audience_only(client, staff):
    up = await client.post("/files", params={"name": "policy.pdf"}, content=PDF,
                           headers={"Content-Type": "application/octet-stream"})
    file_id = up.json()["id"]
    dept = (await client.post("/hrms/departments", json={"name": f"Ops {uuid.uuid4().hex[:4]}"})).json()
    await client.patch(f"/hrms/employees/{staff['me_id']}/job", json={"department_id": dept["id"]})
    r = await client.post("/hrms/notices", json={"title": "Ops policy", "audience": "department",
                                                 "department_id": dept["id"], "file_id": file_id})
    assert r.status_code == 201, r.text
    assert (await staff["me"].get(f"/files/{file_id}")).status_code == 302
    assert (await staff["other"].get(f"/files/{file_id}")).status_code == 404


async def test_input_and_permissions(client, staff):
    assert (await client.post("/hrms/notices", json={"title": "x", "audience": "department"})).status_code == 422
    assert (await client.post("/hrms/notices", json={"title": "x", "audience": "everyone"})).status_code == 422
    r = await client.post("/hrms/notices", json={"title": "x", "audience": "department",
                                                 "department_id": str(uuid.uuid4())})
    assert r.status_code == 404
    # Employees read the board through /me, never the HR endpoints.
    assert (await staff["me"].get("/hrms/notices")).status_code == 403
    assert (await staff["me"].post("/hrms/notices", json={"title": "Me"})).status_code == 403
    reader = await _role(client, [{"permission_key": "hrms.notice.read", "scope": "all"}])
    mate, _, _ = await _user_on(client, [reader])
    try:
        assert (await mate.get("/hrms/notices")).status_code == 200
        assert (await mate.post("/hrms/notices", json={"title": "No"})).status_code == 403
    finally:
        await mate.aclose()
