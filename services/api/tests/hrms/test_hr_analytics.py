"""HR analytics (wave C, H39, St12): headcount, joiners, leavers, attrition, absenteeism.

Per month: headcount at the month's end (joined by then and not yet left),
joiners (joined that month) and leavers (last day that month). Attrition is
leavers over the average headcount for the range; leaving reasons and
departments are counted too. Employees switched off before exit dates
existed (no exit date) are left out.
"""
from __future__ import annotations

from .payroll_helpers import new_employee, owner_execute


async def _leave(client, eid: str, day: str, reason: str = "resigned") -> None:
    r = await client.post(f"/hrms/employees/{eid}/offboarding", json={"reason": reason, "last_working_day": day})
    assert r.status_code == 201, r.text


async def test_months_count_headcount_joiners_and_leavers(client, tenant):
    # The signup's own staff joined "now"; pin everyone else to known dates.
    await owner_execute("update hrms_employees set join_date = '2020-01-01' where tenant_id = $1::uuid",
                        tenant.tenant_id)
    base = (await client.get("/hrms/analytics", params={"from": "2026-01", "to": "2026-03"})).json()
    start = base["months"][0]["headcount"]

    a = await new_employee(client, name="Jan joiner", join_date="2026-01-10")
    b = await new_employee(client, name="Feb joiner", join_date="2026-02-03")
    await _leave(client, a["id"], "2026-03-20", "resigned")
    old = await new_employee(client, name="Long timer", join_date="2019-05-01")
    await _leave(client, old["id"], "2026-02-28", "retired")

    r = await client.get("/hrms/analytics", params={"from": "2026-01", "to": "2026-03"})
    assert r.status_code == 200, r.text
    m = {x["month"]: x for x in r.json()["months"]}
    assert (m["2026-01"]["joiners"], m["2026-01"]["leavers"], m["2026-01"]["headcount"]) == (1, 0, start + 2)
    assert (m["2026-02"]["joiners"], m["2026-02"]["leavers"], m["2026-02"]["headcount"]) == (1, 1, start + 2)
    assert (m["2026-03"]["joiners"], m["2026-03"]["leavers"], m["2026-03"]["headcount"]) == (0, 1, start + 1)
    out = r.json()
    assert out["joiners"] == 2 and out["leavers"] == 2
    avg = (m["2026-01"]["headcount"] + m["2026-02"]["headcount"] + m["2026-03"]["headcount"]) / 3
    assert out["attrition_pct"] == round(2 / avg * 100, 1)
    assert out["leaving_reasons"] == {"resigned": 1, "retired": 1}
    assert b["id"]


async def test_departments_and_switched_off_people(client, tenant):
    dept = (await client.post("/hrms/departments", json={"name": "Warehouse"})).json()
    e = await new_employee(client, name="Packer", join_date="2025-06-01")
    await client.patch(f"/hrms/employees/{e['id']}/job", json={"department_id": dept["id"]})
    gone = await new_employee(client, name="Old record", join_date="2025-06-01")
    await owner_execute("update hrms_employees set status = 'inactive' where id = $1::uuid", gone["id"])
    out = (await client.get("/hrms/analytics", params={"from": "2026-01", "to": "2026-01"})).json()
    rows = {d["department"]: d for d in out["by_department"]}
    assert rows["Warehouse"]["headcount"] == 1
    assert "absenteeism_pct" in out


async def test_analytics_check_their_input_and_need_staff_read(client, tenant):
    assert (await client.get("/hrms/analytics", params={"from": "2026-05", "to": "2026-01"})).status_code == 422
    assert (await client.get("/hrms/analytics", params={"from": "2020-01", "to": "2026-01"})).status_code == 422
    from ..core.test_rbac_v2 import _role, _user_on
    rid = await _role(client, [{"permission_key": "hrms.leave.read", "scope": "all"}])
    mate, _, _ = await _user_on(client, [rid])
    try:
        assert (await mate.get("/hrms/analytics")).status_code == 403
    finally:
        await mate.aclose()
