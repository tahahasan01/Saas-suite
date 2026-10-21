"""Leave v2: editable Pakistani templates, the append-only ledger with
accrual, carry-forward caps and expiry, half days, the manager → HR chain,
and the migration from 0021 (D-44, §7.11, QA-H11)."""
from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import asyncpg
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app import db, leave
from app.config import settings
from app.main import app
from app.security import SESSION_COOKIE

from .test_corrections import make_approver
from .test_employee_portal import _link_login


def monday(year: int, month: int, day: int = 1) -> date:
    d = date(year, month, day)
    while d.weekday() != 0:
        d += timedelta(days=1)
    return d


async def _owner():
    return await asyncpg.connect(settings.database_url)


async def _types(client) -> dict[str, dict]:
    return {t["code"]: t for t in (await client.get("/hrms/leave-types")).json()}


async def _ask(client, emp, frm: date, to: date, code="casual", **kw):
    return await client.post("/hrms/leave", json={"employee_id": emp, "leave_type": code,
                                                  "from_date": frm.isoformat(), "to_date": to.isoformat(), **kw})


async def _ledger(emp) -> list[asyncpg.Record]:
    conn = await _owner()
    try:
        return await conn.fetch(
            """select g.entry, g.days, g.cycle_start, lt.code from hrms_leave_ledger g
                 join hrms_leave_types lt on lt.id = g.leave_type_id
                where g.employee_id=$1 order by g.created_at""", uuid.UUID(emp))
    finally:
        await conn.close()


async def _balance(tenant, emp, code, on: date) -> dict:
    async with db.tenant_conn(tenant.tenant_id) as conn:
        bals = await leave.balances(conn, tenant.tenant_id, emp, on=on)
    return next(b.model_dump() for b in bals if b.leave_type == code)


# ── Types ───────────────────────────────────────────────────────────────────
async def test_pakistani_templates_are_seeded_and_editable(client, tenant):
    types = await _types(client)
    assert {"annual", "casual", "sick", "unpaid", "maternity", "wfh"} <= set(types)
    assert "Verify" in types["annual"]["statutory_note"]
    assert types["unpaid"]["paid"] is False and types["unpaid"]["requires_balance"] is False
    assert types["wfh"]["counts_as"] == "wfh"
    r = await client.patch(f"/hrms/leave-types/{types['casual']['id']}",
                           json={"name": "Casual / urgent", "days_per_year": 12})
    assert r.status_code == 200 and r.json()["name"] == "Casual / urgent"
    # A new type of the tenant's own.
    r = await client.post("/hrms/leave-types", json={"code": "hajj", "name": "Hajj leave", "requires_balance": False,
                                                     "grant_mode": "none", "approval": "hr"})
    assert r.status_code == 201, r.text
    assert (await client.post("/hrms/leave-types", json={"code": "hajj", "name": "x"})).status_code == 409
    assert (await client.post("/hrms/leave-types", json={"code": "Bad Code", "name": "x"})).status_code == 422


async def test_changing_days_per_year_tops_up_this_years_grant(client, tenant):
    emp = tenant.employee_id
    before = (await client.get(f"/hrms/leave/balances?employee_id={emp}")).json()
    assert next(b for b in before if b["leave_type"] == "casual")["quota"] == 10
    casual = (await _types(client))["casual"]
    await client.patch(f"/hrms/leave-types/{casual['id']}", json={"days_per_year": 12})
    after = (await client.get(f"/hrms/leave/balances?employee_id={emp}")).json()
    assert next(b for b in after if b["leave_type"] == "casual")["quota"] == 12
    assert [e["entry"] for e in await _ledger(emp) if e["code"] == "casual"].count("grant") == 2   # appended


# ── Half days ───────────────────────────────────────────────────────────────
async def test_a_half_day_costs_half(client, tenant):
    emp, d = tenant.employee_id, monday(2030, 3)
    r = await _ask(client, emp, d, d, from_half="am", to_half="am")
    assert r.status_code == 201, r.text
    assert r.json()["duration_days"] == 0.5
    assert (await client.post(f"/hrms/leave/{r.json()['id']}/approve")).status_code == 200
    taken = [e for e in await _ledger(emp) if e["entry"] == "taken"]
    assert [e["days"] for e in taken] == [Decimal("-0.50")]
    assert (await _balance(tenant, emp, "casual", d))["used"] == 0.5


async def test_a_longer_leave_starting_after_lunch(client, tenant):
    mon = monday(2030, 3)
    r = await _ask(client, tenant.employee_id, mon, mon + timedelta(days=2), from_half="pm", to_half="am")
    assert r.json()["duration_days"] == 2.0                    # ½ + 1 + ½


