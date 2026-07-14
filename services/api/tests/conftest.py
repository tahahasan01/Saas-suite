"""Shared fixtures for endpoint tests.

Drives the real FastAPI app over ASGI against the real database — these tests
exist to catch the class of bug that unit tests structurally cannot, e.g. a
payroll column that is always zero because nothing writes the status it reads.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass

import asyncpg
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app import db, ratelimit
from app.config import settings
from app.main import app
from app.security import SESSION_COOKIE


@pytest.fixture(autouse=True)
def _fresh_rate_limits():
    """Every test signs up from the same IP; without this the limiter starts
    429-ing partway through the suite and failures depend on test order."""
    ratelimit.reset()


@dataclass
class Tenant:
    tenant_id: str
    employee_id: str


@pytest_asyncio.fixture
async def client():
    # Drive the ASGI app directly. The pools are opened by hand because
    # ASGITransport does not run the lifespan, which also keeps the background
    # scheduler out of the test process.
    await db.connect()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    await db.disconnect()


@pytest_asyncio.fixture
async def tenant(client):
    """A freshly signed-up HRMS tenant, torn down afterwards. Leaves `client`
    authenticated as its owner.

    Signup seeds sample employees, so this doubles as a check that a real
    tenant's first-run state is sane.
    """
    # Not a .test/.invalid domain: those are reserved TLDs and email-validator
    # rejects them outright, which fails signup before it reaches any logic.
    email = f"test+{uuid.uuid4().hex[:10]}@example.com"
    r = await client.post("/auth/signup", json={
        "company_name": "Fixture Co",
        "industry_type": "retail",
        "sections": ["hrms"],
        "name": "Test Owner",
        "email": email,
        "password": "Sup3rSecret!23",
    })
    r.raise_for_status()
    # Cookie on the client, not per-request: httpx deprecates the latter.
    client.cookies.set(SESSION_COOKIE, r.cookies[SESSION_COOKIE])
    tenant_id = r.json()["tenant"]["id"]

    employees = (await client.get("/hrms/employees")).json()
    yield Tenant(tenant_id=tenant_id, employee_id=employees[0]["id"])

    # Cascades to every tenant-scoped row.
    owner = await asyncpg.connect(settings.database_url)
    try:
        await owner.execute("delete from tenants where id = $1", uuid.UUID(tenant_id))
    finally:
        await owner.close()
