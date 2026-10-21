"""Saved payroll runs (D-40, St03 §6.5, gate M6, QA-H03/H04/H07/H13).

draft → calculating → review → approved → paid → locked (+ cancelled, failed).
Calculation happens in the worker job, in batches of 100, idempotently.
Payslips are frozen outside `calculating` — in the database, for every role.
"""
from __future__ import annotations

import asyncio
import uuid

import asyncpg
import pytest
import pytest_asyncio

from app import jobs, payroll_data, payroll_runs
from app.config import settings

from .payroll_helpers import login_with_role, new_employee, owner_execute, owner_fetch

MONTH = "2026-09"   # a completed month in TY2027


async def calc(client, run_id: str) -> dict:
    r = await client.post(f"/payroll/runs/{run_id}/calculate")
    assert r.status_code == 202, r.text
    assert r.json()["status"] == "calculating"
    await jobs.HANDLERS["payroll.calculate"]()
    return (await client.get(f"/payroll/runs/{run_id}")).json()


async def new_run(client, month: str = MONTH, **extra) -> dict:
    r = await client.post("/payroll/runs", json={"month": month, **extra})
    assert r.status_code == 201, r.text
    return r.json()


async def paid_and_locked(client, month: str = MONTH) -> dict:
    run = await new_run(client, month)
    await calc(client, run["id"])
    for step in ("approve", "mark-paid", "lock"):
        r = await client.post(f"/payroll/runs/{run['id']}/{step}")
        assert r.status_code == 200, (step, r.text)
    return (await client.get(f"/payroll/runs/{run['id']}")).json()


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


# ── Creating and calculating ─────────────────────────────────────────────────
async def test_a_run_starts_as_a_draft_named_for_its_month(client, tenant):
    run = await new_run(client)
    assert (run["status"], run["number"], run["kind"]) == ("draft", "PR-2026-09", "regular")
    assert (run["period_start"], run["period_end"], run["pay_date"]) == ("2026-09-01", "2026-09-30", "2026-09-30")
    assert run["tax_year"] == "TY2027"


async def test_one_regular_run_per_month(client, tenant):
    await new_run(client)
    r = await client.post("/payroll/runs", json={"month": MONTH})
    assert r.status_code == 409


async def test_calculate_builds_a_payslip_per_employee_and_moves_to_review(client, tenant):
    run = await new_run(client)
    detail = await calc(client, run["id"])
    emps = (await client.get("/hrms/employees")).json()
    assert detail["status"] == "review"
    assert len(detail["payslips"]) == len(emps)
    assert detail["progress_done"] == detail["progress_total"] == len(emps)
    assert detail["totals"]["employees"] == len(emps)
    assert detail["totals"]["net_minor"] == sum(p["net_minor"] for p in detail["payslips"])
    assert [e["to_status"] for e in detail["events"]] == ["draft", "calculating", "review"]
    assert detail["rates_verified"] is False and detail["unverified"]


async def test_preview_equals_calculate_for_the_same_inputs(client, tenant):
    """St03 risk 4: the preview and a calculated run share one calculator, so
    for the same inputs every payslip matches line for line."""
    emp = await new_employee(client, salary_minor=25_000_000, join_date="2026-09-16")
    await client.post(f"/payroll/employees/{tenant.employee_id}/compensation",
                      json={"effective_from": "2026-09-11", "base_minor": 9_000_000})
    preview = (await client.get(f"/hrms/payroll?month={MONTH}")).json()
    run = await new_run(client)
    detail = await calc(client, run["id"])
    stored = {p["employee_id"]: p for p in detail["payslips"]}
    assert set(stored) == {p["employee_id"] for p in preview["payslips"]}
    for pv in preview["payslips"]:
        st = stored[pv["employee_id"]]
        for k in ("gross_minor", "deductions_minor", "net_minor", "tax_minor", "employer_cost_minor"):
            assert pv[k] == st[k], (pv["name"], k)
        lines = (await client.get(f"/payroll/runs/{run['id']}/payslips/{st['id']}")).json()["lines"]
        assert [(ln["code"], ln["amount_minor"]) for ln in lines] == [
            (ln["code"], ln["amount_minor"]) for ln in pv["lines"]]
    assert stored[emp["id"]]["gross_minor"] == 12_500_000   # joined on the 16th: 15/30 days


