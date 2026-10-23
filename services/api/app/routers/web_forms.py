"""Web lead forms and the assignment pool (wave D, C12/C13). Shaping forms
and the pool is CRM settings work (crm.settings.manage). The visitor's side
is /public/forms/{public_id}: no session, and nothing about routing, owners
or the tenant ever goes back to the browser. The logic is in app/web_forms.py.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from .. import context, db, ratelimit, web_forms
from ..crm_selling_models import (
    PersonOut,
    PoolMemberOut,
    PoolPut,
    WebFormAnswer,
    WebFormIn,
    WebFormOut,
    WebFormPatch,
    WebFormPublic,
    WebFormSubmit,
)
from ..deps import AuthContext
from ..rbac import perm

router = APIRouter(prefix="/crm", tags=["crm-web-forms"])
public = APIRouter(prefix="/public/forms", tags=["public"])

READS_PER_MINUTE = 60
SUBMITS_PER_MINUTE = 5


# ── Forms ───────────────────────────────────────────────────────────────────
@router.get("/web-forms", response_model=list[WebFormOut])
async def list_forms(auth: AuthContext = Depends(perm("crm.settings.manage"))) -> list[WebFormOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(web_forms.SELECT + " order by f.active desc, f.created_at")
    return [web_forms.out(r) for r in rows]


@router.post("/web-forms", response_model=WebFormOut, status_code=status.HTTP_201_CREATED)
async def create_form(body: WebFormIn, auth: AuthContext = Depends(perm("crm.settings.manage"))) -> WebFormOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        await web_forms.check_routing(conn, body.pipeline_id, body.stage_id, body.owner_id)
        fid = await conn.fetchval(
            """insert into crm_web_forms (tenant_id, public_id, name, title, intro, thank_you, fields, pipeline_id,
                                          stage_id, source, owner_id, daily_cap, created_by, consent_label)
               values ($1,$2,btrim($3),$4,$5,$6,$7,$8,$9,btrim($10),$11,$12,$13,btrim($14)) returning id""",
            auth.tenant_id, web_forms.new_public_id(), body.name, body.title, body.intro, body.thank_you,
            list(dict.fromkeys(body.fields)), body.pipeline_id, body.stage_id, body.source, body.owner_id,
            body.daily_cap, auth.user_id, body.consent_label)
        return web_forms.out(await conn.fetchrow(web_forms.SELECT + " where f.id = $1", fid))


@router.patch("/web-forms/{form_id}", response_model=WebFormOut)
async def update_form(form_id: str, body: WebFormPatch,
                      auth: AuthContext = Depends(perm("crm.settings.manage"))) -> WebFormOut:
    fields = body.model_dump(exclude_unset=True)
    # Explicit nulls clear routing (back to the default pipeline, the pool).
    fields = {k: v for k, v in fields.items() if v is not None or k in ("pipeline_id", "stage_id", "owner_id")}
    if "fields" in fields:
        fields["fields"] = list(dict.fromkeys(fields["fields"]))
    async with db.tenant_conn(auth.tenant_id) as conn:
        cur = await conn.fetchrow("select * from crm_web_forms where id = $1 for update", form_id)
        if cur is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Form not found")
        after = {**dict(cur), **fields}
        await web_forms.check_routing(conn, after["pipeline_id"], after["stage_id"], after["owner_id"])
        if fields:
            cols = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(fields))
            await conn.execute(f"update crm_web_forms set {cols}, updated_at = now() where id = $1",
                               form_id, *fields.values())
        return web_forms.out(await conn.fetchrow(web_forms.SELECT + " where f.id = $1", form_id))


# ── The pool ────────────────────────────────────────────────────────────────
_POOL = """select p.user_id, u.name, p.active, p.daily_cap,
                  case when p.assigned_day = current_date then p.assigned_today else 0 end as assigned_today
             from crm_assignment_pool p join users u on u.id = p.user_id order by u.name, p.user_id"""


def _member(r: asyncpg.Record) -> PoolMemberOut:
    return PoolMemberOut(user_id=str(r["user_id"]), name=r["name"], active=r["active"],
                         daily_cap=r["daily_cap"], assigned_today=r["assigned_today"])


@router.get("/assignment/pool", response_model=list[PoolMemberOut])
async def get_pool(auth: AuthContext = Depends(perm("crm.settings.manage"))) -> list[PoolMemberOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return [_member(r) for r in await conn.fetch(_POOL)]


@router.get("/assignment/people", response_model=list[PersonOut])
async def pool_candidates(auth: AuthContext = Depends(perm("crm.settings.manage"))) -> list[PersonOut]:
    """Active teammates, by name only: a CRM admin picks the pool without
    needing the team screen's rights (emails and roles stay there)."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch("select id, name from users where status = 'active' order by name, id")
    return [PersonOut(id=str(r["id"]), name=r["name"]) for r in rows]


