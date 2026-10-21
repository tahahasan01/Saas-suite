"""Enum-like columns: one list of values, enforced twice (TR-API-05, P1-5).

The API refuses an unknown value with a 422 (a `Literal` on the model) and the
database refuses it with a check constraint, so a code path that skips the
model — a job, a script, a future endpoint — still can't store one. The two
must name the same values; this test reads the constraints back and compares.
"""
from __future__ import annotations

import re
import typing

import asyncpg
import pytest

from app import models
from app.config import settings

# (table, column) -> the model's list of allowed values.
ENUM_COLUMNS = {
    ("pos_sales", "payment_method"): models.PAYMENT_METHODS,
    ("hrms_leave_requests", "leave_type"): models.LEAVE_TYPES,
    ("hrms_leave_requests", "request_type"): models.REQUEST_TYPES,
    ("hrms_leave_requests", "status"): models.LEAVE_STATUSES,
    ("hrms_attendance", "status"): models.ATTENDANCE_STATUSES,
    ("hrms_attendance", "method"): models.ATTENDANCE_METHODS,
    ("hrms_attendance", "fraud_flag"): models.FRAUD_FLAGS,
    ("hrms_punches", "kind"): models.PUNCH_KINDS,
    ("hrms_punches", "method"): models.ATTENDANCE_METHODS,
    ("hrms_punches", "fraud_flag"): models.FRAUD_FLAGS,
    ("hrms_employees", "status"): models.EMPLOYEE_STATUSES,
    ("crm_interactions", "channel"): models.INTERACTION_CHANNELS,
    ("crm_interactions", "outcome"): models.INTERACTION_OUTCOMES,
    ("crm_stages", "kind"): models.STAGE_KINDS,
    ("crm_invoice_requests", "status"): models.INVOICE_STATUSES,
    ("users", "status"): models.USER_STATUSES,
    ("workflows", "trigger"): models.WORKFLOW_TRIGGERS,
    ("pos_drawers", "status"): models.DRAWER_STATUSES,
    ("pos_purchase_orders", "status"): models.PO_STATUSES,
    ("pos_fbr_invoices", "status"): models.FBR_STATUSES,
    ("fbr_settings", "environment"): models.FBR_ENVIRONMENTS,
    ("audit_log", "actor_kind"): models.ACTOR_KINDS,
    ("timeline_events", "kind"): models.TIMELINE_KINDS,
    ("scheduled_jobs", "status"): models.JOB_STATUSES,
    ("job_runs", "status"): models.JOB_RUN_STATUSES,
    # hrms org (0065)
    ("hrms_locations", "kind"): models.LOCATION_KINDS,
    ("hrms_locations", "province"): models.PROVINCES,
    ("hrms_locations", "geo_mode"): models.GEO_MODES,
    ("hrms_locations", "ip_mode"): models.GEO_MODES,
    ("hrms_employees", "employment_type"): models.EMPLOYMENT_TYPES,
    ("hrms_employee_documents", "kind"): models.DOCUMENT_KINDS,
    # attendance v2 (0066)
    ("hrms_punches", "geo_status"): models.GEO_STATUSES,
    ("hrms_attendance", "geo_status"): models.GEO_STATUSES,
    ("hrms_punches", "ip_status"): models.IP_STATUSES,
    ("hrms_attendance", "ip_status"): models.IP_STATUSES,
    ("hrms_shifts", "auto_checkout"): models.AUTO_CHECKOUT_POLICIES,
    ("hrms_attendance_corrections", "status"): models.CORRECTION_STATUSES,
}


@pytest.mark.parametrize("table,column", list(ENUM_COLUMNS))
async def test_the_database_checks_the_same_values_as_the_api(table, column):
    conn = await asyncpg.connect(settings.database_url)
    try:
        row = await conn.fetchrow(
            """select pg_get_constraintdef(c.oid) as def, c.convalidated
                 from pg_constraint c
                where c.conrelid = $1::regclass and c.contype = 'c' and c.conname = $2""",
            table, f"{table}_{column}_check")
    finally:
        await conn.close()
    assert row is not None, f"no check constraint on {table}.{column}"
    assert row["convalidated"], f"{table}.{column} check is NOT VALID (legacy rows break it)"
    allowed = set(re.findall(r"'([^']*)'::text", row["def"]))
    assert allowed == set(ENUM_COLUMNS[(table, column)])


def test_the_lists_come_from_the_literals():
    """The value lists are derived from the Literal types, so a model field and
    the list (and through it, the check constraint test) can't drift apart."""
    assert models.PAYMENT_METHODS == list(typing.get_args(models.PaymentMethod))
    assert models.INTERACTION_CHANNELS == list(typing.get_args(models.InteractionChannel))
    assert models.ATTENDANCE_METHODS[: len(typing.get_args(models.CheckInMethod))] == list(
        typing.get_args(models.CheckInMethod))


async def test_unknown_values_are_422s(client, crm_tenant):
    lead = (await client.get("/crm/leads")).json()[0]
    r = await client.post(f"/crm/leads/{lead['id']}/interactions", json={"channel": "carrier-pigeon"})
    assert r.status_code == 422
    r = await client.post(f"/crm/leads/{lead['id']}/interactions", json={"outcome": "maybe"})
    assert r.status_code == 422
    assert (await client.post(f"/crm/leads/{lead['id']}/interactions",
                              json={"channel": "call", "outcome": "callback"})).status_code == 201
    assert (await client.post("/workflows", json={"name": "x", "trigger": "lead.exploded"})).status_code == 422


async def test_an_unknown_fbr_environment_is_a_422(client, pos_tenant):
    assert (await client.put("/fbr/settings", json={"environment": "staging"})).status_code == 422


async def test_unknown_hr_values_are_422s(client, tenant):
    r = await client.patch(f"/hrms/employees/{tenant.employee_id}", json={"status": "fired"})
    assert r.status_code == 422
    r = await client.post("/hrms/attendance/checkin", json={"employee_id": tenant.employee_id,
                                                            "method": "telepathy"})
    assert r.status_code == 422
    assert (await client.get("/hrms/leave?request_type=holiday")).status_code == 422
