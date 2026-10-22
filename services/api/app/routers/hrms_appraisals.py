"""Probation reviews and appraisals (wave C, H25/H26, St12, 0101).

Probation: who is due (end date within N days, or overdue) and each
decision. Confirming sets confirmed_on and turns "probation" employment
permanent; extending moves the end date later; ending records it (HR then
records the leaving). Reading uses hrms.employee.read, deciding
hrms.employee.update.

Appraisals: templates of KRAs (weights total 100), cycles that open one
appraisal per employee, reviewed by the manager they had then. The employee
rates themselves on /me, the manager on /me/reviews (or HR with
hrms.appraisal.manage); nobody reviews their own. Manager ratings reach the
employee only once the appraisal is done.
"""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, status

from .. import db, refs
from ..deps import AuthContext, current_auth, current_employee
from ..models import (AppraisalCycleCreate, AppraisalCycleOut, AppraisalOut, AppraisalRatingOut,
                      AppraisalReviewIn, AppraisalTemplateCreate, AppraisalTemplateOut, AppraisalTemplateUpdate,
                      KraIn, KraOut, ProbationDue, ProbationReviewIn, ProbationReviewOut)
from ..rbac import perm

router = APIRouter(prefix="/hrms", tags=["hrms"])
portal = APIRouter(prefix="/me", tags=["portal"])

READ, MANAGE = "hrms.appraisal.read", "hrms.appraisal.manage"
OPEN_STATES = ("self_review", "manager_review")


# ── Probation ───────────────────────────────────────────────────────────────
def _review(r: asyncpg.Record) -> ProbationReviewOut:
    return ProbationReviewOut(id=str(r["id"]), employee_id=str(r["employee_id"]), outcome=r["outcome"],
                              previous_end=r["previous_end"], new_end=r["new_end"], note=r["note"],
                              decided_at=r["decided_at"])


@router.get("/probation", response_model=list[ProbationDue])
async def probation_due(within_days: int = Query(30, ge=0, le=366),
                        auth: AuthContext = Depends(perm("hrms.employee.read"))) -> list[ProbationDue]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(
            """select e.id, e.name, e.designation, e.join_date, e.probation_end, m.name as manager_name,
                      (e.probation_end - current_date) as days_left
                 from hrms_employees e left join hrms_employees m on m.id = e.manager_id
                where e.status = 'active' and e.exit_date is null and e.confirmed_on is null
                  and e.probation_end is not null and e.probation_end <= current_date + $1::int
                  and not exists (select 1 from hrms_probation_reviews r
                                   where r.employee_id = e.id and r.outcome = 'ended')
                order by e.probation_end, e.name""", within_days)
    return [ProbationDue(employee_id=str(r["id"]), name=r["name"], designation=r["designation"],
                         manager_name=r["manager_name"], join_date=r["join_date"], probation_end=r["probation_end"],
                         days_left=r["days_left"]) for r in rows]


@router.post("/employees/{employee_id}/probation-review", response_model=ProbationReviewOut,
             status_code=status.HTTP_201_CREATED)
async def review_probation(employee_id: UUID, body: ProbationReviewIn,
                           auth: AuthContext = Depends(perm("hrms.employee.update"))) -> ProbationReviewOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        await refs.ensure_visible(conn, "hrms_employees", employee_id)
        e = await conn.fetchrow(
            "select probation_end, confirmed_on, employment_type from hrms_employees where id = $1 for update",
            employee_id)
        ended = await conn.fetchval(
            "select 1 from hrms_probation_reviews where employee_id = $1 and outcome = 'ended'", employee_id)
        if e["confirmed_on"] is not None or ended:
            raise HTTPException(status.HTTP_409_CONFLICT, "Probation was already decided")
        if body.outcome == "extended" and e["probation_end"] and body.new_end <= e["probation_end"]:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The new end must be after the current one")
        if body.outcome == "confirmed":
            on = body.on or await conn.fetchval("select current_date")
            await conn.execute(
                """update hrms_employees set confirmed_on = $2,
                          employment_type = case when employment_type = 'probation' then 'permanent'
                                                 else employment_type end where id = $1""", employee_id, on)
        elif body.outcome == "extended":
            await conn.execute("update hrms_employees set probation_end = $2 where id = $1", employee_id, body.new_end)
        row = await conn.fetchrow(
            """insert into hrms_probation_reviews (tenant_id, employee_id, outcome, previous_end, new_end, note,
                                                   decided_by)
               values ($1, $2, $3, $4, $5, $6, $7) returning *""",
            auth.tenant_id, employee_id, body.outcome, e["probation_end"], body.new_end, body.note, auth.user_id)
        return _review(row)


