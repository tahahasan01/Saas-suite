"""HR letters and letter requests (wave C, H17/H37, St12, 0105).

Templates (offer, appointment, experience, salary, NOC…) hold text with a
fixed set of {{placeholders}}. Issuing renders them for one person, keeps
the text as issued with a number (a letter never changes afterwards) and
gives a PDF. Salary needs payroll.salary.read to print. Employees ask for a
letter on /me (experience, salary, NOC, ID card…), see the ones issued to
them and download them; HR issues or declines the request.
"""
from __future__ import annotations

import uuid
from datetime import date

from httpx import ASGITransport, AsyncClient

from app.main import app
from app.security import SESSION_COOKIE

from ..core.test_rbac_v2 import _role, _user_on
from .payroll_helpers import new_employee
from .test_employee_portal import _link_login


def _portal(token: str) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test", cookies={SESSION_COOKIE: token})


BODY = ("To whom it may concern,\n\nThis is to certify that {{employee.name}} has worked with {{company.name}} "
        "as {{employee.designation}} since {{employee.join_date}}.\n\nRef {{letter.number}}, {{today}}")


async def _template(client, body=BODY, kind="experience") -> dict:
    r = await client.post("/hrms/letter-templates", json={"kind": kind, "name": f"T {uuid.uuid4().hex[:5]}",
                                                         "title": "Experience letter", "body": body})
    assert r.status_code == 201, r.text
    return r.json()


async def test_a_letter_is_rendered_numbered_kept_and_printed(client, tenant):
    e = await new_employee(client, name="Nadia Khan", designation="Cashier", join_date="2024-03-01")
    t = await _template(client)
    prev = (await client.post(f"/hrms/employees/{e['id']}/letters/preview", json={"template_id": t["id"]})).json()
    assert "Nadia Khan" in prev["body"] and "Cashier" in prev["body"] and "1 March 2024" in prev["body"]
    assert "{{" not in prev["body"].replace("{{letter.number}}", "")       # only the number waits for issue

    r = await client.post(f"/hrms/employees/{e['id']}/letters",
                          json={"template_id": t["id"], "body": prev["body"] + "\n\nWe wish her well."})
    assert r.status_code == 201, r.text
    letter = r.json()
    year = date.today().year
    assert letter["number"] == f"HR-{year}-0001" and letter["kind"] == "experience"
    assert f"HR-{year}-0001" in letter["body"] and "We wish her well." in letter["body"]
    second = (await client.post(f"/hrms/employees/{e['id']}/letters", json={"template_id": t["id"]})).json()
    assert second["number"] == f"HR-{year}-0002"

    # Editing the template later never changes an issued letter.
    await client.patch(f"/hrms/letter-templates/{t['id']}", json={"body": "Changed {{employee.name}}"})
    kept = (await client.get(f"/hrms/employees/{e['id']}/letters")).json()
    assert {x["number"] for x in kept} == {letter["number"], second["number"]}
    assert "We wish her well." in next(x for x in kept if x["id"] == letter["id"])["body"]

    pdf = await client.get(f"/hrms/letters/{letter['id']}/pdf")
    assert pdf.status_code == 200 and pdf.headers["content-type"] == "application/pdf"
    assert pdf.content[:5] == b"%PDF-"


async def test_unknown_placeholders_are_refused_and_salary_needs_pay_rights(client, tenant):
    bad = await client.post("/hrms/letter-templates", json={"kind": "other", "name": "Bad", "title": "X",
                                                            "body": "Hello {{employee.password}}"})
    assert bad.status_code == 422 and "employee.password" in bad.text
    e = await new_employee(client, name="Asif", salary_minor=8_500_000)
    t = await _template(client, "Monthly salary: {{employee.salary}}", kind="salary")
    rid = await _role(client, [{"permission_key": "hrms.letter.read", "scope": "all"},
                               {"permission_key": "hrms.letter.manage", "scope": "all"},
                               {"permission_key": "hrms.employee.read", "scope": "all"}])
    clerk, _, _ = await _user_on(client, [rid])
    try:
        r = await clerk.post(f"/hrms/employees/{e['id']}/letters", json={"template_id": t["id"]})
        assert r.status_code == 403 and "salary" in r.text
    finally:
        await clerk.aclose()
    ok = (await client.post(f"/hrms/employees/{e['id']}/letters", json={"template_id": t["id"]})).json()
    assert "Rs 85,000" in ok["body"]


async def test_starter_templates_are_there_on_first_use(client, tenant):
    rows = (await client.get("/hrms/letter-templates")).json()
    assert {"experience", "salary", "noc"} <= {t["kind"] for t in rows}


