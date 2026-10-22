"""Biometric attendance import (wave A, H6, St10): a ZKTeco-style attendance
log as CSV becomes punches (method 'biometric') and re-derived days. Matched
by employee code, read in the tenant's time zone, duplicate-safe, with every
problem reported rather than guessed."""
from __future__ import annotations

from datetime import date, timedelta

from ..core.test_rbac_v2 import _role, _user_on


def _csv(rows: list[str], header: str = "AC-No.,Time,State") -> bytes:
    return ("\n".join([header, *rows]) + "\n").encode()


async def _upload(client, body: bytes):
    return await client.post("/hrms/attendance/import", content=body, headers={"Content-Type": "text/csv"})


async def test_a_device_log_becomes_punches_and_a_worked_day(client, tenant):
    await client.patch(f"/hrms/employees/{tenant.employee_id}/job", json={"code": "1001"})
    day = date.today() - timedelta(days=3)
    body = _csv([f"1001,{day} 09:02:00,C/In", f"1001,{day} 17:31:00,C/Out"])
    r = await _upload(client, body)
    assert r.status_code == 200, r.text
    assert r.json()["imported"] == 2 and r.json()["duplicates"] == 0 and r.json()["unknown_codes"] == []
    row = next(a for a in (await client.get(f"/hrms/attendance?on={day}")).json()
               if a["employee_id"] == tenant.employee_id)
    assert row["worked_min"] >= 500

    again = (await _upload(client, body)).json()
    assert again["imported"] == 0 and again["duplicates"] == 2          # the same file twice adds nothing


async def test_without_a_state_column_punches_alternate_in_and_out(client, tenant):
    await client.patch(f"/hrms/employees/{tenant.employee_id}/job", json={"code": "2002"})
    day = date.today() - timedelta(days=4)
    r = await _upload(client, _csv([f"2002,{day} 17:00", f"2002,{day} 09:00"], header="User ID,Date Time"))
    assert r.status_code == 200, r.text
    assert r.json()["imported"] == 2                                     # sorted by time: in, then out


async def test_problems_are_reported_not_guessed(client, tenant):
    await client.patch(f"/hrms/employees/{tenant.employee_id}/job", json={"code": "3003"})
    day = date.today() - timedelta(days=5)
    r = await _upload(client, _csv([f"9999,{day} 09:00,C/In", "3003,not a time,C/In", f"3003,{day} 09:00,C/In"]))
    body = r.json()
    assert body["imported"] == 1 and body["unknown_codes"] == ["9999"]
    assert [e["row"] for e in body["errors"]] == [3]
    assert (await _upload(client, b"Name,Shoe size\nx,9\n")).status_code == 422   # not an attendance log


async def test_importing_needs_the_attendance_write_key(client, tenant):
    rid = await _role(client, [{"permission_key": "hrms.attendance.read", "scope": "all"}])
    mate, _, _ = await _user_on(client, [rid])
    try:
        assert (await _upload(mate, _csv(["1,2026-01-01 09:00,C/In"]))).status_code == 403
    finally:
        await mate.aclose()