async def test_half_day_rules(client, tenant):
    mon, emp = monday(2030, 3), tenant.employee_id
    assert (await _ask(client, emp, mon, mon + timedelta(days=2), from_half="am")).status_code == 422
    assert (await _ask(client, emp, mon, mon, from_half="am", to_half="pm")).status_code == 422
    assert (await _ask(client, emp, mon, mon, code="maternity", from_half="am")).status_code == 422


async def test_holidays_and_off_days_are_not_charged(client, tenant):
    mon = monday(2030, 3)
    await client.post("/hrms/holidays", json={"holiday_date": (mon + timedelta(days=1)).isoformat(), "name": "H"})
    r = await _ask(client, tenant.employee_id, mon, mon + timedelta(days=6))      # Mon..Sun
    assert r.json()["duration_days"] == 5.0                    # minus Sunday and the holiday


async def test_a_blackout_blocks_requests(client, tenant):
    mon = monday(2030, 4)
    await client.post("/hrms/blackout-days", json={"name": "Eid sale", "date_from": mon.isoformat(),
                                                   "date_to": (mon + timedelta(days=5)).isoformat()})
    r = await _ask(client, tenant.employee_id, mon + timedelta(days=2), mon + timedelta(days=2))
    assert r.status_code == 409 and "Eid sale" in r.json()["detail"]


# ── The approval chain ──────────────────────────────────────────────────────
@pytest_asyncio.fixture
async def chain(client, tenant):
    """(worker id, manager client): the worker reports to the manager, whose
    login carries the approve key."""
    staff = [e["id"] for e in (await client.get("/hrms/employees")).json()]
    worker, manager = staff[0], staff[1]
    await client.patch(f"/hrms/employees/{worker}/job", json={"manager_id": manager})
    token = await _link_login(tenant.tenant_id, manager, f"m+{uuid.uuid4().hex[:8]}@example.com")
    m = AsyncClient(transport=ASGITransport(app=app), base_url="http://test", cookies={SESSION_COOKIE: token})
    await make_approver(tenant, manager)
    yield worker, m
    await m.aclose()


async def test_manager_then_hr(client, tenant, chain):
    worker, m = chain
    d = monday(2030, 5)
    req = (await _ask(client, worker, d, d)).json()
    assert req["approval_step"] == "manager"
    inbox = (await m.get("/me/approvals")).json()["leave"]
    assert [x["id"] for x in inbox] == [req["id"]]
    r = await m.post(f"/hrms/leave/{req['id']}/approve", json={"note": "fine by me"})
    assert r.status_code == 200, r.text
    assert (r.json()["status"], r.json()["approval_step"]) == ("pending", "hr")
    # The same person can't give the HR approval too.
    assert (await m.post(f"/hrms/leave/{req['id']}/approve")).status_code == 403
    r = await client.post(f"/hrms/leave/{req['id']}/approve")
    assert (r.json()["status"], r.json()["approval_step"]) == ("approved", "done")
    conn = await _owner()
    try:
        steps = [(a["step"], a["decision"]) for a in await conn.fetch(
            "select step, decision from hrms_leave_approvals where request_id=$1 order by decided_at",
            uuid.UUID(req["id"]))]
    finally:
        await conn.close()
    assert steps == [("manager", "approved"), ("hr", "approved")]


async def test_a_manager_only_type_is_done_after_the_manager(client, tenant, chain):
    worker, m = chain
    d = monday(2030, 5)
    req = (await _ask(client, worker, d, d, code="wfh")).json()
    assert req["request_type"] == "wfh"
    r = await m.post(f"/hrms/leave/{req['id']}/approve")
    assert r.json()["status"] == "approved"


async def test_without_a_manager_it_goes_straight_to_hr(client, tenant):
    d = monday(2030, 5)
    req = (await _ask(client, tenant.employee_id, d, d)).json()
    assert req["approval_step"] == "hr"


async def test_a_rejection_at_the_manager_step_ends_it(client, tenant, chain):
    worker, m = chain
    d = monday(2030, 5)
    req = (await _ask(client, worker, d, d)).json()
    assert (await m.post(f"/hrms/leave/{req['id']}/reject")).json()["status"] == "rejected"
    assert (await client.post(f"/hrms/leave/{req['id']}/approve")).status_code == 409


# ── The ledger ──────────────────────────────────────────────────────────────
async def test_the_ledger_is_append_only(client, tenant):
    await client.get(f"/hrms/leave/balances?employee_id={tenant.employee_id}")
    for sql in ("update hrms_leave_ledger set days = 99", "delete from hrms_leave_ledger"):
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            async with db.tenant_conn(tenant.tenant_id) as conn:
                await conn.execute(sql)


