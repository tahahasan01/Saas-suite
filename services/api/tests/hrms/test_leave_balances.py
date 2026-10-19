"""Leave balances and quota enforcement.

Before this, approving leave changed nothing but a status string — nothing
stopped approving 400 days of annual leave, and overlapping requests stacked
silently.
"""
from __future__ import annotations

from datetime import date, timedelta


def _week_of(base: date, days: int) -> tuple[str, str]:
    """A span of `days` calendar days starting at `base`."""
    return base.isoformat(), (base + timedelta(days=days - 1)).isoformat()


async def _request(client, employee_id, from_date, to_date, leave_type="annual"):
    return await client.post("/hrms/leave", json={
        "employee_id": employee_id, "request_type": "leave", "leave_type": leave_type,
        "from_date": from_date, "to_date": to_date,
    })


async def test_balances_start_at_the_policy_quota(client, tenant):
    r = await client.get(f"/hrms/leave/balances?employee_id={tenant.employee_id}")
    balances = {b["leave_type"]: b for b in r.json()}
    assert balances["annual"] == {"leave_type": "annual", "quota": 14, "used": 0, "remaining": 14}
    assert balances["sick"]["quota"] == 10
    assert balances["casual"]["quota"] == 10


async def test_approved_leave_draws_down_the_balance(client, tenant):
    frm, to = _week_of(date.today() + timedelta(days=7), 3)
    req = (await _request(client, tenant.employee_id, frm, to)).json()
    # Pending doesn't count…
    balances = (await client.get(f"/hrms/leave/balances?employee_id={tenant.employee_id}")).json()
    assert next(b for b in balances if b["leave_type"] == "annual")["used"] == 0

    assert (await client.post(f"/hrms/leave/{req['id']}/approve")).status_code == 200
    balances = (await client.get(f"/hrms/leave/balances?employee_id={tenant.employee_id}")).json()
    annual = next(b for b in balances if b["leave_type"] == "annual")
    # 3 calendar days minus any weekly off / holiday inside the span.
    assert 1 <= annual["used"] <= 3
    assert annual["remaining"] == annual["quota"] - annual["used"]


async def test_approval_beyond_the_quota_is_refused(client, tenant):
    frm, to = _week_of(date.today() + timedelta(days=30), 30)  # ~25 working days > 14 quota
    req = (await _request(client, tenant.employee_id, frm, to)).json()
    r = await client.post(f"/hrms/leave/{req['id']}/approve")
    assert r.status_code == 409
    assert "remain this year" in r.json()["detail"]


async def test_unpaid_leave_has_no_quota(client, tenant):
    frm, to = _week_of(date.today() + timedelta(days=30), 30)
    req = (await _request(client, tenant.employee_id, frm, to, leave_type="unpaid")).json()
    assert (await client.post(f"/hrms/leave/{req['id']}/approve")).status_code == 200


async def test_overlapping_requests_are_refused(client, tenant):
    frm, to = _week_of(date.today() + timedelta(days=14), 5)
    assert (await _request(client, tenant.employee_id, frm, to)).status_code == 201
    # A second request touching any of those days — even one day, even WFH.
    r = await client.post("/hrms/leave", json={
        "employee_id": tenant.employee_id, "request_type": "wfh",
        "from_date": to, "to_date": to,
    })
    assert r.status_code == 409
    assert "Overlaps" in r.json()["detail"]


async def test_weekends_do_not_consume_quota(client, tenant):
    """A Friday→Monday request must cost 2 working days, not 4."""
    d = date.today() + timedelta(days=45)
    while d.weekday() != 4:  # find a Friday
        d += timedelta(days=1)
    frm, to = d.isoformat(), (d + timedelta(days=3)).isoformat()  # Fri..Mon
    req = (await _request(client, tenant.employee_id, frm, to)).json()
    await client.post(f"/hrms/leave/{req['id']}/approve")

    balances = (await client.get(f"/hrms/leave/balances?employee_id={tenant.employee_id}")).json()
    annual = next(b for b in balances if b["leave_type"] == "annual")
    assert annual["used"] == 3  # Fri, Sat, Mon — Sunday is the default weekly off


async def test_policy_is_editable(client, tenant):
    r = await client.put("/hrms/leave/policy", json={"annual_days": 20})
    assert r.json()["annual_days"] == 20
    balances = (await client.get(f"/hrms/leave/balances?employee_id={tenant.employee_id}")).json()
    assert next(b for b in balances if b["leave_type"] == "annual")["quota"] == 20
