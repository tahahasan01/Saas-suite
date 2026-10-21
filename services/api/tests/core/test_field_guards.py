"""Generic field guards and the response redactor (D-04, TR-SEC-32, St04 #11).

Salary, CNIC and cost price are declared once in their module manifests; the
redactor omits them (absent, not null) for callers without the read key, a
write touching them needs the write key, and the audit trail masks the same
fields in the database.
"""
from __future__ import annotations

import re

import asyncpg
import pytest
from fastapi import HTTPException

from app import db, field_guards, rbac
from app.config import settings

from .test_me_permissions import _member

ROW = {"id": "e1", "name": "Ayesha", "salary_minor": 9_000_000, "cnic": "35202-1234567-1", "user_id": "u1"}


def test_guards_come_from_the_manifests():
    hr = field_guards.guarded("hrms.employee")
    assert hr["salary_minor"].read == "payroll.salary.read"
    assert hr["salary_minor"].write == "payroll.salary.update"
    assert hr["cnic"].read == "payroll.salary.read"
    assert field_guards.guarded("products.product")["cost_minor"].read == "products.cost.read"


def test_redact_omits_what_the_caller_may_not_see():
    out = field_guards.redact("hrms.employee", ROW, {"hrms.employee.read": "all"})
    assert "salary_minor" not in out and "cnic" not in out and out["name"] == "Ayesha"
    out = field_guards.redact("hrms.employee", ROW, {"payroll.salary.read": "all"})
    assert out["salary_minor"] == 9_000_000 and out["cnic"] == ROW["cnic"]
    # Your own record is yours to see.
    assert field_guards.redact("hrms.employee", ROW, set(), self_owned=True) == ROW
    many = field_guards.redact_many("hrms.employee", [ROW, {**ROW, "user_id": "u2"}], set(), self_id="u1")
    assert "salary_minor" in many[0] and "salary_minor" not in many[1]
    assert ROW["salary_minor"] == 9_000_000        # the input is never mutated


def test_an_unguarded_resource_passes_through():
    assert field_guards.redact("crm.lead", {"a": 1}, set()) == {"a": 1}


def test_writes_to_a_guarded_field_need_the_write_key():
    field_guards.check_write("hrms.employee", ["name", "phone"], set())
    with pytest.raises(HTTPException) as e:
        field_guards.check_write("hrms.employee", ["salary_minor"], {"payroll.salary.read": "all"})
    assert e.value.status_code == 403 and "payroll.salary.update" in e.value.detail
    field_guards.check_write("hrms.employee", ["salary_minor"], {"payroll.salary.update": "all"})


async def test_every_guarded_field_is_also_masked_in_the_audit_trail():
    conn = await asyncpg.connect(settings.database_url)
    try:
        src = await conn.fetchval("select pg_get_functiondef('audit_row'::regproc)")
    finally:
        await conn.close()
    masked = set(re.findall(r"'([a-z_]+)'", re.search(r"always_guarded[^;]*;", src).group(0)))
    fields = {f for guards in field_guards.GUARDS.values() for f in guards}
    assert fields <= masked, fields - masked


async def test_redacting_real_rows_with_a_callers_real_permissions(client, tenant):
    """An HR clerk (hrms grants, no payroll grant) never receives pay or CNIC."""
    mate, _ = await _member(client, {"hrms": ["read", "write"]})
    try:
        me = (await mate.get("/auth/me")).json()
        held = me["permissions"]
        async with db.tenant_conn(tenant.tenant_id) as conn:
            rows = [dict(r) for r in await conn.fetch("select id, name, cnic, salary_minor, user_id from hrms_employees")]
        assert "hrms.employee.read" in held and "payroll.salary.read" not in held
        out = field_guards.redact_many("hrms.employee", rows, held, self_id=me["user"]["id"])
        assert rows and all("salary_minor" not in r and "cnic" not in r for r in out)
        # The owner, holding payroll, gets them.
        async with db.tenant_conn(tenant.tenant_id) as conn:
            owner = (await client.get("/auth/me")).json()
            p = await rbac.load_principal(conn, user_id=owner["user"]["id"], role_id=None)
        assert all("salary_minor" in r for r in field_guards.redact_many("hrms.employee", rows, p.permissions()))
    finally:
        await mate.aclose()