async def test_an_employee_asks_for_a_letter_and_gets_it_on_me(client, tenant):
    token = await _link_login(tenant.tenant_id, tenant.employee_id, f"emp+{uuid.uuid4().hex[:8]}@example.com")
    async with _portal(token) as me:
        r = await me.post("/me/letter-requests", json={"kind": "noc", "purpose": "Visa application"})
        assert r.status_code == 201, r.text
        req = r.json()
        assert req["status"] == "pending"
        assert (await me.get("/hrms/letter-requests")).status_code == 403

    pending = (await client.get("/hrms/letter-requests", params={"status": "pending"})).json()
    assert req["id"] in {x["id"] for x in pending}
    noc = next(t for t in (await client.get("/hrms/letter-templates")).json() if t["kind"] == "noc")
    r = await client.post(f"/hrms/employees/{tenant.employee_id}/letters",
                          json={"template_id": noc["id"], "request_id": req["id"]})
    assert r.status_code == 201, r.text
    letter = r.json()
    # A request is answered once.
    assert (await client.post(f"/hrms/letter-requests/{req['id']}/decline", json={"note": "x"})).status_code == 409

    async with _portal(token) as me:
        mine = (await me.get("/me/letter-requests")).json()
        assert mine[0]["status"] == "issued" and mine[0]["letter_id"] == letter["id"]
        assert [x["id"] for x in (await me.get("/me/letters")).json()] == [letter["id"]]
        pdf = await me.get(f"/me/letters/{letter['id']}/pdf")
        assert pdf.status_code == 200 and pdf.content[:5] == b"%PDF-"


async def test_a_request_is_declined_with_a_reason_and_letters_stay_private(client, tenant):
    token = await _link_login(tenant.tenant_id, tenant.employee_id, f"emp+{uuid.uuid4().hex[:8]}@example.com")
    async with _portal(token) as me:
        req = (await me.post("/me/letter-requests", json={"kind": "id_card", "purpose": "Lost my card"})).json()
    assert (await client.post(f"/hrms/letter-requests/{req['id']}/decline", json={"note": ""})).status_code == 422
    r = await client.post(f"/hrms/letter-requests/{req['id']}/decline", json={"note": "Collect it from the office"})
    assert r.status_code == 200 and r.json()["status"] == "declined"

    other = await new_employee(client, name="Someone else")
    t = await _template(client)
    theirs = (await client.post(f"/hrms/employees/{other['id']}/letters", json={"template_id": t["id"]})).json()
    async with _portal(token) as me:
        assert (await me.get(f"/me/letters/{theirs['id']}/pdf")).status_code == 404


async def test_an_id_card_request_is_marked_done_without_a_letter(client, tenant):
    token = await _link_login(tenant.tenant_id, tenant.employee_id, f"emp+{uuid.uuid4().hex[:8]}@example.com")
    async with _portal(token) as me:
        req = (await me.post("/me/letter-requests", json={"kind": "id_card", "purpose": "New card"})).json()
    r = await client.post(f"/hrms/letter-requests/{req['id']}/done", json={"note": "Collect it from reception"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "issued" and r.json()["letter_id"] is None
    assert (await client.post(f"/hrms/letter-requests/{req['id']}/done", json={"note": "again"})).status_code == 409


async def test_a_letter_showing_pay_stays_with_pay_readers(client, tenant):
    """Security review: issuing a salary letter needs payroll.salary.read, so
    reading it back must too (the list and the PDF), or a letters-only reader
    sees the salary and the full CNIC through the copy."""
    e = await new_employee(client, name="Paid Person", salary_minor=8_500_000, cnic="35202-1234567-3")
    pay = await _template(client, "Salary {{employee.salary}}, CNIC {{employee.cnic}}", kind="salary")
    plain = await _template(client, "Hello {{employee.name}}")
    shown = (await client.post(f"/hrms/employees/{e['id']}/letters", json={"template_id": pay["id"]})).json()
    other = (await client.post(f"/hrms/employees/{e['id']}/letters", json={"template_id": plain["id"]})).json()
    rid = await _role(client, [{"permission_key": "hrms.letter.read", "scope": "all"},
                               {"permission_key": "hrms.employee.read", "scope": "all"}])
    reader, _, _ = await _user_on(client, [rid])
    try:
        rows = {x["id"]: x for x in (await reader.get(f"/hrms/employees/{e['id']}/letters")).json()}
        assert "85,000" not in rows[shown["id"]]["body"] and "1234567" not in rows[shown["id"]]["body"]
        assert rows[other["id"]]["body"].startswith("Hello")
        assert (await reader.get(f"/hrms/letters/{shown['id']}/pdf")).status_code == 403
        assert (await reader.get(f"/hrms/letters/{other['id']}/pdf")).status_code == 200
    finally:
        await reader.aclose()
    assert (await client.get(f"/hrms/letters/{shown['id']}/pdf")).status_code == 200