@router.get("/employees/{employee_id}/probation-reviews", response_model=list[ProbationReviewOut])
async def probation_history(employee_id: UUID,
                            auth: AuthContext = Depends(perm("hrms.employee.read"))) -> list[ProbationReviewOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "hrms_employees", employee_id)
        rows = await conn.fetch(
            "select * from hrms_probation_reviews where employee_id = $1 order by decided_at", employee_id)
    return [_review(r) for r in rows]


# ── Templates ───────────────────────────────────────────────────────────────
async def _template(conn: asyncpg.Connection, template_id: Any) -> AppraisalTemplateOut:
    t = await conn.fetchrow("select * from hrms_appraisal_templates where id = $1", template_id)
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Template not found")
    kras = await conn.fetch("select * from hrms_appraisal_template_kras where template_id = $1 order by sort",
                            template_id)
    return AppraisalTemplateOut(id=str(t["id"]), name=t["name"], active=t["active"], kras=[
        KraOut(id=str(k["id"]), title=k["title"], description=k["description"], weight=k["weight"]) for k in kras])


async def _replace_kras(conn: asyncpg.Connection, tenant_id: str, template_id: Any, kras: list[KraIn]) -> None:
    await conn.execute("delete from hrms_appraisal_template_kras where template_id = $1", template_id)
    await conn.executemany(
        """insert into hrms_appraisal_template_kras (tenant_id, template_id, title, description, weight, sort)
           values ($1, $2, btrim($3), $4, $5, $6)""",
        [(tenant_id, template_id, k.title, k.description, k.weight, i) for i, k in enumerate(kras)])


@router.get("/appraisal-templates", response_model=list[AppraisalTemplateOut])
async def list_templates(auth: AuthContext = Depends(perm(READ))) -> list[AppraisalTemplateOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        ids = await conn.fetch("select id from hrms_appraisal_templates order by not active, name")
        return [await _template(conn, r["id"]) for r in ids]


@router.post("/appraisal-templates", response_model=AppraisalTemplateOut, status_code=status.HTTP_201_CREATED)
async def create_template(body: AppraisalTemplateCreate,
                          auth: AuthContext = Depends(perm(MANAGE))) -> AppraisalTemplateOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        try:
            tid = await conn.fetchval(
                "insert into hrms_appraisal_templates (tenant_id, name) values ($1, btrim($2)) returning id",
                auth.tenant_id, body.name)
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, "A template with that name already exists")
        await _replace_kras(conn, auth.tenant_id, tid, body.kras)
        return await _template(conn, tid)


@router.patch("/appraisal-templates/{template_id}", response_model=AppraisalTemplateOut)
async def update_template(template_id: UUID, body: AppraisalTemplateUpdate,
                          auth: AuthContext = Depends(perm(MANAGE))) -> AppraisalTemplateOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        if not await conn.fetchval("select 1 from hrms_appraisal_templates where id = $1 for update", template_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Template not found")
        try:
            await conn.execute(
                """update hrms_appraisal_templates set name = coalesce(btrim($2), name),
                          active = coalesce($3, active) where id = $1""", template_id, body.name, body.active)
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, "A template with that name already exists")
        if body.kras is not None:
            await _replace_kras(conn, auth.tenant_id, template_id, body.kras)
        return await _template(conn, template_id)


# ── Appraisals ──────────────────────────────────────────────────────────────
_SELECT = """select a.*, c.name as cycle_name, c.period_start, c.period_end, e.name as employee_name,
                    e.user_id as employee_user, r.name as reviewer_name
               from hrms_appraisals a join hrms_appraisal_cycles c on c.id = a.cycle_id
               join hrms_employees e on e.id = a.employee_id
               left join hrms_employees r on r.id = a.reviewer_id"""


