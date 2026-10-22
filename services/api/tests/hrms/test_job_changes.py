"""Promotions and transfers with history (wave C, H30, St12, 0106).

A job change has an effective date and any of: a new job title,
department, location, manager and (with payroll.salary.update) a new
salary. It applies at once when the date has come, otherwise the daily job
applies it on the day. The history keeps what it was and what it became,
by name, so a renamed department doesn't rewrite someone's career.
"""
from __future__ import annotations

from datetime import date, timedelta

from app import jobs

from ..core.test_rbac_v2 import _role, _user_on
from .payroll_helpers import new_employee, owner_execute, owner_fetch

TODAY = date.today()


async def _title(client, name: str) -> str:
    r = await client.post("/hrms/job-titles", json={"name": name})
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _dept(client, name: str) -> str:
    r = await client.post("/hrms/departments", json={"name": name})
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def test_a_promotion_today_applies_at_once_with_a_raise(client, tenant):
    e = await new_employee(client, name="Bilal", salary_minor=6_000_000, join_date="2024-01-01")
    junior, senior = await _title(client, "Sales assistant"), await _title(client, "Senior sales assistant")
    await client.patch(f"/hrms/employees/{e['id']}/job", json={"job_title_id": junior})

    r = await client.post(f"/hrms/employees/{e['id']}/job-changes", json={
        "kind": "promotion", "effective_on": TODAY.isoformat(), "job_title_id": senior,
        "new_base_minor": 7_500_000, "note": "Best seller of the year"})
    assert r.status_code == 201, r.text
    ch = r.json()
    assert ch["status"] == "applied"
    assert (ch["from_title"], ch["to_title"]) == ("Sales assistant", "Senior sales assistant")
    assert (ch["old_base_minor"], ch["new_base_minor"]) == (6_000_000, 7_500_000)
    p = (await client.get(f"/hrms/employees/{e['id']}")).json()
    assert p["job_title_id"] == senior and p["designation"] == "Senior sales assistant"
    comp = await owner_fetch("""select base_minor, reason, effective_from from hrms_compensation
                                 where employee_id = $1::uuid order by effective_from desc, seq desc limit 1""", e["id"])
    assert (comp[0]["base_minor"], comp[0]["reason"], comp[0]["effective_from"]) == (7_500_000, "promotion", TODAY)

    # Renaming the title later doesn't rewrite the history.
    await client.patch(f"/hrms/job-titles/{senior}", json={"name": "Lead sales"})
    hist = (await client.get(f"/hrms/employees/{e['id']}/job-changes")).json()
    assert hist[0]["to_title"] == "Senior sales assistant"


async def test_a_future_transfer_waits_for_its_day(client, tenant):
    e = await new_employee(client, name="Hina")
    a, b = await _dept(client, "Lahore shop"), await _dept(client, "Karachi shop")
    await client.patch(f"/hrms/employees/{e['id']}/job", json={"department_id": a})
    soon = TODAY + timedelta(days=5)
    ch = (await client.post(f"/hrms/employees/{e['id']}/job-changes", json={
        "kind": "transfer", "effective_on": soon.isoformat(), "department_id": b})).json()
    assert ch["status"] == "scheduled"
    assert (await client.get(f"/hrms/employees/{e['id']}")).json()["department_id"] == a

    # The day comes (moved back here), and the daily job applies it.
    await owner_execute("update hrms_job_changes set effective_on = current_date where id = $1::uuid", ch["id"])
    await jobs.HANDLERS["hrms.apply_job_changes"]()
    p = (await client.get(f"/hrms/employees/{e['id']}")).json()
    assert p["department_id"] == b and p["department"] == "Karachi shop"
    hist = (await client.get(f"/hrms/employees/{e['id']}/job-changes")).json()
    assert hist[0]["status"] == "applied" and (hist[0]["from_department"], hist[0]["to_department"]) == \
        ("Lahore shop", "Karachi shop")


async def test_a_scheduled_change_can_be_cancelled_an_applied_one_cannot(client, tenant):
    e = await new_employee(client, name="Omar")
    t = await _title(client, "Supervisor")
    later = (await client.post(f"/hrms/employees/{e['id']}/job-changes", json={
        "kind": "promotion", "effective_on": (TODAY + timedelta(days=30)).isoformat(), "job_title_id": t})).json()
    r = await client.post(f"/hrms/job-changes/{later['id']}/cancel")
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    now = (await client.post(f"/hrms/employees/{e['id']}/job-changes", json={
        "kind": "change", "effective_on": TODAY.isoformat(), "job_title_id": t})).json()
    assert (await client.post(f"/hrms/job-changes/{now['id']}/cancel")).status_code == 409


async def test_a_change_must_change_something_and_pay_needs_payroll_rights(client, tenant):
    e = await new_employee(client, name="Sara")
    nothing = await client.post(f"/hrms/employees/{e['id']}/job-changes",
                                json={"kind": "promotion", "effective_on": TODAY.isoformat()})
    assert nothing.status_code == 422
    rid = await _role(client, [{"permission_key": "hrms.employee.read", "scope": "all"},
                               {"permission_key": "hrms.employee.update", "scope": "all"}])
    clerk, _, _ = await _user_on(client, [rid])
    try:
        r = await clerk.post(f"/hrms/employees/{e['id']}/job-changes", json={
            "kind": "promotion", "effective_on": TODAY.isoformat(), "new_base_minor": 9_000_000})
        assert r.status_code == 403
        mgr = (await client.post("/hrms/employees", json={"name": "Boss"})).json()["id"]
        r = await clerk.post(f"/hrms/employees/{e['id']}/job-changes", json={
            "kind": "transfer", "effective_on": TODAY.isoformat(), "manager_id": mgr})
        assert r.status_code == 403                                        # reporting lines need hrms.org.manage
        hist = (await clerk.get(f"/hrms/employees/{e['id']}/job-changes")).json()
        assert hist == []
    finally:
        await clerk.aclose()


async def test_nobody_changes_their_own_job_or_pay(client, tenant):
    """Security review: an HR user linked to their own staff record can't
    promote themselves or raise their own salary."""
    me_user = (await client.get("/auth/me")).json()["user"]["id"]
    await owner_execute("update hrms_employees set user_id = $1::uuid where id = $2::uuid", me_user, tenant.employee_id)
    t = await _title(client, "Director")
    for body in ({"job_title_id": t}, {"new_base_minor": 99_000_000}):
        r = await client.post(f"/hrms/employees/{tenant.employee_id}/job-changes",
                              json={"kind": "promotion", "effective_on": TODAY.isoformat(), **body})
        assert r.status_code == 403, r.text
