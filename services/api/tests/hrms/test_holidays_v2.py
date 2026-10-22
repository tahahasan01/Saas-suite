"""Holiday calendars per province, a CSV-importable federal list, and
blackout days (checklist 3F, D-44, P3). Nothing is hard-coded: Eid and
Muharram move every year, and a Sindh holiday is not a Punjab one."""
from __future__ import annotations

import uuid
from datetime import date

import asyncpg

from app import db, holidays, payroll_data
from app.config import settings


async def _calendars(client) -> dict[str, dict]:
    return {c["name"]: c for c in (await client.get("/hrms/holiday-calendars")).json()}


async def test_every_tenant_has_a_federal_calendar(client, tenant):
    cals = await _calendars(client)
    fed = [c for c in cals.values() if c["scope"] == "federal"]
    assert len(fed) == 1 and fed[0]["province"] is None


async def test_legacy_holidays_land_in_the_federal_calendar(client, tenant):
    r = await client.post("/hrms/holidays", json={"holiday_date": "2030-03-23", "name": "Pakistan Day"})
    assert r.status_code == 201, r.text
    h = r.json()
    fed = next(c for c in (await _calendars(client)).values() if c["scope"] == "federal")
    assert h["calendar_id"] == fed["id"] and h["kind"] == "public"


async def test_a_province_calendar_needs_a_province(client, tenant):
    r = await client.post("/hrms/holiday-calendars", json={"name": "Sindh", "scope": "province"})
    assert r.status_code == 422
    r = await client.post("/hrms/holiday-calendars", json={"name": "Sindh", "scope": "province", "province": "SD"})
    assert r.status_code == 201, r.text
    assert (await client.post("/hrms/holiday-calendars",
                              json={"name": "sindh", "scope": "province", "province": "SD"})).status_code == 409


async def test_csv_import_into_a_calendar(client, tenant):
    fed = next(c for c in (await _calendars(client)).values() if c["scope"] == "federal")
    csv = ("Date,Name,Kind,Half day\n"
           "2030-02-05,Kashmir Day,public,\n"
           "23/03/2030,Pakistan Day,,\n"
           "2030-04-10,Eid ul Fitr (expected),public,no\n"
           "2030-12-24,Christmas Eve,optional,yes\n"
           "not-a-date,Broken,,\n"
           "2030-02-05,Kashmir Day again,,\n")
    r = await client.post(f"/hrms/holidays/import?calendar_id={fed['id']}", content=csv.encode(),
                          headers={"content-type": "text/csv"})
    assert r.status_code == 200, r.text
    res = r.json()
    assert res["created"] == 4 and res["skipped_duplicates"] == 1
    assert [e["row"] for e in res["errors"]] == [6]
    rows = {h["holiday_date"]: h for h in (await client.get(f"/hrms/holidays?calendar_id={fed['id']}")).json()}
    assert rows["2030-03-23"]["name"] == "Pakistan Day"
    assert rows["2030-12-24"]["kind"] == "optional" and rows["2030-12-24"]["half_day"] is True
    assert rows["2030-02-05"]["name"] == "Kashmir Day"          # an import never renames


async def test_import_needs_date_and_name_columns(client, tenant):
    fed = next(c for c in (await _calendars(client)).values() if c["scope"] == "federal")
    r = await client.post(f"/hrms/holidays/import?calendar_id={fed['id']}", content=b"Name\nX\n",
                          headers={"content-type": "text/csv"})
    assert r.status_code == 422


async def test_an_employee_gets_federal_plus_their_province_only(client, tenant):
    emp = tenant.employee_id
    fed = next(c for c in (await _calendars(client)).values() if c["scope"] == "federal")
    sd = (await client.post("/hrms/holiday-calendars",
                            json={"name": "Sindh", "scope": "province", "province": "SD"})).json()
    pb = (await client.post("/hrms/holiday-calendars",
                            json={"name": "Punjab", "scope": "province", "province": "PB"})).json()
    for cal, d, name in ((fed, "2030-08-14", "Independence Day"), (sd, "2030-07-05", "Sindh day"),
                         (pb, "2030-07-06", "Punjab day")):
        assert (await client.post("/hrms/holidays", json={"holiday_date": d, "name": name,
                                                          "calendar_id": cal["id"]})).status_code == 201
    await client.post("/hrms/holidays", json={"holiday_date": "2030-07-07", "name": "Optional",
                                              "calendar_id": fed["id"], "kind": "optional"})
    loc = (await client.post("/hrms/locations", json={"name": "Karachi office", "province": "SD"})).json()
    await client.patch(f"/hrms/employees/{emp}/job", json={"location_id": loc["id"]})
    async with db.tenant_conn(tenant.tenant_id) as conn:
        days = await holidays.for_employee(conn, emp, date(2030, 7, 1), date(2030, 8, 31))
    assert set(days) == {date(2030, 7, 5), date(2030, 8, 14)}      # not Punjab's, not the optional one


