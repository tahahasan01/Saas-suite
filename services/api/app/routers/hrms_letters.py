"""HR letters and letter requests (wave C, H17/H37, St12, 0105).

`hrms.letter.read` sees templates, issued letters and requests;
`hrms.letter.manage` edits templates, issues letters and answers requests.
An issued letter keeps its text and number for good. Employees ask for
letters and download the ones issued to them through /me.
"""
from __future__ import annotations

from typing import Any
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from .. import db, letters, rbac, refs
from ..deps import AuthContext, current_auth, current_employee
from ..models import (LetterDecline, LetterIssue, LetterOut, LetterPreview, LetterPreviewIn, LetterRequestIn,
                      LetterRequestOut, LetterRequestStatus, LetterTemplateIn, LetterTemplateOut, LetterTemplateUpdate)
from ..rbac import perm

router = APIRouter(prefix="/hrms", tags=["hrms"])
portal = APIRouter(prefix="/me", tags=["portal"])

READ, MANAGE = "hrms.letter.read", "hrms.letter.manage"


def _check(text: str) -> None:
    bad = letters.unknown_placeholders(text)
    if bad:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            "Unknown placeholder(s): " + ", ".join(f"{{{{{b}}}}}" for b in sorted(bad)))


def _tpl(r: asyncpg.Record) -> LetterTemplateOut:
    return LetterTemplateOut(id=str(r["id"]), kind=r["kind"], name=r["name"], title=r["title"], body=r["body"],
                             active=r["active"])


# ── Templates ───────────────────────────────────────────────────────────────
@router.get("/letter-templates", response_model=list[LetterTemplateOut])
async def list_templates(auth: AuthContext = Depends(perm(READ))) -> list[LetterTemplateOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await letters.ensure_starters(conn, auth.tenant_id)
        rows = await conn.fetch("select * from hrms_letter_templates order by not active, kind, name")
    return [_tpl(r) for r in rows]


@router.get("/letter-placeholders", response_model=dict[str, str])
async def placeholders(auth: AuthContext = Depends(perm(READ))) -> dict[str, str]:
    return letters.PLACEHOLDERS


@router.post("/letter-templates", response_model=LetterTemplateOut, status_code=status.HTTP_201_CREATED)
async def create_template(body: LetterTemplateIn, auth: AuthContext = Depends(perm(MANAGE))) -> LetterTemplateOut:
    _check(body.body + body.title)
    async with db.tenant_conn(auth.tenant_id) as conn:
        try:
            row = await conn.fetchrow(
                """insert into hrms_letter_templates (tenant_id, kind, name, title, body)
                   values ($1, $2, btrim($3), btrim($4), $5) returning *""",
                auth.tenant_id, body.kind, body.name, body.title, body.body)
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, "A template with that name already exists")
    return _tpl(row)


@router.patch("/letter-templates/{template_id}", response_model=LetterTemplateOut)
async def update_template(template_id: UUID, body: LetterTemplateUpdate,
                          auth: AuthContext = Depends(perm(MANAGE))) -> LetterTemplateOut:
    _check((body.body or "") + (body.title or ""))
    async with db.tenant_conn(auth.tenant_id) as conn:
        try:
            row = await conn.fetchrow(
                """update hrms_letter_templates set name = coalesce(btrim($2), name), title = coalesce(btrim($3), title),
                          body = coalesce($4, body), active = coalesce($5, active), updated_at = now()
                    where id = $1 returning *""", template_id, body.name, body.title, body.body, body.active)
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, "A template with that name already exists")
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Template not found")
    return _tpl(row)


# ── Issuing ─────────────────────────────────────────────────────────────────
async def _template(conn: asyncpg.Connection, template_id: Any) -> asyncpg.Record:
    t = await conn.fetchrow("select * from hrms_letter_templates where id = $1", template_id)
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Template not found")
    if not t["active"]:
        raise HTTPException(status.HTTP_409_CONFLICT, "That template is switched off")
    return t


async def _values(conn: asyncpg.Connection, auth: AuthContext, employee_id: Any, text: str) -> dict[str, str]:
    reveal = await rbac.holds_key(conn, auth, "payroll.salary.read")
    if letters.uses_salary(text) and not reveal:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This letter shows the salary: it needs payroll.salary.read")
    return await letters.values_for(conn, employee_id, reveal=reveal)


