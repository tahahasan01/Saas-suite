"""Input validation (audit P1-5, gate S1/S12).

Foreign keys are checked by the database *without* RLS, so an id belonging to
another tenant passed every insert: a user could be given another company's
role, a lead put in another company's pipeline. Every referenced id must be
visible to the caller's own tenant. Malformed ids and unknown enum values are
422s, not 500s.
"""
from __future__ import annotations

import uuid

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app
from tests.conftest import _drop, _signup


@pytest_asyncio.fixture
async def other():
    """A second, unrelated tenant with CRM, POS and HRMS — its ids are the bait."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        tenant_id = await _signup(c, ["crm", "pos", "hrms"])
        pipeline = (await c.get("/crm/pipelines")).json()[0]
        supplier = (await c.post("/pos/suppliers", json={"name": "Their Supplier"})).json()
        ids = {
            "role_id": (await c.get("/team/roles")).json()[0]["id"],
            "user_id": (await c.get("/auth/me")).json()["user"]["id"],
            "pipeline_id": pipeline["id"],
            "stage_id": pipeline["stages"][0]["id"],
            "supplier_id": supplier["id"],
            "employee_id": (await c.get("/hrms/employees")).json()[0]["id"],
        }
        yield ids
        await _drop(tenant_id)


@pytest_asyncio.fixture
async def mine(client):
    tenant_id = await _signup(client, ["crm", "pos", "hrms"])
    yield tenant_id
    await _drop(tenant_id)


async def test_a_malformed_id_is_a_422_not_a_500(client, mine):
    assert (await client.get("/pos/sales/not-a-uuid")).status_code == 422
    assert (await client.get("/crm/leads/12345")).status_code == 422


async def test_an_unknown_payment_method_is_refused(client, mine):
    p = (await client.get("/pos/products")).json()[0]
    r = await client.post("/pos/sales", json={"items": [{"product_id": p["id"], "qty": 1}],
                                              "paid_minor": 10_000, "payment_method": "bitcoin"})
    assert r.status_code == 422


async def test_another_tenants_role_cannot_be_given_to_my_user(client, mine, other):
    r = await client.post("/team/users", json={
        "name": "Mole", "email": f"mole+{uuid.uuid4().hex[:8]}@example.com",
        "password": "Sup3rSecret!23", "role_id": other["role_id"]})
    assert r.status_code == 404
    users = (await client.get("/team/users")).json()
    assert not any(u["name"] == "Mole" for u in users)


async def test_a_lead_cannot_go_into_another_tenants_pipeline(client, mine, other):
    r = await client.post("/crm/leads", json={"name": "Stray", "pipeline_id": other["pipeline_id"],
                                              "stage_id": other["stage_id"]})
    assert r.status_code == 404


async def test_a_lead_cannot_be_owned_by_another_tenants_user(client, mine, other):
    lead = (await client.get("/crm/leads")).json()[0]
    r = await client.patch(f"/crm/leads/{lead['id']}", json={"owner_id": other["user_id"]})
    assert r.status_code == 404


async def test_a_purchase_order_cannot_use_another_tenants_supplier(client, mine, other):
    p = (await client.get("/pos/products")).json()[0]
    r = await client.post("/pos/purchase-orders", json={
        "supplier_id": other["supplier_id"], "items": [{"product_id": p["id"], "qty": 1}]})
    assert r.status_code == 404


async def test_leave_cannot_be_filed_for_another_tenants_employee(client, mine, other):
    r = await client.post("/hrms/leave", json={
        "employee_id": other["employee_id"], "leave_type": "casual",
        "from_date": "2026-11-02", "to_date": "2026-11-02"})
    assert r.status_code == 404