async def _appraisal(conn: asyncpg.Connection, row: asyncpg.Record, *, ratings: bool = True,
                     hide_manager: bool = False) -> AppraisalOut:
    hide = hide_manager and row["status"] != "done"
    out = AppraisalOut(
        id=str(row["id"]), cycle_id=str(row["cycle_id"]), cycle_name=row["cycle_name"],
        period_start=row["period_start"], period_end=row["period_end"], employee_id=str(row["employee_id"]),
        employee_name=row["employee_name"], reviewer_id=str(row["reviewer_id"]) if row["reviewer_id"] else None,
        reviewer_name=row["reviewer_name"], status=row["status"], self_comment=row["self_comment"],
        self_submitted_at=row["self_submitted_at"], manager_comment="" if hide else row["manager_comment"],
        manager_submitted_at=row["manager_submitted_at"],
        score=float(row["score"]) if row["score"] is not None else None)
    if ratings:
        out.ratings = [AppraisalRatingOut(
            id=str(r["id"]), title=r["title"], description=r["description"], weight=r["weight"],
            self_rating=r["self_rating"], self_note=r["self_note"],
            manager_rating=None if hide else r["manager_rating"], manager_note="" if hide else r["manager_note"])
            for r in await conn.fetch("select * from hrms_appraisal_ratings where appraisal_id = $1 order by sort",
                                      row["id"])]
    return out


