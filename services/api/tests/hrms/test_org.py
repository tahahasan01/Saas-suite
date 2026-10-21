"""HR org structure: departments, job titles, locations, the employee profile
and documents (checklist 3F, St03 §6.2, §7.10)."""
from __future__ import annotations

import uuid
from datetime import date, timedelta

import asyncpg

from app.config import settings


async def _owner():
    return await asyncpg.connect(settings.database_url)


async def _staff(client) -> list[dict]:
    return (await client.get("/hrms/employees")).json()


# ── Backfill (§7.10) ────────────────────────────────────────────────────────
async def test_sample_staff_are_linked_to_departments_and_job_titles(client, tenant):
    depts = {d["name"] for d in (await client.get("/hrms/departments")).json()}
    titles = {t["name"] for t in (await client.get("/hrms/job-titles")).json()}
    assert {"Sales", "Retail", "Finance"} <= depts
    assert "Cashier" in titles
    prof = (await client.get(f"/hrms/employees/{tenant.employee_id}")).json()
    assert prof["department_id"] and prof["job_title_id"]


async def test_backfill_groups_text_case_and_whitespace_insensitively(client, tenant):
    conn = await _owner()
    try:
        tid = uuid.UUID(tenant.tenant_id)
        for dept in ("  Ware   house ", "ware house", "WARE HOUSE"):
            await conn.execute(
                "insert into hrms_employees (tenant_id, name, department, designation) values ($1,$2,$3,'Picker')",
                tid, f"Emp {uuid.uuid4().hex[:4]}", dept)
        await conn.execute("select hrms_link_org_text()")
        await conn.execute("select hrms_link_org_text()")      # idempotent
        rows = await conn.fetch(
            "select name from hrms_departments where tenant_id=$1 and lower(name) like 'ware%'", tid)
        assert len(rows) == 1
        linked = await conn.fetchval(
            """select count(*) from hrms_employees e join hrms_departments d on d.id = e.department_id
                where e.tenant_id=$1 and lower(d.name) = 'ware house'""", tid)
        assert linked == 3
        # The text columns stay (rollback; §7.10).
        assert await conn.fetchval(
            "select count(*) from hrms_employees where tenant_id=$1 and department <> ''", tid) >= 3
    finally:
        await conn.close()


# ── Departments ─────────────────────────────────────────────────────────────
async def test_departments_form_a_tree_without_cycles(client, tenant):
    ops = (await client.post("/hrms/departments", json={"name": "Operations"})).json()
    store = await client.post("/hrms/departments", json={"name": "Store A", "parent_id": ops["id"]})
    assert store.status_code == 201, store.text
    shelf = (await client.post("/hrms/departments", json={"name": "Shelf", "parent_id": store.json()["id"]})).json()
    # Operations under its own grandchild would be a loop.
    r = await client.patch(f"/hrms/departments/{ops['id']}", json={"parent_id": shelf["id"]})
    assert r.status_code == 422
    r = await client.patch(f"/hrms/departments/{ops['id']}", json={"parent_id": ops["id"]})
    assert r.status_code == 422
    # A duplicate name, any case, is a 409.
    assert (await client.post("/hrms/departments", json={"name": " operations "})).status_code == 409


async def test_org_setup_needs_the_org_key(client, tenant):
    conn = await _owner()
    try:  # an HR clerk: hrms read and write, not admin
        await conn.execute(
            "delete from permissions where role_id = (select role_id from users where tenant_id=$1 limit 1) "
            "and section='hrms'", uuid.UUID(tenant.tenant_id))
        await conn.execute(
            """insert into permissions (tenant_id, role_id, section, action)
               select $1, u.role_id, 'hrms', a
                 from (select role_id from users where tenant_id=$1 limit 1) u, unnest(array['read','write']) a""",
            uuid.UUID(tenant.tenant_id))
    finally:
        await conn.close()
    assert (await client.get("/hrms/departments")).status_code == 200
    assert (await client.post("/hrms/departments", json={"name": "X"})).status_code == 403
    assert (await client.post("/hrms/locations", json={"name": "HQ"})).status_code == 403