@router.put("/assignment/pool", response_model=list[PoolMemberOut])
async def put_pool(body: PoolPut, auth: AuthContext = Depends(perm("crm.settings.manage"))) -> list[PoolMemberOut]:
    """Replace the pool. Members keep their place in the turn and today's count."""
    wanted = {m.user_id: m for m in body.members}
    async with db.tenant_conn(auth.tenant_id) as conn:
        found = {r["id"] for r in await conn.fetch(
            "select id from users where id = any($1::uuid[]) and status = 'active'", list(wanted))}
        if set(wanted) - found:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
        await conn.execute("delete from crm_assignment_pool where not (user_id = any($1::uuid[]))", list(wanted))
        await conn.executemany(
            """insert into crm_assignment_pool (tenant_id, user_id, active, daily_cap) values ($1,$2,$3,$4)
               on conflict (tenant_id, user_id) do update set active = excluded.active,
                                                              daily_cap = excluded.daily_cap""",
            [(auth.tenant_id, m.user_id, m.active, m.daily_cap) for m in wanted.values()])
        return [_member(r) for r in await conn.fetch(_POOL)]


# ── The visitor ─────────────────────────────────────────────────────────────
def _limit(bucket: str, per_minute: int) -> Callable[[Request, Response], Awaitable[None]]:
    """Per IP across every form: a new public id must not mean a new bucket."""
    async def dep(request: Request, response: Response) -> None:
        response.headers["Cache-Control"] = "no-store"
        retry = await ratelimit.hit(f"ip:{ratelimit.client_ip(request)}:{bucket}", per_minute, 60)
        if retry:
            raise ratelimit.too_many(retry)
    return dep


@public.get("/{public_id}", response_model=WebFormPublic, dependencies=[Depends(_limit("form-read", READS_PER_MINUTE))])
async def describe(public_id: str) -> WebFormPublic:
    form = await web_forms.resolve(public_id)
    async with db.tenant_conn(str(form["tenant_id"])) as conn:
        return await web_forms.describe(conn, form["id"])


@public.post("/{public_id}", response_model=WebFormAnswer,
             dependencies=[Depends(_limit("form-submit", SUBMITS_PER_MINUTE))])
async def submit(public_id: str, body: WebFormSubmit, request: Request) -> WebFormAnswer:
    form = await web_forms.resolve(public_id)
    context.set_actor("", "public")
    async with db.tenant_conn(str(form["tenant_id"])) as conn:
        thanks: str = await conn.fetchval("select coalesce(nullif(thank_you, ''), $2) from crm_web_forms where id = $1",
                                          form["id"], web_forms.THANK_YOU)
        verdict = web_forms.check_ticket(public_id, body.ticket)
        if verdict == "stale":
            raise HTTPException(status.HTTP_409_CONFLICT, "This page was open too long. Reload it and send again.")
        # A bot gets the same thank-you as a person, and nothing is saved.
        if verdict == "bot" or body.values.website.strip():
            return WebFormAnswer(message=thanks)
        return WebFormAnswer(message=await web_forms.submit(conn, str(form["tenant_id"]), form["id"], body.values,
                                                            ratelimit.client_ip(request)))