async def test_a_payslip_keeps_a_snapshot_and_explains_its_lines(client, tenant):
    run = await new_run(client)
    detail = await calc(client, run["id"])
    slip = next(p for p in detail["payslips"] if p["employee_id"] == tenant.employee_id)
    full = (await client.get(f"/payroll/runs/{run['id']}/payslips/{slip['id']}")).json()
    assert full["snapshot"]["name"] == slip["name"]
    tax = next(ln for ln in full["lines"] if ln["code"] == "INCOME_TAX")
    assert tax["explain"]["tax_year"] == "TY2027" and "months_left" in tax["explain"]
    assert full["run_number"] == "PR-2026-09"


async def test_calculating_twice_rebuilds_rather_than_duplicates(client, tenant):
    run = await new_run(client)
    first = await calc(client, run["id"])
    again = await calc(client, run["id"])           # review → calculating → review
    assert len(again["payslips"]) == len(first["payslips"])
    assert {p["net_minor"] for p in again["payslips"]} == {p["net_minor"] for p in first["payslips"]}
    rows = await owner_fetch("select count(*) as n from payslips where run_id = $1", uuid.UUID(run["id"]))
    assert rows[0]["n"] == len(first["payslips"])


async def test_a_worker_that_dies_mid_run_leaves_it_for_the_next_pass(client, tenant, monkeypatch):
    run = await new_run(client)
    assert (await client.post(f"/payroll/runs/{run['id']}/calculate")).status_code == 202
    real = payroll_data.load_inputs
    calls = {"n": 0}

    async def dies_on_second_batch(*a, **kw):
        calls["n"] += 1
        if calls["n"] == 2:
            raise asyncio.CancelledError()    # the process being stopped, not an error
        return await real(*a, **kw)

    monkeypatch.setattr(payroll_data, "load_inputs", dies_on_second_batch)
    with pytest.raises(asyncio.CancelledError):
        await payroll_runs.calculate_run(tenant.tenant_id, run["id"], batch_size=2)
    mid = (await client.get(f"/payroll/runs/{run['id']}")).json()
    assert mid["status"] == "calculating" and mid["progress_done"] == 2
    monkeypatch.setattr(payroll_data, "load_inputs", real)
    await jobs.HANDLERS["payroll.calculate"]()
    done = (await client.get(f"/payroll/runs/{run['id']}")).json()
    emps = (await client.get("/hrms/employees")).json()
    assert done["status"] == "review" and len(done["payslips"]) == len(emps)


async def test_large_payrolls_run_in_batches_of_100_with_progress(client, tenant, monkeypatch):
    """QA-H13 (scaled down): 230 more employees → three batches."""
    await owner_execute(
        """insert into hrms_employees (tenant_id, name, salary_minor)
           select $1, 'Bulk ' || lpad(g::text, 3, '0'), 5000000 + g * 1000 from generate_series(1, 230) g""",
        uuid.UUID(tenant.tenant_id))
    batches = []
    real = payroll_runs.compute_batch

    async def counting(conn, run, ids):
        batches.append(len(ids))
        return await real(conn, run, ids)

    monkeypatch.setattr(payroll_runs, "compute_batch", counting)
    run = await new_run(client)
    detail = await calc(client, run["id"])
    total = len((await client.get("/hrms/employees")).json())
    assert batches == [100, 100, total - 200]
    assert detail["progress_done"] == detail["progress_total"] == total
    assert len(detail["payslips"]) == total


async def test_a_payslip_error_fails_the_run_until_fixed(client, tenant):
    emp = await new_employee(client, salary_minor=1_000_000, join_date="2026-01-01")
    r = await client.post("/payroll/one-offs", json={"employee_id": emp["id"], "month": MONTH, "code": "FINE",
                                                     "name": "Damage", "kind": "deduction",
                                                     "amount_minor": 5_000_000, "taxable": False})
    assert r.status_code == 201, r.text
    run = await new_run(client)
    detail = await calc(client, run["id"])
    assert detail["status"] == "failed" and "1 payslip" in detail["error"]
    bad = next(p for p in detail["payslips"] if p["employee_id"] == emp["id"])
    assert "more than pay" in bad["error"]
    assert (await client.post(f"/payroll/runs/{run['id']}/approve")).status_code == 409
    assert (await client.post(f"/payroll/one-offs/{r.json()['id']}/void")).status_code == 200
    assert (await calc(client, run["id"]))["status"] == "review"


# ── The state machine ────────────────────────────────────────────────────────
async def test_the_happy_path_to_locked(client, tenant):
    run = await paid_and_locked(client)
    assert run["status"] == "locked"
    assert [e["to_status"] for e in run["events"]] == ["draft", "calculating", "review", "approved", "paid", "locked"]
    assert run["approved_at"] and run["paid_at"] and run["locked_at"]


