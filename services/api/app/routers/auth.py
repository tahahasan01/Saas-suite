"""Authentication + tenant onboarding.

Signup creates the whole tenant bootstrap in one owner-side transaction:
tenant -> Owner role -> owner permissions -> user -> entitlements -> session.
Owner pool is used because RLS has no tenant context to key on during creation.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status

from .. import db, email, sampledata, tokens
from ..config import settings
from ..deps import AuthContext, current_auth
from ..models import (
    INDUSTRIES,
    SECTIONS,
    AcceptInviteRequest,
    EntitlementOut,
    ForgotRequest,
    LoginRequest,
    MeResponse,
    ResetRequest,
    SignupRequest,
    TenantOut,
    UserOut,
    VerifyRequest,
)
from ..ratelimit import rate_limit
from ..security import (
    SESSION_COOKIE,
    hash_password,
    hash_session_token,
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
    """Returns the raw token for the cookie; only its hash is persisted."""
    token = new_session_token()
    expires = datetime.now(timezone.utc) + timedelta(days=settings.session_ttl_days)
    await conn.execute(
        "insert into sessions (id, user_id, tenant_id, expires_at) values ($1,$2,$3,$4)",
        hash_session_token(token), user_id, tenant_id, expires,
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
            # Start a 14-day trial with Growth-level features.
            await conn.execute(
                """insert into subscriptions (tenant_id, plan, status, trial_ends_at)
                   values ($1, 'growth', 'trialing', now() + interval '14 days')""",
                tenant_id,
            )
            token = await _create_session(conn, user_id, tenant_id)

            tenant_row = await conn.fetchrow("select id,name,industry_type,status from tenants where id=$1", tenant_id)
            ent_rows = await conn.fetch(
                "select section_key, enabled, limits from entitlements where tenant_id=$1 order by section_key",
                tenant_id,
            )

    # Seed a live demo workspace so the new tenant never lands in an empty app.
    if body.sample_data:
        try:
            async with db.tenant_conn(str(tenant_id)) as sconn:
                await sampledata.seed(sconn, str(tenant_id), str(user_id), sections)
        except Exception:
            pass  # best-effort — never fail signup over sample data

    try:  # email verification link (best-effort)
        vtoken = await tokens.create("verify", email=body.email, user_id=str(user_id), ttl_hours=48)
        await email.send_verification(body.email, vtoken)
    except Exception:
        pass

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


@router.post("/forgot", status_code=status.HTTP_204_NO_CONTENT,
             dependencies=[Depends(rate_limit(5, 60))])
async def forgot(body: ForgotRequest, response: Response) -> Response:
    async with db.owner_conn() as conn:
        user = await conn.fetchrow("select id, email from users where email=$1", body.email)
    if user:  # always 204 — never leak whether an email exists
        token = await tokens.create("reset", email=user["email"], user_id=str(user["id"]), ttl_hours=1)
        await email.send_password_reset(user["email"], token)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.post("/reset", status_code=status.HTTP_204_NO_CONTENT)
async def reset(body: ResetRequest, response: Response) -> Response:
    row = await tokens.consume(body.token, "reset")
    if row is None or not row["user_id"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired reset link")
    async with db.owner_conn() as conn:
        await conn.execute("update users set password_hash=$1, updated_at=now() where id=$2",
                           hash_password(body.password), row["user_id"])
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.post("/verify", status_code=status.HTTP_204_NO_CONTENT)
async def verify(body: VerifyRequest, response: Response) -> Response:
    row = await tokens.consume(body.token, "verify")
    if row is None or not row["user_id"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired verification link")
    async with db.owner_conn() as conn:
        await conn.execute("update users set email_verified=true where id=$1", row["user_id"])
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.post("/accept-invite", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def accept_invite(body: AcceptInviteRequest, response: Response) -> UserOut:
    row = await tokens.consume(body.token, "invite")
    if row is None or not row["tenant_id"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired invite")
    async with db.owner_conn() as conn:
        exists = await conn.fetchval("select 1 from users where email=$1", row["email"])
        if exists:
            raise HTTPException(status.HTTP_409_CONFLICT, "That email already has an account")
        user_id = await conn.fetchval(
            """insert into users (tenant_id, email, password_hash, name, role_id, email_verified)
               values ($1,$2,$3,$4,$5,true) returning id""",
            row["tenant_id"], row["email"], hash_password(body.password), body.name, row["role_id"])
        # An employee invite links the new login to its staff record, which is
        # what every /me/* endpoint resolves the caller by.
        if row["employee_id"]:
            await conn.execute(
                "update hrms_employees set user_id=$1 where id=$2", user_id, row["employee_id"])
        token = await _create_session(conn, str(user_id), str(row["tenant_id"]))
        role = await conn.fetchval("select name from roles where id=$1", row["role_id"])
    _set_session_cookie(response, token)
    return UserOut(id=str(user_id), email=row["email"], name=body.name, role=role)


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
        # This login is the employee portal iff it is linked to a staff record.
        # The frontend renders the self-service nav instead of the admin app.
        is_employee = bool(await conn.fetchval(
            "select 1 from hrms_employees where user_id=$1", auth.user_id))
    return MeResponse(
        user=UserOut(id=auth.user_id, email=auth.email, name=auth.name, role=auth.role),
        tenant=TenantOut(id=str(tenant_row["id"]), name=tenant_row["name"],
                         industry_type=tenant_row["industry_type"], status=tenant_row["status"]),
        entitlements=[EntitlementOut(section_key=r["section_key"], enabled=r["enabled"], limits=r["limits"])
                      for r in ent_rows],
        employee_portal=is_employee,
    )
