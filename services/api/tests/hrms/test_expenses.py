"""Expense claims reimbursed through payroll (wave C, H13, St12, 0102).

An employee claims on /me: lines with a date, category, amount and an
optional receipt (their own upload). HR can claim on someone's behalf. An
approver (hrms.expense.approve) approves up to the claimed total, or
rejects with a reason; nobody approves a claim they made or entered.
Approval creates a non-taxable EXPENSE one-off, so the next payroll pays
it; the claim shows paid once that run is paid.
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta

from httpx import ASGITransport, AsyncClient

from app.main import app
from app.security import SESSION_COOKIE

from ..core.test_rbac_v2 import _role, _user_on
from .payroll_helpers import owner_fetch
from .test_employee_portal import _link_login

RECEIPT = b"%PDF-1.7\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"   # what tests/core/test_files uses
YESTERDAY = (date.today() - timedelta(days=1)).isoformat()


def _portal(token: str) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test", cookies={SESSION_COOKIE: token})


async def _staff_login(tenant) -> AsyncClient:
    token = await _link_login(tenant.tenant_id, tenant.employee_id, f"emp+{uuid.uuid4().hex[:8]}@example.com")
    return _portal(token)


LINES = [{"spent_on": YESTERDAY, "category": "fuel", "description": "Visit to Lahore client", "amount_minor": 450_000},
         {"spent_on": YESTERDAY, "category": "meals", "description": "Lunch with client", "amount_minor": 150_050}]


async def test_an_employee_claims_with_a_receipt_and_approval_pays_it_through_payroll(client, tenant):
    async with await _staff_login(tenant) as me:
        up = await me.post("/files", params={"name": "fuel.pdf"}, content=RECEIPT)
        assert up.status_code == 201, up.text
        lines = [{**LINES[0], "receipt_file_id": up.json()["id"]}, LINES[1]]
        r = await me.post("/me/expenses", json={"title": "Lahore trip", "lines": lines})
        assert r.status_code == 201, r.text
        claim = r.json()
        assert claim["status"] == "submitted" and claim["total_minor"] == 600_050
        assert claim["lines"][0]["receipt_file_id"] == up.json()["id"]
        assert (await me.get(f"/files/{up.json()['id']}")).status_code == 302     # still theirs to open
        assert [x["id"] for x in (await me.get("/me/expenses")).json()] == [claim["id"]]

    pending = (await client.get("/hrms/expenses", params={"status": "submitted"})).json()
    assert claim["id"] in {x["id"] for x in pending}
    assert (await client.get(f"/files/{up.json()['id']}")).status_code == 302        # and the approver's

    # Approving more than was claimed is refused.
    assert (await client.post(f"/hrms/expenses/{claim['id']}/approve",
                              json={"approved_minor": 700_000})).status_code == 422
    r = await client.post(f"/hrms/expenses/{claim['id']}/approve",
                          json={"approved_minor": 550_000, "note": "Lunch capped at 1,000"})
    assert r.status_code == 200, r.text
    done = r.json()
    assert done["status"] == "approved" and done["approved_minor"] == 550_000 and done["paid"] is False
    one_off = (await owner_fetch("select * from pay_one_offs where id = $1::uuid", done["one_off_id"]))[0]
    assert (one_off["code"], one_off["kind"], one_off["amount_minor"], one_off["taxable"]) == \
        ("EXPENSE", "earning", 550_000, False)
    assert one_off["period"] == date.today().replace(day=1)
    assert (await client.post(f"/hrms/expenses/{claim['id']}/approve", json={})).status_code == 409


async def test_a_rejection_needs_a_reason_and_pays_nothing(client, tenant):
    async with await _staff_login(tenant) as me:
        claim = (await me.post("/me/expenses", json={"title": "Phone", "lines": [
            {"spent_on": YESTERDAY, "category": "phone", "amount_minor": 200_000}]})).json()
    assert (await client.post(f"/hrms/expenses/{claim['id']}/reject", json={"note": ""})).status_code == 422
    r = await client.post(f"/hrms/expenses/{claim['id']}/reject", json={"note": "Covered by the phone allowance"})
    assert r.status_code == 200 and r.json()["status"] == "rejected" and r.json()["one_off_id"] is None


async def test_an_employee_cancels_their_own_pending_claim_only(client, tenant):
    async with await _staff_login(tenant) as me:
        claim = (await me.post("/me/expenses", json={"title": "Taxi", "lines": [
            {"spent_on": YESTERDAY, "category": "travel", "amount_minor": 80_000}]})).json()
        assert (await me.post(f"/me/expenses/{claim['id']}/cancel")).status_code == 200
        assert (await me.post(f"/me/expenses/{claim['id']}/cancel")).status_code == 409
    other = (await client.post("/hrms/employees", json={"name": "Other"})).json()["id"]
    theirs = (await client.post("/hrms/expenses", json={"employee_id": other, "title": "Courier", "lines": [
        {"spent_on": YESTERDAY, "category": "supplies", "amount_minor": 50_000}]})).json()
    async with await _staff_login(tenant) as me:
        assert (await me.post(f"/me/expenses/{theirs['id']}/cancel")).status_code == 404


async def test_nobody_approves_a_claim_they_made_or_entered(client, tenant):
    # Entered by the owner on someone's behalf: the owner can't approve it.
    other = (await client.post("/hrms/employees", json={"name": "Driver"})).json()["id"]
    entered = (await client.post("/hrms/expenses", json={"employee_id": other, "title": "Toll", "lines": [
        {"spent_on": YESTERDAY, "category": "travel", "amount_minor": 30_000}]})).json()
    assert entered["status"] == "submitted"
    assert (await client.post(f"/hrms/expenses/{entered['id']}/approve", json={})).status_code == 403
    # A second approver can.
    rid = await _role(client, [{"permission_key": "hrms.expense.read", "scope": "all"},
                               {"permission_key": "hrms.expense.approve", "scope": "all"}])
    mate, _, _ = await _user_on(client, [rid])
    try:
        assert (await mate.post(f"/hrms/expenses/{entered['id']}/approve", json={})).status_code == 200
        assert (await mate.post("/hrms/expenses", json={"employee_id": other, "title": "x", "lines": [
            {"spent_on": YESTERDAY, "category": "other", "amount_minor": 1}]})).status_code == 403   # no manage
    finally:
        await mate.aclose()


async def test_claims_are_checked(client, tenant):
    async with await _staff_login(tenant) as me:
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        assert (await me.post("/me/expenses", json={"title": "Future", "lines": [
            {"spent_on": tomorrow, "category": "fuel", "amount_minor": 100}]})).status_code == 422
        assert (await me.post("/me/expenses", json={"title": "Empty", "lines": []})).status_code == 422
        assert (await me.post("/me/expenses", json={"title": "Zero", "lines": [
            {"spent_on": YESTERDAY, "category": "fuel", "amount_minor": 0}]})).status_code == 422
        assert (await me.post("/me/expenses", json={"title": "Odd", "lines": [
            {"spent_on": YESTERDAY, "category": "casino", "amount_minor": 100}]})).status_code == 422
        # A receipt must be your own fresh upload.
        assert (await me.post("/me/expenses", json={"title": "Not mine", "lines": [
            {**LINES[0], "receipt_file_id": str(uuid.uuid4())}]})).status_code == 422