@router.post("/employees/{employee_id}/letters/preview", response_model=LetterPreview)
async def preview(employee_id: UUID, body: LetterPreviewIn, auth: AuthContext = Depends(perm(MANAGE))) -> LetterPreview:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "hrms_employees", employee_id)
        t = await _template(conn, body.template_id)
        values = await _values(conn, auth, employee_id, t["body"] + t["title"])
        return LetterPreview(title=letters.fill(t["title"], values), body=letters.fill(t["body"], values))


_LETTER = """select l.*, e.name as employee_name from hrms_letters l join hrms_employees e on e.id = l.employee_id"""


HIDDEN = "This letter shows pay details: it needs payroll.salary.read to open."


def _letter(r: asyncpg.Record, *, show_pay: bool = True) -> LetterOut:
    body = r["body"] if show_pay or not r["shows_pay"] else HIDDEN
    return LetterOut(id=str(r["id"]), employee_id=str(r["employee_id"]), employee_name=r["employee_name"],
                     kind=r["kind"], number=r["number"], title=r["title"], body=body, issued_at=r["issued_at"])


@router.post("/employees/{employee_id}/letters", response_model=LetterOut, status_code=status.HTTP_201_CREATED)
async def issue(employee_id: UUID, body: LetterIssue, auth: AuthContext = Depends(perm(MANAGE))) -> LetterOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        await refs.ensure_visible(conn, "hrms_employees", employee_id)
        t = await _template(conn, body.template_id)
        title, text = body.title or t["title"], body.body or t["body"]
        _check(title + text)
        values = await _values(conn, auth, employee_id, title + text)
        if body.request_id is not None:
            req = await conn.fetchrow("select * from hrms_letter_requests where id = $1 for update", body.request_id)
            if req is None or req["employee_id"] != employee_id:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Letter request not found")
            if req["status"] != "pending":
                raise HTTPException(status.HTTP_409_CONFLICT, f"This request was already {req['status']}")
        # One numbering per company and year; the lock keeps two issues apart.
        await conn.execute("select pg_advisory_xact_lock(hashtext('hrms_letters:' || $1))", auth.tenant_id)
        year = (await conn.fetchval("select current_date")).year
        n = await conn.fetchval("select count(*) + 1 from hrms_letters where number like $1", f"HR-{year}-%")
        number = f"HR-{year}-{n:04d}"
        values["letter.number"] = number
        revealed = await rbac.holds_key(conn, auth, "payroll.salary.read")
        lid = await conn.fetchval(
            """insert into hrms_letters (tenant_id, employee_id, template_id, request_id, kind, number, title, body,
                                         issued_by, shows_pay)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id""",
            auth.tenant_id, employee_id, t["id"], body.request_id, t["kind"], number,
            letters.fill(title, values), letters.fill(text, values), auth.user_id,
            letters.shows_pay(title + text, revealed=revealed))
        if body.request_id is not None:
            await conn.execute(
                """update hrms_letter_requests set status = 'issued', letter_id = $2, decided_by = $3,
                          decided_at = now() where id = $1""", body.request_id, lid, auth.user_id)
        return _letter(await conn.fetchrow(_LETTER + " where l.id = $1", lid))


@router.get("/employees/{employee_id}/letters", response_model=list[LetterOut])
async def employee_letters(employee_id: UUID, auth: AuthContext = Depends(perm(READ))) -> list[LetterOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "hrms_employees", employee_id)
        show = await rbac.holds_key(conn, auth, "payroll.salary.read")
        rows = await conn.fetch(_LETTER + " where l.employee_id = $1 order by l.issued_at desc", employee_id)
    return [_letter(r, show_pay=show) for r in rows]