async def test_without_a_location_only_federal_and_company_days_apply(client, tenant):
    co = (await client.post("/hrms/holiday-calendars", json={"name": "Company", "scope": "company"})).json()
    sd = (await client.post("/hrms/holiday-calendars",
                            json={"name": "Sindh", "scope": "province", "province": "SD"})).json()
    await client.post("/hrms/holidays", json={"holiday_date": "2030-06-01", "name": "Founders day",
                                              "calendar_id": co["id"], "kind": "company"})
    await client.post("/hrms/holidays", json={"holiday_date": "2030-06-02", "name": "Sindh only",
                                              "calendar_id": sd["id"]})
    async with db.tenant_conn(tenant.tenant_id) as conn:
        days = await holidays.for_employee(conn, tenant.employee_id, date(2030, 6, 1), date(2030, 6, 30))
    assert set(days) == {date(2030, 6, 1)}


async def test_one_date_per_calendar_and_a_repeat_renames(client, tenant):
    r1 = (await client.post("/hrms/holidays", json={"holiday_date": "2030-05-01", "name": "Labour"})).json()
    r2 = (await client.post("/hrms/holidays", json={"holiday_date": "2030-05-01", "name": "Labour Day"})).json()
    assert r1["id"] == r2["id"] and r2["name"] == "Labour Day"
    # The same date in another calendar is a different holiday.
    sd = (await client.post("/hrms/holiday-calendars",
                            json={"name": "Sindh", "scope": "province", "province": "SD"})).json()
    r3 = (await client.post("/hrms/holidays", json={"holiday_date": "2030-05-01", "name": "Labour",
                                                    "calendar_id": sd["id"]})).json()
    assert r3["id"] != r1["id"]


async def test_a_province_calendar_can_be_deleted_the_federal_one_cannot(client, tenant):
    cals = await _calendars(client)
    fed = next(c for c in cals.values() if c["scope"] == "federal")
    assert (await client.delete(f"/hrms/holiday-calendars/{fed['id']}")).status_code == 409
    sd = (await client.post("/hrms/holiday-calendars",
                            json={"name": "Sindh", "scope": "province", "province": "SD"})).json()
    await client.post("/hrms/holidays", json={"holiday_date": "2030-07-05", "name": "x", "calendar_id": sd["id"]})
    assert (await client.delete(f"/hrms/holiday-calendars/{sd['id']}")).status_code == 204
    assert all(h["calendar_id"] != sd["id"] for h in (await client.get("/hrms/holidays")).json())


async def test_blackout_days(client, tenant):
    r = await client.post("/hrms/blackout-days", json={"name": "Eid sale week", "date_from": "2030-04-01",
                                                       "date_to": "2030-04-07"})
    assert r.status_code == 201, r.text
    bid = r.json()["id"]
    assert (await client.post("/hrms/blackout-days", json={"name": "x", "date_from": "2030-04-07",
                                                           "date_to": "2030-04-01"})).status_code == 422
    listed = (await client.get("/hrms/blackout-days")).json()
    assert [b["id"] for b in listed] == [bid]
    async with db.tenant_conn(tenant.tenant_id) as conn:
        hit = await holidays.blackout_for(conn, tenant.employee_id, date(2030, 4, 6), date(2030, 4, 9))
    assert hit and hit.name == "Eid sale week"
    assert (await client.delete(f"/hrms/blackout-days/{bid}")).status_code == 204


async def test_a_blackout_can_be_scoped_to_a_location(client, tenant):
    loc = (await client.post("/hrms/locations", json={"name": "Warehouse"})).json()
    await client.post("/hrms/blackout-days", json={"name": "Stock take", "date_from": "2030-06-30",
                                                   "date_to": "2030-06-30", "location_id": loc["id"]})
    async with db.tenant_conn(tenant.tenant_id) as conn:
        assert await holidays.blackout_for(conn, tenant.employee_id, date(2030, 6, 30), date(2030, 6, 30)) is None
    await client.patch(f"/hrms/employees/{tenant.employee_id}/job", json={"location_id": loc["id"]})
    async with db.tenant_conn(tenant.tenant_id) as conn:
        assert await holidays.blackout_for(conn, tenant.employee_id, date(2030, 6, 30), date(2030, 6, 30))