@pytest.mark.parametrize("step", ["approve", "mark-paid", "lock", "reopen"])
async def test_steps_out_of_order_are_409(client, tenant, step):
    run = await new_run(client)
    r = await client.post(f"/payroll/runs/{run['id']}/{step}", json={"note": "because"})
    assert r.status_code == 409


async def test_two_admins_approving_at_once_get_one_approval(client, tenant):
    """QA-H07."""
    run = await new_run(client)
    await calc(client, run["id"])
    results = await asyncio.gather(*(client.post(f"/payroll/runs/{run['id']}/approve") for _ in range(2)))
    assert sorted(r.status_code for r in results) == [200, 409]
    events = (await client.get(f"/payroll/runs/{run['id']}")).json()["events"]
    assert [e["to_status"] for e in events].count("approved") == 1


async def test_an_approved_run_can_be_reopened_with_a_reason(client, tenant):
    run = await new_run(client)
    await calc(client, run["id"])
    assert (await client.post(f"/payroll/runs/{run['id']}/approve")).status_code == 200
    assert (await client.post(f"/payroll/runs/{run['id']}/reopen", json={"note": ""})).status_code == 422
    r = await client.post(f"/payroll/runs/{run['id']}/reopen", json={"note": "Wrong bonus"})
    assert r.status_code == 200 and r.json()["status"] == "review"


async def test_approval_locks_the_months_attendance_and_reopen_unlocks_it(client, tenant):
    await owner_execute(
        """insert into hrms_attendance (tenant_id, employee_id, work_date, check_in, status)
           values ($1, $2, '2026-09-10', '2026-09-10T04:00:00Z', 'present')""",
        uuid.UUID(tenant.tenant_id), uuid.UUID(tenant.employee_id))
    run = await new_run(client)
    await calc(client, run["id"])
    await client.post(f"/payroll/runs/{run['id']}/approve")
    locked = await owner_fetch("select locked from hrms_attendance where employee_id = $1 and work_date = '2026-09-10'",
                               uuid.UUID(tenant.employee_id))
    assert locked[0]["locked"] is True
    await client.post(f"/payroll/runs/{run['id']}/reopen", json={"note": "Recheck"})
    locked = await owner_fetch("select locked from hrms_attendance where employee_id = $1 and work_date = '2026-09-10'",
                               uuid.UUID(tenant.employee_id))
    assert locked[0]["locked"] is False


async def test_cancelling_frees_the_month(client, tenant):
    run = await new_run(client)
    r = await client.post(f"/payroll/runs/{run['id']}/cancel", json={"note": "Wrong month"})
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    await new_run(client)   # the month is free again
    assert (await client.post(f"/payroll/runs/{run['id']}/calculate")).status_code == 409


async def test_cancelling_an_approved_run_needs_a_reason(client, tenant):
    run = await new_run(client)
    await calc(client, run["id"])
    await client.post(f"/payroll/runs/{run['id']}/approve")
    assert (await client.post(f"/payroll/runs/{run['id']}/cancel", json={"note": ""})).status_code == 422
    assert (await client.post(f"/payroll/runs/{run['id']}/cancel", json={"note": "Duplicate"})).status_code == 200


# ── Frozen after lock, in the database too (gate M6) ─────────────────────────
async def test_locked_payslips_cannot_change_even_for_the_owner(client, tenant):
    run = await paid_and_locked(client)
    rid = uuid.UUID(run["id"])
    with pytest.raises(asyncpg.RaiseError, match="frozen"):
        await owner_execute("update payslips set net_minor = 1 where run_id = $1", rid)
    with pytest.raises(asyncpg.RaiseError, match="frozen"):
        await owner_execute("update payslip_lines set amount_minor = 1 where run_id = $1", rid)
    with pytest.raises(asyncpg.RaiseError, match="frozen"):
        await owner_execute("delete from payslips where run_id = $1", rid)
    with pytest.raises(asyncpg.RaiseError, match="never changes"):
        await owner_execute("update payroll_runs set status = 'review' where id = $1", rid)
    with pytest.raises(asyncpg.RaiseError, match="never changes"):
        await owner_execute("update payroll_runs set note = 'x' where id = $1", rid)


async def test_the_database_refuses_an_illegal_transition(client, tenant):
    run = await new_run(client)
    with pytest.raises(asyncpg.RaiseError, match="can not go from draft to locked"):
        await owner_execute("update payroll_runs set status = 'locked' where id = $1", uuid.UUID(run["id"]))