async def _pdf(conn: asyncpg.Connection, row: asyncpg.Record | None) -> Response:
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Letter not found")
    company = await conn.fetchval("select name from tenants where id = current_setting('app.tenant_id')::uuid")
    return Response(letters.render_pdf(company or "", row), media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="{row["number"]}.pdf"', "Cache-Control": "no-store"})


@router.get("/letters/{letter_id}/pdf")
async def letter_pdf(letter_id: UUID, auth: AuthContext = Depends(perm(READ))) -> Response:
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow("select * from hrms_letters where id = $1", letter_id)
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Letter not found")
        await refs.ensure_visible(conn, "hrms_employees", row["employee_id"])
        if row["shows_pay"] and not await rbac.holds_key(conn, auth, "payroll.salary.read"):
            raise HTTPException(status.HTTP_403_FORBIDDEN, HIDDEN)
        return await _pdf(conn, row)


# ── Requests ────────────────────────────────────────────────────────────────
_REQ = """select r.*, e.name as employee_name from hrms_letter_requests r join hrms_employees e on e.id = r.employee_id"""


def _req(r: asyncpg.Record) -> LetterRequestOut:
    return LetterRequestOut(id=str(r["id"]), employee_id=str(r["employee_id"]), employee_name=r["employee_name"],
                            kind=r["kind"], purpose=r["purpose"], status=r["status"],
                            letter_id=str(r["letter_id"]) if r["letter_id"] else None, note=r["note"],
                            created_at=r["created_at"], decided_at=r["decided_at"])


@router.get("/letter-requests", response_model=list[LetterRequestOut])
async def list_requests(status_filter: LetterRequestStatus | None = Query(None, alias="status"),
                        auth: AuthContext = Depends(perm(READ))) -> list[LetterRequestOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(_REQ + """ where ($1::text is null or r.status = $1)
                                          order by r.status = 'pending' desc, r.created_at desc limit 300""",
                                status_filter)
    return [_req(r) for r in rows]


async def _answer(auth: AuthContext, request_id: UUID, to: str, note: str) -> LetterRequestOut:
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        cur = await conn.fetchval("select status from hrms_letter_requests where id = $1 for update", request_id)
        if cur is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Letter request not found")
        if cur != "pending":
            raise HTTPException(status.HTTP_409_CONFLICT, f"This request was already {cur}")
        await conn.execute(
            """update hrms_letter_requests set status = $2, note = $3, decided_by = $4, decided_at = now()
                where id = $1""", request_id, to, note, auth.user_id)
        return _req(await conn.fetchrow(_REQ + " where r.id = $1", request_id))


@router.post("/letter-requests/{request_id}/decline", response_model=LetterRequestOut)
async def decline(request_id: UUID, body: LetterDecline, auth: AuthContext = Depends(perm(MANAGE))) -> LetterRequestOut:
    if not body.note.strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Say why")
    return await _answer(auth, request_id, "declined", body.note)


@router.post("/letter-requests/{request_id}/done", response_model=LetterRequestOut)
async def done(request_id: UUID, body: LetterDecline, auth: AuthContext = Depends(perm(MANAGE))) -> LetterRequestOut:
    """Answered without a letter (an ID card handed over, say)."""
    return await _answer(auth, request_id, "issued", body.note)


# ── /me ─────────────────────────────────────────────────────────────────────
@portal.post("/letter-requests", response_model=LetterRequestOut, status_code=status.HTTP_201_CREATED)
async def ask(body: LetterRequestIn, auth: AuthContext = Depends(current_auth),
              employee_id: str = Depends(current_employee)) -> LetterRequestOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rid = await conn.fetchval(
            """insert into hrms_letter_requests (tenant_id, employee_id, kind, purpose) values ($1, $2, $3, $4)
               returning id""", auth.tenant_id, employee_id, body.kind, body.purpose)
        return _req(await conn.fetchrow(_REQ + " where r.id = $1", rid))


@portal.get("/letter-requests", response_model=list[LetterRequestOut])
async def my_requests(auth: AuthContext = Depends(current_auth),
                      employee_id: str = Depends(current_employee)) -> list[LetterRequestOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(_REQ + " where r.employee_id = $1 order by r.created_at desc limit 100", employee_id)
    return [_req(r) for r in rows]


@portal.get("/letters", response_model=list[LetterOut])
async def my_letters(auth: AuthContext = Depends(current_auth),
                     employee_id: str = Depends(current_employee)) -> list[LetterOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(_LETTER + " where l.employee_id = $1 order by l.issued_at desc", employee_id)
    return [_letter(r) for r in rows]


@portal.get("/letters/{letter_id}/pdf")
async def my_letter_pdf(letter_id: UUID, auth: AuthContext = Depends(current_auth),
                        employee_id: str = Depends(current_employee)) -> Response:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await _pdf(conn, await conn.fetchrow(
            "select * from hrms_letters where id = $1 and employee_id = $2", letter_id, employee_id))
