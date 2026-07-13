"""Authentication + tenant onboarding.

Signup creates the whole tenant bootstrap in one owner-side transaction:
tenant -> Owner role -> owner permissions -> user -> entitlements -> session.
Owner pool is used because RLS has no tenant context to key on during creation.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status

from .. import db
from ..config import settings
from ..deps import AuthContext, current_auth
from ..models import (
    INDUSTRIES,
    SECTIONS,
    EntitlementOut,
    LoginRequest,
    MeResponse,
    SignupRequest,
    TenantOut,
    UserOut,
)
from ..ratelimit import rate_limit
from ..security import (
    SESSION_COOKIE,
    hash_password,
    new_session_token,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.is_prod,
        max_age=settings.session_ttl_days * 24 * 3600,
        path="/",
    )


async def _create_session(conn, user_id: str, tenant_id: str) -> str:
    token = new_session_token()
    expires = datetime.now(timezone.utc) + timedelta(days=settings.session_ttl_days)
    await conn.execute(
        "insert into sessions (id, user_id, tenant_id, expires_at) values ($1,$2,$3,$4)",
        token, user_id, tenant_id, expires,
    )
    return token


@router.post("/signup", response_model=MeResponse, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(rate_limit(5, 60))])
async def signup(body: SignupRequest, response: Response) -> MeResponse:
    if body.industry_type not in INDUSTRIES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown industry: {body.industry_type}")
    sections = [s for s in body.sections if s in SECTIONS] or ["crm"]

    async with db.owner_conn() as conn:
        async with conn.transaction():
            exists = await conn.fetchval("select 1 from users where email = $1", body.email)
            if exists:
                raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

            tenant_id = await conn.fetchval(
                "insert into tenants (name, industry_type) values ($1,$2) returning id",
                body.company_name, body.industry_type,
            )
            role_id = await conn.fetchval(
                "insert into roles (tenant_id, name, is_system) values ($1,'Owner',true) returning id",
                tenant_id,
            )
            # Owner gets admin on every section (incl. settings + accounts approvals).
            for section in SECTIONS + ["settings", "accounts"]:
                await conn.execute(
                    "insert into permissions (tenant_id, role_id, section, action) values ($1,$2,$3,'admin')",
                    tenant_id, role_id, section,
                )
            user_id = await conn.fetchval(
                """insert into users (tenant_id, email, password_hash, name, role_id)
                   values ($1,$2,$3,$4,$5) returning id""",
                tenant_id, body.email, hash_password(body.password), body.name, role_id,
            )
            # Enable the chosen sections; the rest exist but disabled.
            for section in SECTIONS:
                await conn.execute(
                    "insert into entitlements (tenant_id, section_key, enabled) values ($1,$2,$3)",
                    tenant_id, section, section in sections,
                )
            token = await _create_session(conn, user_id, tenant_id)

            tenant_row = await conn.fetchrow("select id,name,industry_type,status from tenants where id=$1", tenant_id)
            ent_rows = await conn.fetch(
                "select section_key, enabled, limits from entitlements where tenant_id=$1 order by section_key",
                tenant_id,
            )

    _set_session_cookie(response, token)
    return MeResponse(
        user=UserOut(id=str(user_id), email=body.email, name=body.name, role="Owner"),
        tenant=TenantOut(id=str(tenant_row["id"]), name=tenant_row["name"],
                         industry_type=tenant_row["industry_type"], status=tenant_row["status"]),
        entitlements=[EntitlementOut(section_key=r["section_key"], enabled=r["enabled"], limits=r["limits"])
                      for r in ent_rows],
    )


@router.post("/login", response_model=UserOut, dependencies=[Depends(rate_limit(10, 60))])
async def login(body: LoginRequest, response: Response) -> UserOut:
    async with db.owner_conn() as conn:
        user = await conn.fetchrow(
            """select u.id, u.tenant_id, u.email, u.name, u.password_hash, r.name as role
               from users u left join roles r on r.id = u.role_id
               where u.email = $1 and u.status = 'active'""",
            body.email,
        )
        if user is None or not verify_password(user["password_hash"], body.password):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
        token = await _create_session(conn, str(user["id"]), str(user["tenant_id"]))

    _set_session_cookie(response, token)
    return UserOut(id=str(user["id"]), email=user["email"], name=user["name"], role=user["role"])


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response, auth: AuthContext = Depends(current_auth)) -> Response:
    async with db.owner_conn() as conn:
        await conn.execute("delete from sessions where id = $1", auth.session_id)
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=MeResponse)
async def me(auth: AuthContext = Depends(current_auth)) -> MeResponse:
    # Tenant-scoped reads via the app pool → exercises RLS end-to-end.
    async with db.tenant_conn(auth.tenant_id) as conn:
        tenant_row = await conn.fetchrow("select id,name,industry_type,status from tenants where id=$1", auth.tenant_id)
        ent_rows = await conn.fetch(
            "select section_key, enabled, limits from entitlements where tenant_id=$1 order by section_key",
            auth.tenant_id,
        )
    return MeResponse(
        user=UserOut(id=auth.user_id, email=auth.email, name=auth.name, role=auth.role),
        tenant=TenantOut(id=str(tenant_row["id"]), name=tenant_row["name"],
                         industry_type=tenant_row["industry_type"], status=tenant_row["status"]),
        entitlements=[EntitlementOut(section_key=r["section_key"], enabled=r["enabled"], limits=r["limits"])
                      for r in ent_rows],
    )
