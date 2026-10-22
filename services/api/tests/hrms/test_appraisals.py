"""Probation reviews and appraisals (wave C, H25/H26, St12, 0101).

Probation: a review confirms (sets confirmed_on; someone on probation
becomes permanent), extends (a later end date) or ends it. Appraisals: a
template of KRAs whose weights total 100; a cycle opens one appraisal per
employee, reviewed by their manager. The employee rates themselves first
(/me), the manager rates each KRA 1–5 and the score is the weighted
average. Nobody reviews their own appraisal; a cycle closes only when every
appraisal is done or cancelled.
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta

from httpx import ASGITransport, AsyncClient

from app.main import app
from app.security import SESSION_COOKIE

from ..core.test_rbac_v2 import _role, _user_on
from .test_employee_portal import _link_login

KRAS = [{"title": "Sales target", "weight": 50}, {"title": "Customer care", "weight": 30},
        {"title": "Punctuality", "weight": 20}]


def _portal(token: str) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test", cookies={SESSION_COOKIE: token})


async def _employee(client, **extra) -> str:
    r = await client.post("/hrms/employees", json={"name": f"Staff {uuid.uuid4().hex[:5]}", **extra})
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ── Probation ───────────────────────────────────────────────────────────────
async def test_probation_ending_soon_is_listed_and_confirmed(client, tenant):
    soon = (date.today() + timedelta(days=10)).isoformat()
    emp = await _employee(client)
    r = await client.patch(f"/hrms/employees/{emp}/job", json={"employment_type": "probation", "probation_end": soon})
    assert r.status_code == 200, r.text
    due = (await client.get("/hrms/probation", params={"within_days": 30})).json()
    row = next(x for x in due if x["employee_id"] == emp)
    assert row["probation_end"] == soon and row["days_left"] == 10

    r = await client.post(f"/hrms/employees/{emp}/probation-review", json={"outcome": "confirmed", "note": "Good start"})
    assert r.status_code == 201, r.text
    p = (await client.get(f"/hrms/employees/{emp}")).json()
    assert p["confirmed_on"] == date.today().isoformat() and p["employment_type"] == "permanent"
    assert emp not in {x["employee_id"] for x in (await client.get("/hrms/probation")).json()}
    # Once confirmed, there's nothing left to review.
    again = await client.post(f"/hrms/employees/{emp}/probation-review", json={"outcome": "confirmed"})
    assert again.status_code == 409


async def test_probation_is_extended_to_a_later_date_with_history(client, tenant):
    emp = await _employee(client)
    await client.patch(f"/hrms/employees/{emp}/job", json={"employment_type": "probation", "probation_end": "2026-11-30"})
    assert (await client.post(f"/hrms/employees/{emp}/probation-review",
                              json={"outcome": "extended"})).status_code == 422          # needs the new date
    assert (await client.post(f"/hrms/employees/{emp}/probation-review",
                              json={"outcome": "extended", "new_end": "2026-11-01"})).status_code == 422   # earlier
    r = await client.post(f"/hrms/employees/{emp}/probation-review",
                          json={"outcome": "extended", "new_end": "2027-02-28", "note": "Needs more training"})
    assert r.status_code == 201, r.text
    assert (await client.get(f"/hrms/employees/{emp}")).json()["probation_end"] == "2027-02-28"
    hist = (await client.get(f"/hrms/employees/{emp}/probation-reviews")).json()
    assert [(h["outcome"], h["previous_end"], h["new_end"]) for h in hist] == [("extended", "2026-11-30", "2027-02-28")]


async def test_probation_review_needs_employee_update(client, tenant):
    emp = await _employee(client)
    await client.patch(f"/hrms/employees/{emp}/job", json={"probation_end": "2026-12-31"})
    rid = await _role(client, [{"permission_key": "hrms.employee.read", "scope": "all"}])
    mate, _, _ = await _user_on(client, [rid])
    try:
        assert (await mate.get("/hrms/probation")).status_code == 200
        assert (await mate.post(f"/hrms/employees/{emp}/probation-review",
                                json={"outcome": "confirmed"})).status_code == 403
    finally:
        await mate.aclose()


# ── Appraisals ──────────────────────────────────────────────────────────────
async def _template(client, kras=KRAS) -> dict:
    r = await client.post("/hrms/appraisal-templates", json={"name": f"Sales {uuid.uuid4().hex[:5]}", "kras": kras})
    assert r.status_code == 201, r.text
    return r.json()


async def _cycle(client, template_id: str, employee_ids: list[str], **extra) -> dict:
    r = await client.post("/hrms/appraisal-cycles", json={
        "name": f"2026 review {uuid.uuid4().hex[:4]}", "period_start": "2026-01-01", "period_end": "2026-12-31",
        "template_id": template_id, "employee_ids": employee_ids, **extra})
    assert r.status_code == 201, r.text
    return r.json()


async def test_kra_weights_must_total_100(client, tenant):
    bad = await client.post("/hrms/appraisal-templates",
                            json={"name": "Bad", "kras": [{"title": "A", "weight": 60}, {"title": "B", "weight": 30}]})
    assert bad.status_code == 422 and "100" in bad.text
    assert (await client.post("/hrms/appraisal-templates", json={"name": "Empty", "kras": []})).status_code == 422


async def test_self_review_then_manager_review_gives_a_weighted_score(client, tenant):
    manager = tenant.employee_id
    staff = await _employee(client)
    await client.patch(f"/hrms/employees/{staff}/job", json={"manager_id": manager})
    t = await _template(client)
    c = await _cycle(client, t["id"], [staff])
    assert c["status"] == "draft"
    r = await client.post(f"/hrms/appraisal-cycles/{c['id']}/open")
    assert r.status_code == 200, r.text
    a = r.json()["appraisals"][0]
    assert a["employee_id"] == staff and a["reviewer_id"] == manager and a["status"] == "self_review"

    # The employee rates themselves on /me.
    token = await _link_login(tenant.tenant_id, staff, f"staff+{uuid.uuid4().hex[:8]}@example.com")
    async with _portal(token) as me:
        mine = (await me.get("/me/appraisals")).json()
        assert [x["id"] for x in mine] == [a["id"]]
        ratings = mine[0]["ratings"]
        assert [x["title"] for x in ratings] == ["Sales target", "Customer care", "Punctuality"]
        # Submitting needs every KRA rated.
        part = [{"id": ratings[0]["id"], "rating": 4}]
        assert (await me.put(f"/me/appraisals/{a['id']}/self", json={"ratings": part, "submit": True})).status_code == 422
        body = {"ratings": [{"id": x["id"], "rating": 4, "note": "Did well"} for x in ratings],
                "comment": "A good year", "submit": True}
        r = await me.put(f"/me/appraisals/{a['id']}/self", json=body)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "manager_review"
        assert (await me.put(f"/me/appraisals/{a['id']}/self", json=body)).status_code == 409   # already sent
        # They can't rate themselves as the manager.
        assert (await me.get("/me/reviews")).json() == []

    # The manager (linked to the owner's login here) reviews from /me/reviews.
    mgr_token = await _link_login(tenant.tenant_id, manager, f"mgr+{uuid.uuid4().hex[:8]}@example.com")
    async with _portal(mgr_token) as mgr:
        todo = (await mgr.get("/me/reviews")).json()
        assert [x["id"] for x in todo] == [a["id"]]
        assert todo[0]["ratings"][0]["self_rating"] == 4
        by_title = {x["title"]: x["id"] for x in todo[0]["ratings"]}
        scores = {"Sales target": 5, "Customer care": 3, "Punctuality": 2}
        r = await mgr.put(f"/me/reviews/{a['id']}", json={
            "ratings": [{"id": by_title[k], "rating": v} for k, v in scores.items()],
            "comment": "Strong seller", "submit": True})
        assert r.status_code == 200, r.text
        done = r.json()
        # 5×50 + 3×30 + 2×20 = 380 → 3.80
        assert done["status"] == "done" and done["score"] == 3.8

    async with _portal(token) as me:
        seen = (await me.get("/me/appraisals")).json()[0]
        assert seen["score"] == 3.8 and seen["ratings"][0]["manager_rating"] == 5   # shown once done

    r = await client.post(f"/hrms/appraisal-cycles/{c['id']}/close")
    assert r.status_code == 200 and r.json()["status"] == "closed"


async def test_manager_ratings_are_hidden_from_the_employee_until_done(client, tenant):
    staff = await _employee(client)
    t = await _template(client)
    c = await _cycle(client, t["id"], [staff], self_review=False)
    a = (await client.post(f"/hrms/appraisal-cycles/{c['id']}/open")).json()["appraisals"][0]
    assert a["status"] == "manager_review"
    detail = (await client.get(f"/hrms/appraisals/{a['id']}")).json()
    r = await client.put(f"/hrms/appraisals/{a['id']}/manager-review", json={
        "ratings": [{"id": x["id"], "rating": 2} for x in detail["ratings"]], "submit": False})
    assert r.status_code == 200 and r.json()["status"] == "manager_review"      # a draft
    token = await _link_login(tenant.tenant_id, staff, f"staff+{uuid.uuid4().hex[:8]}@example.com")
    async with _portal(token) as me:
        mine = (await me.get("/me/appraisals")).json()[0]
        assert mine["score"] is None and all(x["manager_rating"] is None for x in mine["ratings"])


async def test_nobody_reviews_themselves_and_cycles_close_only_when_finished(client, tenant):
    t = await _template(client)
    other = await _employee(client)
    c = await _cycle(client, t["id"], [tenant.employee_id, other], self_review=False)
    opened = (await client.post(f"/hrms/appraisal-cycles/{c['id']}/open")).json()
    assert (await client.post(f"/hrms/appraisal-cycles/{c['id']}/open")).status_code == 409
    own = next(x for x in opened["appraisals"] if x["employee_id"] == tenant.employee_id)
    # Link the owner's own login to their employee record: now it's their own appraisal.
    me_user = (await client.get("/auth/me")).json()["user"]["id"]
    from .payroll_helpers import owner_execute
    await owner_execute("update hrms_employees set user_id = $1::uuid where id = $2::uuid", me_user, tenant.employee_id)
    detail = (await client.get(f"/hrms/appraisals/{own['id']}")).json()
    r = await client.put(f"/hrms/appraisals/{own['id']}/manager-review", json={
        "ratings": [{"id": x["id"], "rating": 5} for x in detail["ratings"]], "submit": True})
    assert r.status_code == 403

    assert (await client.post(f"/hrms/appraisal-cycles/{c['id']}/close")).status_code == 409
    for a in opened["appraisals"]:
        assert (await client.post(f"/hrms/appraisals/{a['id']}/cancel")).status_code == 200
    assert (await client.post(f"/hrms/appraisal-cycles/{c['id']}/close")).status_code == 200


async def test_appraisals_need_the_appraisal_keys(client, tenant):
    t = await _template(client)
    rid = await _role(client, [{"permission_key": "hrms.appraisal.read", "scope": "all"}])
    mate, _, _ = await _user_on(client, [rid])
    try:
        assert (await mate.get("/hrms/appraisal-cycles")).status_code == 200
        assert (await mate.post("/hrms/appraisal-cycles", json={
            "name": "No", "period_start": "2026-01-01", "period_end": "2026-12-31",
            "template_id": t["id"]})).status_code == 403
    finally:
        await mate.aclose()