async def test_hr_adjusts_with_a_reason_but_not_their_own(client, tenant):
    emp = tenant.employee_id
    annual = (await _types(client))["annual"]
    r = await client.post("/hrms/leave/ledger/adjust", json={"employee_id": emp, "leave_type_id": annual["id"],
                                                            "days": 2, "note": "Worked on Eid"})
    assert r.status_code == 201, r.text
    assert next(b for b in r.json() if b["leave_type"] == "annual")["remaining"] == 16
    assert (await client.post("/hrms/leave/ledger/adjust", json={"employee_id": emp, "leave_type_id": annual["id"],
                                                                "days": 2, "note": ""})).status_code == 422
    entries = (await client.get(f"/hrms/leave/ledger?employee_id={emp}")).json()
    assert any(e["entry"] == "adjust" and e["note"] == "Worked on Eid" for e in entries)
    me = (await client.get("/auth/me")).json()["user"]["id"]
    conn = await _owner()
    try:
        await conn.execute("update hrms_employees set user_id=$1 where id=$2", uuid.UUID(me), uuid.UUID(emp))
    finally:
        await conn.close()
    assert (await client.post("/hrms/leave/ledger/adjust", json={"employee_id": emp, "leave_type_id": annual["id"],
                                                                "days": 2, "note": "me"})).status_code == 403


async def test_cancelling_approved_leave_gives_the_days_back(client, tenant):
    emp = tenant.employee_id
    d = date.today() + timedelta(days=40)
    while d.weekday() == 6:
        d += timedelta(days=1)
    req = (await _ask(client, emp, d, d)).json()
    await client.post(f"/hrms/leave/{req['id']}/approve")
    r = await client.post(f"/hrms/leave/{req['id']}/cancel")
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    entries = [e["entry"] for e in await _ledger(emp) if e["code"] == "casual"]
    assert "taken" in entries and entries[-1] == "reversal"   # grant and taken share a transaction
    bal = next(b for b in (await client.get(f"/hrms/leave/balances?employee_id={emp}")).json()
               if b["leave_type"] == "casual")
    assert bal["used"] == 0
    assert (await client.post(f"/hrms/leave/{req['id']}/cancel")).status_code == 409


async def test_a_payroll_locked_leave_cannot_be_cancelled(client, tenant):
    emp, d = tenant.employee_id, monday(2030, 6)
    req = (await _ask(client, emp, d, d)).json()
    await client.post(f"/hrms/leave/{req['id']}/approve")
    conn = await _owner()
    try:
        await conn.execute(
            """insert into hrms_attendance (tenant_id, employee_id, work_date, status, locked)
               values ($1, $2, $3, 'leave', true)""", uuid.UUID(tenant.tenant_id), uuid.UUID(emp), d)
    finally:
        await conn.close()
    assert (await client.post(f"/hrms/leave/{req['id']}/cancel")).status_code == 409


async def test_monthly_accrual_is_idempotent_and_capped(client, tenant):
    r = await client.post("/hrms/leave-types", json={"code": "earned", "name": "Earned leave",
                                                     "grant_mode": "monthly_accrual", "days_per_year": 12,
                                                     "max_balance_days": 2.5})
    assert r.status_code == 201, r.text
    emp = tenant.employee_id
    for _ in range(2):
        async with db.tenant_conn(tenant.tenant_id) as conn:
            await leave.run_entitlements(conn, on=date(2030, 2, 15))
    accruals = [e["days"] for e in await _ledger(emp) if e["code"] == "earned"]
    assert accruals == [Decimal("1.00"), Decimal("1.00")]           # Jan, Feb — once each
    async with db.tenant_conn(tenant.tenant_id) as conn:
        await leave.run_entitlements(conn, on=date(2030, 5, 2))
    assert (await _balance(tenant, emp, "earned", date(2030, 5, 2)))["remaining"] == 2.5   # the cap


async def test_carry_forward_is_capped_and_expires(client, tenant):
    r = await client.post("/hrms/leave-types", json={"code": "annual_x", "name": "Annual X", "days_per_year": 10,
                                                     "carry_forward": "capped", "carry_cap_days": 5,
                                                     "carry_expires_after_months": 3})
    assert r.status_code == 201, r.text
    emp = tenant.employee_id
    async with db.tenant_conn(tenant.tenant_id) as conn:
        await leave.run_entitlements(conn, on=date(2029, 6, 1))      # 10 granted, none used
        await leave.run_entitlements(conn, on=date(2030, 1, 2))      # 5 carried + 10
    assert (await _balance(tenant, emp, "annual_x", date(2030, 1, 2)))["remaining"] == 15
    async with db.tenant_conn(tenant.tenant_id) as conn:
        await leave.run_entitlements(conn, on=date(2030, 4, 2))
        await leave.run_entitlements(conn, on=date(2030, 4, 3))      # idempotent
    assert (await _balance(tenant, emp, "annual_x", date(2030, 4, 2)))["remaining"] == 10
    kinds = [e["entry"] for e in await _ledger(emp) if e["code"] == "annual_x"]
    assert kinds.count("carry_in") == 1 and kinds.count("carry_expire") == 1


