"""My profile (3A settings): the signed-in user's own name and language.

Only ever the caller's own row (no id in the path). The password is changed
through POST /auth/password, which re-hashes, bumps auth_epoch (D-05) and
re-issues the caller's session.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from .. import db
from ..deps import AuthContext, current_auth
from ..org_models import ProfileOut, ProfileUpdate

router = APIRouter(prefix="/profile", tags=["profile"])


async def _load(auth: AuthContext) -> ProfileOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow("select id, name, email, locale from users where id = $1", auth.user_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return ProfileOut(id=str(row["id"]), name=row["name"], email=row["email"], locale=row["locale"] or "en")


@router.get("", response_model=ProfileOut)
async def get_profile(auth: AuthContext = Depends(current_auth)) -> ProfileOut:
    return await _load(auth)


@router.patch("", response_model=ProfileOut)
async def update_profile(body: ProfileUpdate, auth: AuthContext = Depends(current_auth)) -> ProfileOut:
    fields = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if fields:
        sets = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(fields))
        async with db.tenant_conn(auth.tenant_id) as conn:
            await conn.execute(f"update users set {sets}, updated_at = now() where id = $1",
                               auth.user_id, *fields.values())
    return await _load(auth)
