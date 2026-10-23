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

from app import models, payroll_models
from app.config import settings

# (table, column) -> the model's list of allowed values.
ENUM_COLUMNS = {
    ("pos_sales", "payment_method"): models.SALE_PAYMENT_METHODS,
    # leave_type codes are tenant data since 0068 (hrms_leave_types, FK); no fixed list.
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
    ("crm_invoice_requests", "status"): models.INVOICE_REQUEST_STATUSES,
    ("users", "status"): models.USER_STATUSES,
    ("workflows", "trigger"): models.WORKFLOW_TRIGGERS,
    ("pos_sessions", "status"): models.DRAWER_STATUSES,
    ("pos_purchase_orders", "status"): models.PO_STATUSES,
    ("pos_fbr_invoices", "status"): models.FBR_STATUSES,
    ("fbr_settings", "environment"): models.FBR_ENVIRONMENTS,
    ("audit_log", "actor_kind"): models.ACTOR_KINDS,
    ("timeline_events", "kind"): models.TIMELINE_KINDS,
    ("scheduled_jobs", "status"): models.JOB_STATUSES,
    ("job_runs", "status"): models.JOB_RUN_STATUSES,
    ("crm_leads", "status"): models.LEAD_STATUSES,
    ("activities", "entity_type"): models.ACTIVITY_ENTITIES,
    ("activities", "outcome"): models.INTERACTION_OUTCOMES,
    ("activity_types", "icon"): models.ACTIVITY_ICONS,
    ("activity_types", "code"): models.ACTIVITY_TYPE_CODES,
    ("contacts", "kind"): models.CONTACT_KINDS,
    ("contacts", "roles"): models.CONTACT_ROLES,
    ("contact_addresses", "kind"): models.ADDRESS_KINDS,
    ("tags", "color"): models.TAG_COLORS,
    ("record_tags", "entity_type"): models.TAGGABLE_ENTITIES,
    ("contact_review_items", "reason"): models.REVIEW_REASONS,
    ("contact_review_items", "status"): models.REVIEW_STATUSES,
    # org data (3A, p3-orgdata)
    ("pk_regions", "code"): models.REGION_CODES,
    ("pk_regions", "kind"): models.REGION_KINDS,
    ("sequences", "reset"): models.SEQUENCE_RESETS,
    ("files", "mime"): models.FILE_MIMES,
    ("files", "visibility"): models.FILE_VISIBILITIES,
    ("tenant_branding", "layout"): models.BRANDING_LAYOUTS,
    ("tax_rates", "kind"): models.TAX_KINDS,
    ("tax_rates", "applies_to"): models.TAX_APPLIES_TO,
    ("tenant_modules", "state"): models.MODULE_STATES,
    ("tenant_modules", "reason"): models.MODULE_REASONS,
    ("module_purges", "status"): models.PURGE_STATUSES,
    ("role_grants", "scope"): models.GRANT_SCOPES,
    # hrms org (0065)
    ("hrms_locations", "kind"): models.LOCATION_KINDS,
    ("hrms_locations", "province"): models.PROVINCES,
    ("hrms_locations", "geo_mode"): models.GEO_MODES,
    ("hrms_locations", "ip_mode"): models.GEO_MODES,
    ("hrms_employees", "employment_type"): models.EMPLOYMENT_TYPES,
    ("hrms_employee_documents", "kind"): models.DOCUMENT_KINDS,
    ("hrms_notices", "audience"): models.NOTICE_AUDIENCES,
    ("hrms_overtime_claims", "status"): models.OVERTIME_STATUSES,
    ("hrms_assets", "category"): models.ASSET_CATEGORIES,
    ("hrms_assets", "condition"): models.ASSET_CONDITIONS,
    ("hrms_assets", "status"): models.ASSET_STATUSES,
    ("hrms_asset_assignments", "return_condition"): models.ASSET_CONDITIONS,
    ("hrms_overtime_claims", "day_type"): models.OVERTIME_DAY_TYPES,
    # the touch tile screen (wave B, 0090)
    ("pos_categories", "color"): models.TILE_COLORS,
    ("pos_products", "color"): models.TILE_COLORS,
    ("pay_advance_repayments", "method"): payroll_models.ADVANCE_REPAY_METHODS,
    ("payroll_policies", "encash_basis"): payroll_models.ENCASH_BASES,
    ("payroll_policies", "gratuity_tax"): payroll_models.GRATUITY_TAXES,
    ("payroll_policies", "preset"): payroll_models.POLICY_PRESETS,
    ("payroll_policies", "pf_base"): payroll_models.PF_BASES,
    ("pay_pf_entries", "kind"): payroll_models.PF_ENTRY_KINDS,
    ("hrms_job_changes", "kind"): models.JOB_CHANGE_KINDS,
    ("hrms_job_changes", "status"): models.JOB_CHANGE_STATUSES,
    ("hrms_letter_templates", "kind"): models.LETTER_KINDS,
    ("hrms_letters", "kind"): models.LETTER_KINDS,
    ("hrms_letter_requests", "kind"): models.LETTER_REQUEST_KINDS,
    ("hrms_letter_requests", "status"): models.LETTER_REQUEST_STATUSES,
    ("hrms_final_settlements", "status"): models.SETTLEMENT_STATUSES,
    ("hrms_final_settlement_lines", "kind"): models.SETTLEMENT_KINDS,
    ("hrms_final_settlement_lines", "code"): models.SETTLEMENT_CODES,
    ("hrms_comp_off_requests", "status"): models.COMP_OFF_STATUSES,
    ("hrms_expense_claims", "status"): models.EXPENSE_STATUSES,
    ("hrms_expense_lines", "category"): models.EXPENSE_CATEGORIES,
    ("hrms_probation_reviews", "outcome"): models.PROBATION_OUTCOMES,
    ("hrms_appraisal_cycles", "status"): models.APPRAISAL_CYCLE_STATUSES,
    ("hrms_appraisals", "status"): models.APPRAISAL_STATUSES,
    ("hrms_employees", "exit_reason"): models.EXIT_REASONS,
    ("hrms_boarding_templates", "kind"): models.BOARDING_KINDS,
    ("hrms_boarding_template_tasks", "owner"): models.BOARDING_OWNERS,
    ("hrms_boardings", "kind"): models.BOARDING_KINDS,
    ("hrms_boardings", "status"): models.BOARDING_STATUSES,
    ("hrms_boardings", "reason"): models.EXIT_REASONS,
    ("hrms_boarding_tasks", "owner"): models.BOARDING_OWNERS,
    ("hrms_boarding_tasks", "status"): models.BOARDING_TASK_STATUSES,
    ("hrms_exit_interviews", "outcome"): models.EXIT_OUTCOMES,
    ("hrms_exit_interviews", "primary_reason"): models.LEAVING_REASONS,
    # attendance v2 (0066)
    ("hrms_punches", "geo_status"): models.GEO_STATUSES,
    ("hrms_attendance", "geo_status"): models.GEO_STATUSES,
    ("hrms_punches", "ip_status"): models.IP_STATUSES,
    ("hrms_attendance", "ip_status"): models.IP_STATUSES,
    ("hrms_shifts", "auto_checkout"): models.AUTO_CHECKOUT_POLICIES,
    ("hrms_attendance_corrections", "status"): models.CORRECTION_STATUSES,
    # holiday calendars (0067)
    ("hrms_holiday_calendars", "scope"): models.HOLIDAY_SCOPES,
    ("hrms_holiday_calendars", "province"): models.PROVINCES,
    ("hrms_holidays", "kind"): models.HOLIDAY_KINDS,
    # leave v2 (0068)
    ("hrms_leave_types", "counts_as"): models.LEAVE_COUNTS_AS,
    ("hrms_leave_types", "approval"): models.LEAVE_APPROVALS,
    ("hrms_leave_types", "grant_mode"): models.LEAVE_GRANT_MODES,
    ("hrms_leave_types", "carry_forward"): models.LEAVE_CARRY_MODES,
    ("hrms_leave_ledger", "entry"): models.LEDGER_ENTRIES,
    ("hrms_leave_requests", "from_half"): models.HALVES,
    ("hrms_leave_requests", "to_half"): models.HALVES,
    ("hrms_leave_requests", "approval_step"): models.LEAVE_STEPS,
    ("hrms_leave_approvals", "step"): models.APPROVAL_STEPS,
    ("hrms_leave_approvals", "decision"): models.APPROVAL_DECISIONS,
    # invoices v2 (0074)
    ("invoices", "kind"): models.INVOICE_KINDS,
    ("invoices", "status"): models.INVOICE_STATUSES,
    ("invoice_payments", "method"): models.INVOICE_PAYMENT_METHODS,
    # catalog v2 and stock (0075)
    ("pos_barcode_rules", "kind"): models.BARCODE_RULE_KINDS,
    ("pos_stock_moves", "reason"): models.STOCK_MOVE_REASONS,
    ("stock_transfers", "status"): models.TRANSFER_STATUSES,
    ("stock_counts", "status"): models.COUNT_STATUSES,
    ("restaurant_orders", "order_type"): models.RESTAURANT_ORDER_TYPES,
    ("restaurant_orders", "status"): models.ORDER_STATUSES,
    ("restaurant_kots", "kind"): models.KOT_KINDS,
    ("restaurant_kots", "status"): models.KOT_STATUSES,
    # registers and sessions (0076)
    ("pos_payments", "method"): models.TENDER_METHODS,
    ("pos_returns", "refund_method"): models.TENDER_METHODS,
    ("pos_cash_moves", "kind"): models.CASH_MOVE_KINDS,
    ("pos_sales", "status"): models.SALE_STATUSES,
    ("customer_ledger", "kind"): models.LEDGER_KINDS,
    ("customer_ledger", "method"): models.LEDGER_METHODS,
    # payroll (3F)
    ("hrms_compensation", "reason"): models.COMPENSATION_REASONS,
    ("hrms_employees", "payment_mode"): models.PAYMENT_MODES,
    ("pay_components", "kind"): models.COMPONENT_KINDS,
    ("pay_components", "calc"): models.COMPONENT_CALCS,
    ("pay_one_offs", "kind"): models.COMPONENT_KINDS,
    ("pay_one_offs", "status"): models.ONE_OFF_STATUSES,
    ("pay_advances", "status"): models.ADVANCE_STATUSES,
    ("payroll_runs", "kind"): models.RUN_KINDS,
    ("payroll_runs", "purpose"): models.RUN_PURPOSES,
    ("payroll_runs", "status"): models.RUN_STATUSES,
    ("payroll_run_events", "from_status"): models.RUN_STATUSES,
    ("payroll_run_events", "to_status"): models.RUN_STATUSES,
    ("payslip_lines", "kind"): models.PAYSLIP_LINE_KINDS,
    ("statutory_schemes", "authority"): models.STATUTORY_AUTHORITIES,
    ("statutory_rates", "base_kind"): models.STATUTORY_BASE_KINDS,
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