# ── Locations ───────────────────────────────────────────────────────────────
async def test_a_location_keeps_its_geofence_networks_and_province(client, tenant):
    r = await client.post("/hrms/locations", json={
        "name": "Gulberg store", "kind": "store", "lat": 31.5204, "lng": 74.3587, "radius_m": 120,
        "allowed_cidrs": ["203.0.113.0/24", "198.51.100.7"], "province": "PB",
        "geo_mode": "require", "ip_mode": "record"})
    assert r.status_code == 201, r.text
    loc = r.json()
    assert loc["allowed_cidrs"] == ["203.0.113.0/24", "198.51.100.7/32"]
    assert loc["province"] == "PB" and loc["radius_m"] == 120
    listed = (await client.get("/hrms/locations")).json()
    assert any(x["id"] == loc["id"] for x in listed)


async def test_bad_location_values_are_422s(client, tenant):
    for body in ({"name": "A", "province": "XX"},
                 {"name": "B", "allowed_cidrs": ["not-a-network"]},
                 {"name": "C", "geo_mode": "require"},          # no point to measure from
                 {"name": "D", "lat": 31.5},                     # half a point
                 {"name": "E", "kind": "moon"}):
        r = await client.post("/hrms/locations", json=body)
        assert r.status_code == 422, (body, r.text)


# ── The employee profile ────────────────────────────────────────────────────
async def test_create_with_email_and_phone_then_enable_login(client, tenant):
    """P1-12: the create form had no email, so 'Enable login' always failed."""
    r = await client.post("/hrms/employees", json={
        "name": "Bilal Khan", "email": f"bilal+{uuid.uuid4().hex[:6]}@example.com",
        "phone": "0300-1234567", "employment_type": "probation"})
    assert r.status_code == 201, r.text
    emp = r.json()
    assert emp["phone"] == "0300-1234567"
    prof = (await client.get(f"/hrms/employees/{emp['id']}")).json()
    assert prof["employment_type"] == "probation"
    assert (await client.post(f"/hrms/employees/{emp['id']}/invite")).status_code == 204


async def test_email_can_be_added_later(client, tenant):
    r = await client.patch(f"/hrms/employees/{tenant.employee_id}",
                           json={"email": f"late+{uuid.uuid4().hex[:6]}@example.com"})
    assert r.status_code == 200, r.text
    assert (await client.post(f"/hrms/employees/{tenant.employee_id}/invite")).status_code == 204


async def test_job_fields_link_and_keep_the_text_in_step(client, tenant):
    a, b, c = [e["id"] for e in await _staff(client)][:3]
    dept = (await client.post("/hrms/departments", json={"name": "Logistics"})).json()
    title = (await client.post("/hrms/job-titles", json={"name": "Driver", "department_id": dept["id"]})).json()
    loc = (await client.post("/hrms/locations", json={"name": "Depot", "province": "SD"})).json()
    r = await client.patch(f"/hrms/employees/{a}/job", json={
        "department_id": dept["id"], "job_title_id": title["id"], "location_id": loc["id"],
        "manager_id": b, "employment_type": "contract", "code": "EMP-001",
        "probation_end": "2030-01-31"})
    assert r.status_code == 200, r.text
    p = r.json()
    assert (p["department"], p["designation"]) == ("Logistics", "Driver")   # text follows the link
    assert p["manager_id"] == b and p["manager_name"]
    assert p["location_name"] == "Depot" and p["province"] == "SD"
    # Cycles in the reporting line are refused; so is being your own manager.
    assert (await client.patch(f"/hrms/employees/{b}/job", json={"manager_id": a})).status_code == 422
    assert (await client.patch(f"/hrms/employees/{a}/job", json={"manager_id": a})).status_code == 422
    # Clearing a link is an explicit null.
    r = await client.patch(f"/hrms/employees/{a}/job", json={"manager_id": None})
    assert r.json()["manager_id"] is None
    # A code is unique per tenant.
    assert (await client.patch(f"/hrms/employees/{c}/job", json={"code": "emp-001"})).status_code == 409


async def test_job_links_must_be_this_tenants(client, tenant):
    r = await client.patch(f"/hrms/employees/{tenant.employee_id}/job",
                           json={"department_id": str(uuid.uuid4())})
    assert r.status_code == 404


async def test_the_profile_masks_pay_like_the_list(client, tenant):
    prof = (await client.get(f"/hrms/employees/{tenant.employee_id}")).json()
    assert "salary_minor" in prof and "cnic" in prof
    assert (await client.get(f"/hrms/employees/{uuid.uuid4()}")).status_code == 404