async def test_a_joiner_mid_year_gets_a_prorated_grant(client, tenant):
    emp = tenant.employee_id
    conn = await _owner()
    try:
        await conn.execute("update hrms_employees set join_date='2030-07-01' where id=$1", uuid.UUID(emp))
    finally:
        await conn.close()
    assert (await _balance(tenant, emp, "annual", date(2030, 8, 1)))["quota"] == 7    # 14 × 6/12


async def test_payroll_reads_unpaid_days_for_a_period(client, tenant):
    emp, mon = tenant.employee_id, monday(2030, 9)
    req = (await _ask(client, emp, mon, mon + timedelta(days=1), code="unpaid", to_half="am")).json()
    await client.post(f"/hrms/leave/{req['id']}/approve")
    paid = (await _ask(client, emp, mon + timedelta(days=3), mon + timedelta(days=3))).json()
    await client.post(f"/hrms/leave/{paid['id']}/approve")
    async with db.tenant_conn(tenant.tenant_id) as conn:
        assert await leave.unpaid_leave_days(conn, emp, mon, mon + timedelta(days=30)) == Decimal("1.5")
        assert await leave.unpaid_leave_days(conn, emp, mon + timedelta(days=1), mon + timedelta(days=30)) == \
            Decimal("0.5")
        period = await leave.leave_in_period(conn, emp, mon, mon + timedelta(days=30))
    assert period.paid == 1 and period.days[mon] == ("unpaid", 1)


# ── Self-service ────────────────────────────────────────────────────────────
async def test_an_employee_cancels_their_own_pending_request(client, tenant):
    token = await _link_login(tenant.tenant_id, tenant.employee_id, f"p+{uuid.uuid4().hex[:8]}@example.com")
    p = AsyncClient(transport=ASGITransport(app=app), base_url="http://test", cookies={SESSION_COOKIE: token})
    try:
        types = (await p.get("/me/leave-types")).json()
        assert "casual" in {t["code"] for t in types}
        d = monday(2030, 10)
        req = (await p.post("/me/leave", json={"employee_id": tenant.employee_id, "leave_type": "casual",
                                               "from_date": d.isoformat(), "to_date": d.isoformat(),
                                               "from_half": "pm", "to_half": "pm"})).json()
        assert req["duration_days"] == 0.5
        r = await p.post(f"/me/leave/{req['id']}/cancel")
        assert r.status_code == 200 and r.json()["status"] == "cancelled"
        other = (await _ask(client, [e["id"] for e in (await client.get("/hrms/employees")).json()][1], d, d)).json()
        assert (await p.post(f"/me/leave/{other['id']}/cancel")).status_code == 404
    finally:
        await p.aclose()


# ── Migration (§7.11) ───────────────────────────────────────────────────────
async def test_backfill_ledger_balance_equals_the_old_derived_balance(client, tenant):
    """A request from before the ledger (no type id, no ledger rows) gets its
    type, its duration and a ledger whose balance is the old quota − used."""
    emp = uuid.UUID(tenant.employee_id)
    tid = uuid.UUID(tenant.tenant_id)
    conn = await _owner()
    try:
        year = await conn.fetchval("select extract(year from tenant_today('Asia/Karachi'))::int")
        mon = monday(year, 2)
        await conn.execute("update hrms_leave_policies set annual_days=16 where tenant_id=$1", tid)
        await conn.execute("update hrms_leave_types set days_per_year=16 where tenant_id=$1 and code='annual'", tid)
        await conn.execute("delete from hrms_leave_ledger where employee_id=$1", emp)
        rid = await conn.fetchval(
            """insert into hrms_leave_requests (tenant_id, employee_id, request_type, leave_type, from_date, to_date,
                                                status)
               values ($1,$2,'leave','annual',$3,$4,'approved') returning id""",
            tid, emp, mon, mon + timedelta(days=6))                   # Mon..Sun: 6 working days
        await conn.execute("select hrms_backfill_leave_v2()")
        await conn.execute("select hrms_backfill_leave_v2()")          # re-runnable
        r = await conn.fetchrow("select leave_type_id, duration_days, approval_step from hrms_leave_requests "
                                "where id=$1", rid)
        balance = await conn.fetchval(
            """select sum(g.days) from hrms_leave_ledger g join hrms_leave_types lt on lt.id = g.leave_type_id
                where g.employee_id=$1 and lt.code='annual' and g.cycle_start=make_date($2, 1, 1)""", emp, year)
    finally:
        await conn.close()
    assert r["leave_type_id"] is not None and r["duration_days"] == 6 and r["approval_step"] == "done"
    assert balance == 16 - 6


async def test_the_entitlement_job_is_registered(client, tenant):
    from app import jobs
    assert "hrms.leave_entitlements" in jobs.HANDLERS
