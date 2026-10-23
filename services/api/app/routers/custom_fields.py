"""Custom fields on leads and contacts (wave D, C26). Defining them is CRM
settings work; anyone who reads the records reads the definitions (the
forms are built from them). Values are written with the lead or contact
itself and checked in app/custom_fields.py."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from .. import custom_fields, db, rbac
from ..crm_selling_models import CustomFieldIn, CustomFieldOut, CustomFieldPatch
from ..deps import AuthContext, current_auth
from ..models import CustomFieldEntity
from ..rbac import perm

router = APIRouter(prefix="/custom-fields", tags=["custom-fields"])

_READ = {"lead": "crm.lead.read", "contact": "contacts.contact.read"}


@router.get("", response_model=list[CustomFieldOut])
async def list_fields(entity: CustomFieldEntity, include_archived: bool = Query(False),
                      auth: AuthContext = Depends(current_auth)) -> list[CustomFieldOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        if await rbac.scope_of(conn, auth, _READ[entity]) is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires {_READ[entity]}")
        rows = await conn.fetch(
            """select * from custom_fields where entity = $1 and ($2 or archived_at is null)
                order by archived_at nulls first, position, created_at""", entity, include_archived)
    return [custom_fields.out(r) for r in rows]


@router.post("", response_model=CustomFieldOut, status_code=status.HTTP_201_CREATED)
async def create_field(body: CustomFieldIn, auth: AuthContext = Depends(perm("crm.settings.manage"))) -> CustomFieldOut:
    if body.kind == "select" and not body.options:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A choice field needs its choices")
    async with db.tenant_conn(auth.tenant_id) as conn:
        key = await custom_fields.free_key(conn, body.entity, body.label)
        pos = await conn.fetchval("select coalesce(max(position) + 1, 0) from custom_fields where entity = $1",
                                  body.entity)
        row = await conn.fetchrow(
            """insert into custom_fields (tenant_id, entity, key, label, kind, options, position)
               values ($1, $2, $3, btrim($4), $5, $6, $7) returning *""",
            auth.tenant_id, body.entity, key, body.label, body.kind,
            body.options if body.kind == "select" else [], pos)
    return custom_fields.out(row)


@router.patch("/{field_id}", response_model=CustomFieldOut)
async def update_field(field_id: str, body: CustomFieldPatch,
                       auth: AuthContext = Depends(perm("crm.settings.manage"))) -> CustomFieldOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        cur = await conn.fetchrow("select * from custom_fields where id = $1 for update", field_id)
        if cur is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Field not found")
        cols: dict[str, object] = {}
        if body.label is not None:
            cols["label"] = body.label.strip()
        if body.options is not None:
            if cur["kind"] != "select":
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Only a choice field has choices")
            choices = list(dict.fromkeys(o.strip() for o in body.options if o.strip()))
            if not choices:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A choice field needs its choices")
            cols["options"] = choices
        if body.position is not None:
            cols["position"] = body.position
        if cols:
            sets = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(cols))
            await conn.execute(f"update custom_fields set {sets} where id = $1", field_id, *cols.values())
        if body.archived is not None:
            await conn.execute(
                "update custom_fields set archived_at = case when $2 then coalesce(archived_at, now()) end "
                "where id = $1", field_id, body.archived)
        return custom_fields.out(await conn.fetchrow("select * from custom_fields where id = $1", field_id))