async def _locked(conn: asyncpg.Connection, appraisal_id: Any) -> asyncpg.Record:
    row = await conn.fetchrow(_SELECT + " where a.id = $1 for update of a", appraisal_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Appraisal not found")
    return row


async def _save_ratings(conn: asyncpg.Connection, appraisal_id: Any, body: AppraisalReviewIn, side: str) -> None:
    """Writes this side's ratings (`self` or `manager`); with `submit`, every KRA must be rated."""
    ids = {r["id"] for r in await conn.fetch("select id from hrms_appraisal_ratings where appraisal_id = $1",
                                              appraisal_id)}
    for r in body.ratings:
        if r.id not in ids:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That KRA isn't on this appraisal")
        await conn.execute(
            f"update hrms_appraisal_ratings set {side}_rating = $2, {side}_note = $3 where id = $1",
            r.id, r.rating, r.note)
    await conn.execute(f"update hrms_appraisals set {side}_comment = $2 where id = $1", appraisal_id, body.comment)
    if body.submit:
        missing = await conn.fetchval(
            f"select count(*) from hrms_appraisal_ratings where appraisal_id = $1 and {side}_rating is null",
            appraisal_id)
        if missing:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Rate every KRA before sending ({missing} left)")


async def _manager_review(conn: asyncpg.Connection, auth: AuthContext, row: asyncpg.Record,
                          body: AppraisalReviewIn) -> None:
    await _save_ratings(conn, row["id"], body, "manager")
    if body.submit:
        weighted = await conn.fetchval(
            "select sum(manager_rating * weight) from hrms_appraisal_ratings where appraisal_id = $1", row["id"])
        score = (Decimal(weighted) / 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        await conn.execute(
            """update hrms_appraisals set status = 'done', score = $2, manager_submitted_at = now(), reviewed_by = $3
                where id = $1""", row["id"], score, auth.user_id)


@router.get("/appraisals/{appraisal_id}", response_model=AppraisalOut)
async def get_appraisal(appraisal_id: UUID, auth: AuthContext = Depends(perm(READ))) -> AppraisalOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow(_SELECT + " where a.id = $1", appraisal_id)
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Appraisal not found")
        return await _appraisal(conn, row)


@router.put("/appraisals/{appraisal_id}/manager-review", response_model=AppraisalOut)
async def hr_review(appraisal_id: UUID, body: AppraisalReviewIn,
                    auth: AuthContext = Depends(perm(MANAGE))) -> AppraisalOut:
    """HR reviews on the manager's behalf (or without waiting for the self review)."""
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        row = await _locked(conn, appraisal_id)
        if row["employee_user"] is not None and str(row["employee_user"]) == auth.user_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You can't review your own appraisal")
        if row["status"] not in OPEN_STATES:
            raise HTTPException(status.HTTP_409_CONFLICT, f"This appraisal is {row['status']}")
        await _manager_review(conn, auth, row, body)
        return await _appraisal(conn, await conn.fetchrow(_SELECT + " where a.id = $1", appraisal_id))


@router.post("/appraisals/{appraisal_id}/cancel", response_model=AppraisalOut)
async def cancel_appraisal(appraisal_id: UUID, auth: AuthContext = Depends(perm(MANAGE))) -> AppraisalOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        row = await _locked(conn, appraisal_id)
        if row["status"] not in OPEN_STATES:
            raise HTTPException(status.HTTP_409_CONFLICT, f"This appraisal is {row['status']}")
        await conn.execute("update hrms_appraisals set status = 'cancelled' where id = $1", appraisal_id)
        return await _appraisal(conn, await conn.fetchrow(_SELECT + " where a.id = $1", appraisal_id))


# ── Cycles ──────────────────────────────────────────────────────────────────
async def _cycle(conn: asyncpg.Connection, cycle_id: Any, *, with_appraisals: bool) -> AppraisalCycleOut:
    c = await conn.fetchrow(
        """select c.*, t.name as template_name from hrms_appraisal_cycles c
             join hrms_appraisal_templates t on t.id = c.template_id where c.id = $1""", cycle_id)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cycle not found")
    counts = {r["status"]: r["n"] for r in await conn.fetch(
        "select status, count(*) as n from hrms_appraisals where cycle_id = $1 group by status", cycle_id)}
    out = AppraisalCycleOut(
        id=str(c["id"]), name=c["name"], period_start=c["period_start"], period_end=c["period_end"],
        template_id=str(c["template_id"]), template_name=c["template_name"], self_review=c["self_review"],
        status=c["status"], created_at=c["created_at"], opened_at=c["opened_at"], closed_at=c["closed_at"],
        counts=counts)
    if with_appraisals:
        rows = await conn.fetch(_SELECT + " where a.cycle_id = $1 order by e.name", cycle_id)
        out.appraisals = [await _appraisal(conn, r, ratings=False) for r in rows]
    return out


@router.get("/appraisal-cycles", response_model=list[AppraisalCycleOut])
async def list_cycles(auth: AuthContext = Depends(perm(READ))) -> list[AppraisalCycleOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        ids = await conn.fetch("select id from hrms_appraisal_cycles order by period_end desc, created_at desc limit 100")
        return [await _cycle(conn, r["id"], with_appraisals=False) for r in ids]


@router.post("/appraisal-cycles", response_model=AppraisalCycleOut, status_code=status.HTTP_201_CREATED)
async def create_cycle(body: AppraisalCycleCreate, auth: AuthContext = Depends(perm(MANAGE))) -> AppraisalCycleOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        await refs.ensure_visible(conn, "hrms_appraisal_templates", body.template_id)
        for eid in body.employee_ids or []:
            await refs.ensure_visible(conn, "hrms_employees", eid)
        cid = await conn.fetchval(
            """insert into hrms_appraisal_cycles (tenant_id, name, period_start, period_end, template_id, self_review,
                                                  employee_ids, created_by)
               values ($1, btrim($2), $3, $4, $5, $6, $7, $8) returning id""",
            auth.tenant_id, body.name, body.period_start, body.period_end, body.template_id, body.self_review,
            body.employee_ids, auth.user_id)
        return await _cycle(conn, cid, with_appraisals=True)


@router.get("/appraisal-cycles/{cycle_id}", response_model=AppraisalCycleOut)
async def get_cycle(cycle_id: UUID, auth: AuthContext = Depends(perm(READ))) -> AppraisalCycleOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await _cycle(conn, cycle_id, with_appraisals=True)


@router.post("/appraisal-cycles/{cycle_id}/open", response_model=AppraisalCycleOut)
async def open_cycle(cycle_id: UUID, auth: AuthContext = Depends(perm(MANAGE))) -> AppraisalCycleOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        c = await conn.fetchrow("select * from hrms_appraisal_cycles where id = $1 for update", cycle_id)
        if c is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Cycle not found")
        if c["status"] != "draft":
            raise HTTPException(status.HTTP_409_CONFLICT, f"This cycle is already {c['status']}")
        kras = await conn.fetch("select * from hrms_appraisal_template_kras where template_id = $1 order by sort",
                                c["template_id"])
        people = await conn.fetch(
            """select id, manager_id from hrms_employees
                where status = 'active' and (exit_date is null or exit_date >= $2)
                  and ($1::uuid[] is null or id = any($1::uuid[]))""", c["employee_ids"], c["period_start"])
        if not people or not kras:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Nobody to appraise, or no KRAs")
        first = "self_review" if c["self_review"] else "manager_review"
        for p in people:
            aid = await conn.fetchval(
                """insert into hrms_appraisals (tenant_id, cycle_id, employee_id, reviewer_id, status)
                   values ($1, $2, $3, $4, $5) returning id""",
                auth.tenant_id, cycle_id, p["id"], p["manager_id"], first)
            await conn.executemany(
                """insert into hrms_appraisal_ratings (tenant_id, appraisal_id, title, description, weight, sort)
                   values ($1, $2, $3, $4, $5, $6)""",
                [(auth.tenant_id, aid, k["title"], k["description"], k["weight"], k["sort"]) for k in kras])
        await conn.execute("update hrms_appraisal_cycles set status = 'open', opened_at = now() where id = $1", cycle_id)
        return await _cycle(conn, cycle_id, with_appraisals=True)


@router.post("/appraisal-cycles/{cycle_id}/close", response_model=AppraisalCycleOut)
async def close_cycle(cycle_id: UUID, auth: AuthContext = Depends(perm(MANAGE))) -> AppraisalCycleOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        c = await conn.fetchrow("select status from hrms_appraisal_cycles where id = $1 for update", cycle_id)
        if c is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Cycle not found")
        if c["status"] != "open":
            raise HTTPException(status.HTTP_409_CONFLICT, f"This cycle is {c['status']}")
        left = await conn.fetchval(
            "select count(*) from hrms_appraisals where cycle_id = $1 and status = any($2::text[])",
            cycle_id, list(OPEN_STATES))
        if left:
            raise HTTPException(status.HTTP_409_CONFLICT, f"{left} appraisal(s) aren't finished: finish or cancel them")
        await conn.execute("update hrms_appraisal_cycles set status = 'closed', closed_at = now() where id = $1",
                           cycle_id)
        return await _cycle(conn, cycle_id, with_appraisals=True)


# ── /me: my appraisals and the ones I review ───────────────────────────────
@portal.get("/appraisals", response_model=list[AppraisalOut])
async def my_appraisals(auth: AuthContext = Depends(current_auth),
                        employee_id: str = Depends(current_employee)) -> list[AppraisalOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(_SELECT + " where a.employee_id = $1 and a.status <> 'cancelled'"
                                          " order by c.period_end desc", employee_id)
        return [await _appraisal(conn, r, hide_manager=True) for r in rows]


@portal.put("/appraisals/{appraisal_id}/self", response_model=AppraisalOut)
async def self_review(appraisal_id: UUID, body: AppraisalReviewIn, auth: AuthContext = Depends(current_auth),
                      employee_id: str = Depends(current_employee)) -> AppraisalOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        row = await _locked(conn, appraisal_id)
        if str(row["employee_id"]) != employee_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Appraisal not found")
        if row["status"] != "self_review":
            raise HTTPException(status.HTTP_409_CONFLICT, "Your self review was already sent")
        await _save_ratings(conn, appraisal_id, body, "self")
        if body.submit:
            await conn.execute(
                """update hrms_appraisals set status = 'manager_review', self_submitted_at = now()
                    where id = $1""", appraisal_id)
        return await _appraisal(conn, await conn.fetchrow(_SELECT + " where a.id = $1", appraisal_id),
                                hide_manager=True)


@portal.get("/reviews", response_model=list[AppraisalOut])
async def my_reviews(auth: AuthContext = Depends(current_auth),
                     employee_id: str = Depends(current_employee)) -> list[AppraisalOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(_SELECT + " where a.reviewer_id = $1 and a.status = 'manager_review'"
                                          " order by e.name", employee_id)
        return [await _appraisal(conn, r) for r in rows]


@portal.put("/reviews/{appraisal_id}", response_model=AppraisalOut)
async def review_as_manager(appraisal_id: UUID, body: AppraisalReviewIn, auth: AuthContext = Depends(current_auth),
                            employee_id: str = Depends(current_employee)) -> AppraisalOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        row = await _locked(conn, appraisal_id)
        if str(row["reviewer_id"]) != employee_id or row["status"] != "manager_review":
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Nothing to review here")
        await _manager_review(conn, auth, row, body)
        return await _appraisal(conn, await conn.fetchrow(_SELECT + " where a.id = $1", appraisal_id))