# ── Documents ───────────────────────────────────────────────────────────────
async def test_documents_with_expiry_and_the_expiring_soon_list(client, tenant):
    emp = tenant.employee_id
    soon = (date.today() + timedelta(days=10)).isoformat()
    later = (date.today() + timedelta(days=200)).isoformat()
    past = (date.today() - timedelta(days=3)).isoformat()
    for kind, title, exp in (("cnic", "CNIC copy", soon), ("contract", "Contract", later),
                             ("medical", "Health certificate", past)):
        r = await client.post(f"/hrms/employees/{emp}/documents",
                              json={"kind": kind, "title": title, "expires_on": exp})
        assert r.status_code == 201, r.text
    docs = (await client.get(f"/hrms/employees/{emp}/documents")).json()
    assert len(docs) == 3 and all(d["file_id"] is None for d in docs)
    expiring = (await client.get("/hrms/documents/expiring?days=30")).json()
    titles = {d["title"]: d for d in expiring}
    assert set(titles) == {"CNIC copy", "Health certificate"}       # not the one 200 days out
    assert titles["Health certificate"]["days_left"] < 0             # already expired
    assert titles["CNIC copy"]["employee_name"]
    gone = titles["CNIC copy"]["id"]
    r = await client.delete(f"/hrms/documents/{gone}")
    assert r.status_code == 204
    assert len((await client.get(f"/hrms/employees/{emp}/documents")).json()) == 2
    assert (await client.delete(f"/hrms/documents/{gone}")).status_code == 404


async def test_a_document_kind_is_checked(client, tenant):
    r = await client.post(f"/hrms/employees/{tenant.employee_id}/documents",
                          json={"kind": "selfie", "title": "x"})
    assert r.status_code == 422


async def _as_hr_clerk(tenant) -> None:
    """The owner's role cut down to hrms read + write: may edit employees,
    may not shape the org (no hrms.org.manage)."""
    conn = await _owner()
    try:
        await conn.execute(
            "delete from permissions where role_id = (select role_id from users where tenant_id=$1 limit 1) "
            "and section='hrms'", uuid.UUID(tenant.tenant_id))
        await conn.execute(
            """insert into permissions (tenant_id, role_id, section, action)
               select $1, u.role_id, 'hrms', a
                 from (select role_id from users where tenant_id=$1 limit 1) u, unnest(array['read','write']) a""",
            uuid.UUID(tenant.tenant_id))
    finally:
        await conn.close()


async def test_setting_a_manager_needs_the_org_key(client, tenant):
    """Security review: with only employee-update, a clerk could make
    themselves someone's manager and then approve that person's requests."""
    a, b = [e["id"] for e in await _staff(client)][:2]
    await _as_hr_clerk(tenant)
    r = await client.patch(f"/hrms/employees/{a}/job", json={"manager_id": b})
    assert r.status_code == 403
    r = await client.post("/hrms/employees", json={"name": "New hire", "manager_id": b})
    assert r.status_code == 403
    # Everything else on the job stays a clerk's work.
    r = await client.patch(f"/hrms/employees/{a}/job", json={"employment_type": "contract"})
    assert r.status_code == 200, r.text


async def test_nobody_makes_themselves_a_manager(client, tenant):
    a, b = [e["id"] for e in await _staff(client)][:2]
    me = (await client.get("/auth/me")).json()["user"]["id"]
    conn = await _owner()
    try:   # the owner (org key and all) is also employee `a`
        await conn.execute("update hrms_employees set user_id=$1 where id=$2", uuid.UUID(me), uuid.UUID(a))
    finally:
        await conn.close()
    assert (await client.patch(f"/hrms/employees/{b}/job", json={"manager_id": a})).status_code == 403
    r = await client.post("/hrms/employees", json={"name": "Report", "manager_id": a})
    assert r.status_code == 403
    assert (await client.patch(f"/hrms/employees/{a}/job", json={"manager_id": a})).status_code == 422


async def test_team_function_follows_the_reporting_line(client, tenant):
    a, b, c = [e["id"] for e in await _staff(client)][:3]
    me = (await client.get("/auth/me")).json()["user"]["id"]
    await client.patch(f"/hrms/employees/{b}/job", json={"manager_id": a})
    await client.patch(f"/hrms/employees/{c}/job", json={"manager_id": b})
    conn = await _owner()
    try:
        await conn.execute("update hrms_employees set user_id=$1 where id=$2", uuid.UUID(me), uuid.UUID(a))
        ids = {str(r[0]) for r in await conn.fetch("select hrms_team_employee_ids($1)", uuid.UUID(me))}
    finally:
        await conn.close()
    assert ids == {b, c}