async def test_migration_moved_existing_holidays_into_federal_calendars(client, tenant):
    conn = await asyncpg.connect(settings.database_url)
    try:
        orphans = await conn.fetchval("select count(*) from hrms_holidays where calendar_id is null")
    finally:
        await conn.close()
    assert orphans == 0


async def test_editing_holidays_needs_the_holiday_key(client, tenant):
    conn = await asyncpg.connect(settings.database_url)
    try:
        await conn.execute("update permissions set action='read' where section='hrms' and tenant_id=$1",
                           uuid.UUID(tenant.tenant_id))
    finally:
        await conn.close()
    assert (await client.get("/hrms/holidays")).status_code == 200
    assert (await client.post("/hrms/holidays", json={"holiday_date": "2030-01-01", "name": "x"})).status_code == 403
    assert (await client.post("/hrms/holiday-calendars", json={"name": "C", "scope": "company"})).status_code == 403


async def test_payroll_working_days_follow_the_employees_own_holidays(client, tenant):
    """Payroll used to drop every holiday in the tenant: a Punjab holiday or
    an optional day shortened a Karachi employee's month and raised their
    per-day deduction. Only federal, company and their province's days count."""
    emp = tenant.employee_id
    fed = next(c for c in (await _calendars(client)).values() if c["scope"] == "federal")
    sd = (await client.post("/hrms/holiday-calendars",
                            json={"name": "Sindh", "scope": "province", "province": "SD"})).json()
    pb = (await client.post("/hrms/holiday-calendars",
                            json={"name": "Punjab", "scope": "province", "province": "PB"})).json()
    async with db.tenant_conn(tenant.tenant_id) as conn:
        before = (await payroll_data.absence_counts(conn, date(2030, 7, 1), [uuid.UUID(emp)]))[emp].working_days
    # July 2030: the 2nd–5th are Tuesday–Friday, never the default Sunday off.
    for cal, d, kind in ((fed, "2030-07-02", "public"), (sd, "2030-07-03", "public"),
                         (pb, "2030-07-04", "public"), (fed, "2030-07-05", "optional")):
        assert (await client.post("/hrms/holidays", json={"holiday_date": d, "name": d, "kind": kind,
                                                          "calendar_id": cal["id"]})).status_code == 201
    loc = (await client.post("/hrms/locations", json={"name": "Karachi office", "province": "SD"})).json()
    await client.patch(f"/hrms/employees/{emp}/job", json={"location_id": loc["id"]})
    async with db.tenant_conn(tenant.tenant_id) as conn:
        after = (await payroll_data.absence_counts(conn, date(2030, 7, 1), [uuid.UUID(emp)]))[emp].working_days
        headline = await payroll_data.working_days(conn, date(2030, 7, 1))
    assert after == before - 2                      # federal + Sindh; not Punjab's, not the optional day
    assert headline == before - 1                   # the page headline counts the federal day only


async def test_the_week_grid_shows_only_the_employees_own_holidays(client, tenant):
    emp = tenant.employee_id
    today = (await client.get("/hrms/attendance/week")).json()["days"][-1]
    pb = (await client.post("/hrms/holiday-calendars",
                            json={"name": "Punjab", "scope": "province", "province": "PB"})).json()
    loc = (await client.post("/hrms/locations", json={"name": "Karachi office", "province": "SD"})).json()
    await client.patch(f"/hrms/employees/{emp}/job", json={"location_id": loc["id"]})
    await client.post("/hrms/holidays", json={"holiday_date": today, "name": "Punjab day", "calendar_id": pb["id"]})

    def cell(week):
        return next(r for r in week["employees"] if r["id"] == emp)["cells"][-1]
    assert cell((await client.get("/hrms/attendance/week")).json()) != "holiday"
    sd = (await client.post("/hrms/holiday-calendars",
                            json={"name": "Sindh", "scope": "province", "province": "SD"})).json()
    await client.post("/hrms/holidays", json={"holiday_date": today, "name": "Sindh day", "calendar_id": sd["id"]})
    assert cell((await client.get("/hrms/attendance/week")).json()) == "holiday"