async def test_payslips_of_a_review_run_are_frozen_too(client, tenant):
    run = await new_run(client)
    await calc(client, run["id"])
    conn = await asyncpg.connect(settings.app_database_url)
    try:
        async with conn.transaction():
            await conn.execute("select set_config('app.tenant_id', $1, true)", tenant.tenant_id)
            with pytest.raises(asyncpg.RaiseError, match="frozen"):
                await conn.execute("delete from payslips where run_id = $1", uuid.UUID(run["id"]))
    finally:
        await conn.close()


async def test_a_raise_after_lock_leaves_the_locked_payslip_alone(client, tenant):
    """QA-H03: the next run uses the new rate; the locked one never moves."""
    run = await paid_and_locked(client)
    before = next(p for p in run["payslips"] if p["employee_id"] == tenant.employee_id)
    await client.post(f"/payroll/employees/{tenant.employee_id}/compensation",
                      json={"effective_from": "2026-09-01", "base_minor": 99_000_000, "reason": "correction"})
    after = next(p for p in (await client.get(f"/payroll/runs/{run['id']}")).json()["payslips"]
                 if p["employee_id"] == tenant.employee_id)
    assert after == before
    preview = (await client.get(f"/hrms/payroll?month={MONTH}")).json()
    assert next(p for p in preview["payslips"] if p["employee_id"] == tenant.employee_id)["gross_minor"] == 99_000_000


# ── Corrections: adjustment runs (D-40, QA-H04) ──────────────────────────────
async def test_a_correction_after_lock_is_an_adjustment_run_paying_the_difference(client, tenant):
    run = await paid_and_locked(client)
    before = next(p for p in run["payslips"] if p["employee_id"] == tenant.employee_id)
    base = (await client.get(f"/payroll/employees/{tenant.employee_id}/compensation")).json()[0]["base_minor"]
    await client.post(f"/payroll/employees/{tenant.employee_id}/compensation",
                      json={"effective_from": "2026-09-01", "base_minor": base + 1_000_000, "reason": "correction"})
    adj = await new_run(client, kind="adjustment")
    assert adj["number"] == "PR-2026-09-A1" and adj["purpose"] == "correction"
    detail = await calc(client, adj["id"])
    assert [p["employee_id"] for p in detail["payslips"]] == [tenant.employee_id]   # only who changed
    slip = detail["payslips"][0]
    lines = (await client.get(f"/payroll/runs/{adj['id']}/payslips/{slip['id']}")).json()["lines"]
    basic = next(ln for ln in lines if ln["code"] == "BASIC")
    assert basic["amount_minor"] == 1_000_000
    assert basic["explain"]["previously_minor"] == base
    # The original payslip is untouched.
    again = next(p for p in (await client.get(f"/payroll/runs/{run['id']}")).json()["payslips"]
                 if p["employee_id"] == tenant.employee_id)
    assert again == before


async def test_an_adjustment_needs_a_paid_month(client, tenant):
    r = await client.post("/payroll/runs", json={"month": MONTH, "kind": "adjustment"})
    assert r.status_code == 409


# ── Permissions ──────────────────────────────────────────────────────────────
async def test_runs_need_payroll_keys(client, tenant, hr_clerk, payroll_reader):
    run = await new_run(client)
    assert (await hr_clerk.get("/payroll/runs")).status_code == 403
    assert (await hr_clerk.get(f"/payroll/runs/{run['id']}")).status_code == 403
    assert (await payroll_reader.get("/payroll/runs")).status_code == 200
    assert (await payroll_reader.post("/payroll/runs", json={"month": "2026-08"})).status_code == 403
    assert (await payroll_reader.post(f"/payroll/runs/{run['id']}/calculate")).status_code == 403


async def test_an_unknown_run_is_404(client, tenant):
    assert (await client.get(f"/payroll/runs/{uuid.uuid4()}")).status_code == 404
    assert (await client.get("/payroll/runs/not-a-uuid")).status_code == 404


async def test_bad_run_input_is_422(client, tenant):
    assert (await client.post("/payroll/runs", json={"month": "2026-13"})).status_code == 422
    assert (await client.post("/payroll/runs", json={"month": MONTH, "kind": "bonus"})).status_code == 422
    assert (await client.post("/payroll/runs", json={"month": MONTH, "employee_ids": [str(uuid.uuid4())]}
                              )).status_code == 422
