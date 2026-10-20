"""Salary, CNIC and pay are payroll data, not HR data (D-42, P1-6, QA-A01).

Anyone with hrms:read used to see every salary and CNIC in the employee list
and could open the whole payroll. Now those need a `payroll.*` key: without
it the values are masked, salary edits are refused and payroll is a 403.
"""
from __future__ import annotations

import uuid

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app import registry
from app.main import app

PASSWORD = "Sup3rSecret!23"


async def _login_with_role(owner, name: str, permissions: dict) -> AsyncClient:
    """A second client, logged in as a new user on a new role."""
    role = (await owner.post("/team/roles", json={"name": name, "permissions": permissions})).json()
    email = f"staff+{uuid.uuid4().hex[:8]}@example.com"
    r = await owner.post("/team/users", json={"name": name, "email": email,
                                              "password": PASSWORD, "role_id": role["id"]})
    assert r.status_code == 201, r.text
    c = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    r = await c.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return c


@pytest_asyncio.fixture
async def hr_clerk(client, tenant):
    c = await _login_with_role(client, "HR clerk", {"hrms": ["read", "write"]})
    yield c
    await c.aclose()


@pytest_asyncio.fixture
async def payroll_officer(client, tenant):
    c = await _login_with_role(client, "Payroll officer", {"hrms": ["read"], "payroll": ["read"]})
    yield c
    await c.aclose()


async def _with_cnic(client, tenant) -> dict:
    r = await client.patch(f"/hrms/employees/{tenant.employee_id}", json={"designation": "Cashier"})
    assert r.status_code == 200
    created = await client.post("/hrms/employees", json={
        "name": "Ayesha", "cnic": "35202-1234567-3", "salary_minor": 9_000_000})
    assert created.status_code == 201, created.text
    return created.json()


def test_the_payroll_module_declares_its_permission_keys():
    keys = registry.PERMISSIONS["payroll"]
    for key in ("payroll.run.read", "payroll.salary.read", "payroll.salary.update",
                "payroll.run.approve", "payroll.report.export"):
        assert key in keys
    assert all(k.startswith("payroll.") for k in keys)


def test_a_legacy_read_grant_carries_only_read_keys():
    assert registry.keys_for_grant("payroll", "read") == {"payroll.run.read", "payroll.salary.read"}
    assert "payroll.salary.update" in registry.keys_for_grant("payroll", "write")
    assert registry.keys_for_grant("payroll", "admin") == set(registry.PERMISSIONS["payroll"])
    # HR grants never carry payroll keys (TR-SEC-36).
    assert registry.keys_for_grant("hrms", "admin") == set()


async def test_without_payroll_access_salary_and_cnic_are_masked(client, tenant, hr_clerk):
    emp = await _with_cnic(client, tenant)
    rows = (await hr_clerk.get("/hrms/employees")).json()
    seen = next(e for e in rows if e["id"] == emp["id"])
    assert seen["salary_minor"] is None
    assert seen["cnic"] != "35202-1234567-3"
    assert "1234567" not in seen["cnic"]
    assert seen["pay_masked"] is True
    assert all(e["salary_minor"] is None for e in rows)


async def test_owner_and_payroll_roles_see_real_values(client, tenant, payroll_officer):
    emp = await _with_cnic(client, tenant)
    for c in (client, payroll_officer):
        seen = next(e for e in (await c.get("/hrms/employees")).json() if e["id"] == emp["id"])
        assert seen["salary_minor"] == 9_000_000
        assert seen["cnic"] == "35202-1234567-3"
        assert seen["pay_masked"] is False


async def test_a_write_by_an_hr_clerk_is_answered_masked(client, tenant, hr_clerk):
    emp = await _with_cnic(client, tenant)
    r = await hr_clerk.patch(f"/hrms/employees/{emp['id']}", json={"designation": "Lead cashier"})
    assert r.status_code == 200
    assert r.json()["salary_minor"] is None and "1234567" not in r.json()["cnic"]


async def test_an_hr_clerk_cannot_set_pay(client, tenant, hr_clerk):
    emp = await _with_cnic(client, tenant)
    r = await hr_clerk.patch(f"/hrms/employees/{emp['id']}", json={"salary_minor": 1})
    assert r.status_code == 403
    r = await hr_clerk.post("/hrms/employees", json={"name": "New hire", "salary_minor": 5_000_000})
    assert r.status_code == 403
    # Onboarding without pay still works; payroll fills it in.
    assert (await hr_clerk.post("/hrms/employees", json={"name": "New hire"})).status_code == 201
    seen = next(e for e in (await client.get("/hrms/employees")).json() if e["id"] == emp["id"])
    assert seen["salary_minor"] == 9_000_000


async def test_payroll_needs_a_payroll_key(client, tenant, hr_clerk, payroll_officer):
    assert (await hr_clerk.get("/hrms/payroll?month=2026-10")).status_code == 403
    assert (await payroll_officer.get("/hrms/payroll?month=2026-10")).status_code == 200
    assert (await client.get("/hrms/payroll?month=2026-10")).status_code == 200


async def test_payslips_say_when_rates_are_unverified(client, tenant):
    run = (await client.get("/hrms/payroll?month=2026-10")).json()
    assert run["tax_rates_verified"] is False
    assert run["payslips"] and all(
        p["tax_rates_verified"] is False and p["tax_year"] == "TY2027" for p in run["payslips"])
