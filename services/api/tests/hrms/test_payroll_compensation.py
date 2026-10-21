"""Salary history as dated rows, never edited in place (D-42, checklist §7.2),
and the payroll identity fields: bank, IBAN, NTN, EOBI and SS numbers.

`hrms_employees.salary_minor` stays readable for one release as a mirror of
the compensation row in force today. The legacy write paths (create with a
salary, PATCH salary_minor) keep working: they add a compensation row.
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta

import asyncpg
import pytest
import pytest_asyncio

from app.config import settings

from .payroll_helpers import login_with_role, new_employee, owner_execute, owner_fetch

GOOD_IBAN = "PK36SCBL0000001123456702"


@pytest_asyncio.fixture
async def hr_clerk(client, tenant):
    c = await login_with_role(client, "HR clerk", {"hrms": ["read", "write"]})
    yield c
    await c.aclose()


@pytest_asyncio.fixture
async def payroll_reader(client, tenant):
    c = await login_with_role(client, "Payroll reader", {"hrms": ["read"], "payroll": ["read"]})
    yield c
    await c.aclose()


async def _history(client, emp_id):
    r = await client.get(f"/payroll/employees/{emp_id}/compensation")
    assert r.status_code == 200, r.text
    return r.json()


async def test_every_signup_employee_starts_with_a_joining_row(client, tenant):
    rows = await _history(client, tenant.employee_id)
    assert len(rows) == 1
    assert rows[0]["reason"] == "joining"
    emp = next(e for e in (await client.get("/hrms/employees")).json() if e["id"] == tenant.employee_id)
    assert rows[0]["base_minor"] == emp["salary_minor"]


async def test_a_new_employee_gets_a_joining_row_from_its_join_date(client, tenant):
    emp = await new_employee(client, salary_minor=9_000_000, join_date="2026-03-15")
    rows = await _history(client, emp["id"])
    assert [(r["effective_from"], r["base_minor"], r["reason"]) for r in rows] == [
        ("2026-03-15", 9_000_000, "joining")]


async def test_a_raise_is_a_new_row_and_the_old_one_is_untouched(client, tenant):
    emp = await new_employee(client, salary_minor=9_000_000, join_date="2026-01-01")
    r = await client.post(f"/payroll/employees/{emp['id']}/compensation", json={
        "effective_from": "2026-07-01", "base_minor": 11_000_000, "reason": "increment", "note": "Annual"})
    assert r.status_code == 201, r.text
    rows = await _history(client, emp["id"])
    assert [(r["effective_from"], r["base_minor"]) for r in rows] == [
        ("2026-07-01", 11_000_000), ("2026-01-01", 9_000_000)]   # newest first
    # The mirror shows the salary in force today.
    seen = next(e for e in (await client.get("/hrms/employees")).json() if e["id"] == emp["id"])
    assert seen["salary_minor"] == 11_000_000


async def test_a_future_raise_does_not_change_todays_salary(client, tenant):
    emp = await new_employee(client, salary_minor=9_000_000, join_date="2026-01-01")
    later = (date.today() + timedelta(days=60)).isoformat()
    r = await client.post(f"/payroll/employees/{emp['id']}/compensation",
                          json={"effective_from": later, "base_minor": 12_000_000})
    assert r.status_code == 201
    seen = next(e for e in (await client.get("/hrms/employees")).json() if e["id"] == emp["id"])
    assert seen["salary_minor"] == 9_000_000


async def test_the_legacy_salary_edit_adds_a_row(client, tenant):
    emp = await new_employee(client, salary_minor=9_000_000, join_date="2026-01-01")
    r = await client.patch(f"/hrms/employees/{emp['id']}", json={"salary_minor": 9_500_000})
    assert r.status_code == 200 and r.json()["salary_minor"] == 9_500_000
    rows = await _history(client, emp["id"])
    assert len(rows) == 2
    assert rows[0]["base_minor"] == 9_500_000 and rows[0]["reason"] == "correction"
    assert rows[1]["base_minor"] == 9_000_000


async def test_compensation_rows_can_never_be_edited_or_deleted(client, tenant):
    rows = await _history(client, tenant.employee_id)
    rid = uuid.UUID(rows[0]["id"])
    # Not even by the table owner: the trigger refuses an edit in place.
    with pytest.raises(asyncpg.RaiseError, match="never edited"):
        await owner_execute("update hrms_compensation set base_minor = 1 where id = $1", rid)
    # app_user holds no UPDATE or DELETE on the table at all.
    conn = await asyncpg.connect(settings.app_database_url)
    try:
        async with conn.transaction():
            await conn.execute("select set_config('app.tenant_id', $1, true)", tenant.tenant_id)
            with pytest.raises(asyncpg.InsufficientPrivilegeError):
                await conn.execute("delete from hrms_compensation where id = $1", rid)
    finally:
        await conn.close()


async def test_the_backfill_gives_every_employee_one_row_and_is_idempotent(client, tenant):
    conn = await asyncpg.connect(settings.database_url)
    try:
        # An employee from before 0069: inserted with the triggers off.
        await conn.execute("set session_replication_role = replica")
        emp_id = await conn.fetchval(
            """insert into hrms_employees (tenant_id, name, salary_minor, join_date)
               values ($1, 'Legacy', 7000000, '2024-02-01') returning id""", uuid.UUID(tenant.tenant_id))
        await conn.execute("set session_replication_role = origin")
        assert await conn.fetchval("select count(*) from hrms_compensation where employee_id=$1", emp_id) == 0
        await conn.execute("select hrms_backfill_compensation()")
        await conn.execute("select hrms_backfill_compensation()")
        rows = await conn.fetch("select * from hrms_compensation where employee_id=$1", emp_id)
    finally:
        await conn.close()
    assert len(rows) == 1
    assert (rows[0]["effective_from"], rows[0]["base_minor"], rows[0]["reason"]) == (
        date(2024, 2, 1), 7_000_000, "joining")


async def test_preview_pay_equals_the_old_salary_column(client, tenant):
    """§7.2 verify: the preview for the current month is identical before and
    after the move — every gross equals what salary_minor said."""
    emps = {e["id"]: e["salary_minor"] for e in (await client.get("/hrms/employees")).json()}
    run = (await client.get("/hrms/payroll")).json()
    assert run["payslips"]
    for p in run["payslips"]:
        assert p["gross_minor"] == emps[p["employee_id"]]


async def test_compensation_needs_payroll_keys(client, tenant, hr_clerk, payroll_reader):
    assert (await hr_clerk.get(f"/payroll/employees/{tenant.employee_id}/compensation")).status_code == 403
    assert (await payroll_reader.get(f"/payroll/employees/{tenant.employee_id}/compensation")).status_code == 200
    body = {"effective_from": "2026-07-01", "base_minor": 1}
    assert (await hr_clerk.post(f"/payroll/employees/{tenant.employee_id}/compensation", json=body)).status_code == 403
    assert (await payroll_reader.post(f"/payroll/employees/{tenant.employee_id}/compensation",
                                      json=body)).status_code == 403


async def test_an_unknown_employee_is_404(client, tenant):
    r = await client.post(f"/payroll/employees/{uuid.uuid4()}/compensation",
                          json={"effective_from": "2026-07-01", "base_minor": 1})
    assert r.status_code == 404


async def test_bad_compensation_input_is_422(client, tenant):
    url = f"/payroll/employees/{tenant.employee_id}/compensation"
    assert (await client.post(url, json={"effective_from": "2026-07-01", "base_minor": -1})).status_code == 422
    assert (await client.post(url, json={"effective_from": "2026-07-01", "base_minor": 1,
                                         "reason": "whim"})).status_code == 422


# ── Payroll identity ─────────────────────────────────────────────────────────
async def test_owner_sets_and_reads_payroll_details(client, tenant):
    url = f"/payroll/employees/{tenant.employee_id}/details"
    r = await client.put(url, json={"bank_name": "Standard Chartered", "iban": "pk36 scbl 0000 0011 2345 6702",
                                    "ntn": "1234567-8", "eobi_number": "EOBI-778", "ss_number": "PESSI-55",
                                    "payment_mode": "bank"})
    assert r.status_code == 200, r.text
    d = (await client.get(url)).json()
    assert d["iban"] == GOOD_IBAN and d["iban_valid"] is True
    assert (d["bank_name"], d["ntn"], d["eobi_number"], d["ss_number"], d["payment_mode"]) == (
        "Standard Chartered", "1234567-8", "EOBI-778", "PESSI-55", "bank")
    assert d["masked"] is False


async def test_an_invalid_iban_is_refused_with_the_reason(client, tenant):
    url = f"/payroll/employees/{tenant.employee_id}/details"
    r = await client.put(url, json={"iban": "PK37SCBL0000001123456702"})
    assert r.status_code == 422
    assert "checksum" in r.text
    # Clearing it is fine.
    assert (await client.put(url, json={"iban": ""})).status_code == 200


async def test_the_database_refuses_a_malformed_iban_too(client, tenant):
    with pytest.raises(asyncpg.CheckViolationError):
        await owner_execute("update hrms_employees set iban = 'NOT-AN-IBAN' where id = $1",
                            uuid.UUID(tenant.employee_id))


async def test_hr_without_payroll_sees_details_masked_and_cannot_change_them(client, tenant, hr_clerk):
    url = f"/payroll/employees/{tenant.employee_id}/details"
    await client.put(url, json={"bank_name": "HBL", "iban": GOOD_IBAN, "ntn": "1234567-8",
                                "eobi_number": "EOBI-778", "ss_number": "PESSI-55"})
    d = (await hr_clerk.get(url)).json()
    assert d["masked"] is True
    assert d["iban"].endswith("6702") and "0000001123" not in d["iban"]
    assert "1234567" not in d["ntn"] and "778" not in d["eobi_number"][:-1]
    assert d["bank_name"] == "HBL"   # not sensitive
    assert d["current_base_minor"] is None
    assert (await hr_clerk.put(url, json={"bank_name": "MCB"})).status_code == 403


async def test_payroll_reader_sees_details_unmasked(client, tenant, payroll_reader):
    url = f"/payroll/employees/{tenant.employee_id}/details"
    await client.put(url, json={"iban": GOOD_IBAN})
    d = (await payroll_reader.get(url)).json()
    assert d["masked"] is False and d["iban"] == GOOD_IBAN
    assert d["current_base_minor"] is not None
    assert (await payroll_reader.put(url, json={"bank_name": "MCB"})).status_code == 403


async def test_identity_changes_are_audited_without_values(client, tenant):
    url = f"/payroll/employees/{tenant.employee_id}/details"
    await client.put(url, json={"iban": GOOD_IBAN, "ntn": "1234567-8"})
    rows = await owner_fetch(
        """select changes, guarded from audit_log where tenant_id = $1 and entity = 'hrms_employees'
             and entity_id = $2 and changes ? 'iban'""", uuid.UUID(tenant.tenant_id), tenant.employee_id)
    assert rows
    assert rows[-1]["changes"]["iban"] == ["***", "***"]
    assert "ntn" in rows[-1]["guarded"]


async def test_an_unknown_payment_mode_is_422(client, tenant):
    r = await client.put(f"/payroll/employees/{tenant.employee_id}/details", json={"payment_mode": "barter"})
    assert r.status_code == 422
