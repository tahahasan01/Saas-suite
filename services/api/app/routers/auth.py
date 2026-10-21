"""Authentication + tenant onboarding.

Signup creates the whole tenant bootstrap in one owner-side transaction:
tenant -> Owner role -> owner permissions -> user -> entitlements -> session.
Owner pool is used because RLS has no tenant context to key on during creation.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status

from .. import audit, context, db, email, ratelimit, rbac, sampledata, tokens
from ..config import settings
from ..deps import AuthContext, current_auth
from ..modules import MODULES, is_effective, nav_for
from ..modules import service as modules_service
from ..models import (
    INDUSTRIES,
    SECTIONS,
    AcceptInviteRequest,
    EntitlementOut,
    ForgotRequest,
    LocaleOut,
    LoginRequest,
    MeModule,
    MeNavItem,
    MeResponse,
    PasswordChange,
    ResetRequest,
    SignupRequest,
    TenantOut,
    TerminologyRef,
    UserOut,
    VerifyRequest,
)
from ..ratelimit import client_ip, rate_limit
from .. import branches, branding  # /auth/me branches + branding (p3-orgdata)
from ..models import MeBranch
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
    """Returns the raw token for the cookie; only its hash is persisted.
    The session copies the user's current auth_epoch (D-05)."""
    token = new_session_token()
    expires = datetime.now(timezone.utc) + timedelta(days=settings.session_ttl_days)
    await conn.execute(
        """insert into sessions (id, user_id, tenant_id, expires_at, auth_epoch)
           select $1, $2, $3, $4, auth_epoch from users where id = $2""",
        hash_session_token(token), user_id, tenant_id, expires,
    )
    return token


@router.post("/signup", response_model=MeResponse, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(rate_limit(5, 60))])
async def signup(body: SignupRequest, response: Response, background: BackgroundTasks) -> MeResponse:
    if body.industry_type not in INDUSTRIES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown industry: {body.industry_type}")
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
                """insert into roles (tenant_id, name, is_system, template_key)
                   values ($1,'Owner',true,'owner') returning id""",
                tenant_id,
            )
            # RBAC v2 (0053): the Owner template holds every key, present and future.
            await conn.execute(
                "insert into role_grants (tenant_id, role_id, permission_key, scope) values ($1,$2,'*','all')",
                tenant_id, role_id)
            # Owner gets admin on every section (incl. settings + accounts approvals,
            # and payroll, which hrms:admin deliberately doesn't carry — D-42).
            for section in SECTIONS + ["settings", "accounts", "payroll"]:
                await conn.execute(
                    "insert into permissions (tenant_id, role_id, section, action) values ($1,$2,$3,'admin')",
                    tenant_id, role_id, section,
                )
            user_id = await conn.fetchval(
                """insert into users (tenant_id, email, password_hash, name, role_id)
                   values ($1,$2,$3,$4,$5) returning id""",
                tenant_id, body.email, hash_password(body.password), body.name, role_id,
            )
            # The chosen apps on (the rest exist but off), with the supporting
            # and link modules they need (D-01, migration 0052).
            await modules_service.bootstrap(conn, tenant_id, sections)
            # Start a 14-day trial with Growth-level features.
            await conn.execute(
                """insert into subscriptions (tenant_id, plan, status, trial_ends_at)
                   values ($1, 'growth', 'trialing', now() + interval '14 days')""",
                tenant_id,
            )
            # Leave policy with default quotas, so leave endpoints never have to
            # create it on first use (concurrent first uses raced on the pkey).
            await conn.execute(
                "insert into hrms_leave_policies (tenant_id) values ($1) on conflict (tenant_id) do nothing",
                tenant_id,
            )
            token = await _create_session(conn, user_id, tenant_id)
            # The verification email is queued with the account, sent after commit.
            verify_mail = await email.queue_verification(conn, tenant_id, user_id, body.email)
    background.add_task(email.deliver_now, verify_mail)

    # Seed a live demo workspace so the new tenant never lands in an empty app.
    if body.sample_data:
        try:
            async with db.tenant_conn(str(tenant_id)) as sconn:
                await sampledata.seed(sconn, str(tenant_id), str(user_id), sections)
        except Exception:
            pass  # best-effort — never fail signup over sample data

    _set_session_cookie(response, token)
    async with db.tenant_conn(str(tenant_id)) as conn:
        return await _bootstrap(conn, UserOut(id=str(user_id), email=body.email, name=body.name, role="Owner"),
                                str(tenant_id), str(role_id))


@router.post("/login", response_model=UserOut, dependencies=[Depends(rate_limit(10, 60))])
async def login(body: LoginRequest, request: Request, response: Response) -> UserOut:
    ip = client_ip(request)
    # The attempt is reserved before the password is checked — atomically, so
    # parallel guesses can't race past a lock — and for known and unknown
    # emails alike, so a lock reveals nothing.
    await ratelimit.begin_login(body.email, ip)
    async with db.owner_conn() as conn:
        user = await conn.fetchrow(
            """select u.id, u.tenant_id, u.email, u.name, u.password_hash, r.name as role
               from users u left join roles r on r.id = u.role_id
               where u.email = $1 and u.status = 'active'""",
            body.email,
        )
        if user is None or not verify_password(user["password_hash"], body.password):
            await ratelimit.login_failed(body.email, ip)
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
        token = await _create_session(conn, str(user["id"]), str(user["tenant_id"]))
    await ratelimit.login_succeeded(body.email, ip)

    # A login is a semantic audit event (TRD TR-SEC-61), in the tenant's trail.
    context.set_actor(str(user["id"]))
    async with db.tenant_conn(str(user["tenant_id"])) as conn:
        await audit.event(conn, "auth.login", "user", str(user["id"]))
    _set_session_cookie(response, token)
    return UserOut(id=str(user["id"]), email=user["email"], name=user["name"], role=user["role"])


@router.post("/forgot", status_code=status.HTTP_204_NO_CONTENT,
             dependencies=[Depends(rate_limit(5, 15 * 60))])
async def forgot(body: ForgotRequest, response: Response, background: BackgroundTasks) -> Response:
    """Always 204, whatever the address and whatever SMTP is doing: the email
    is queued (never sent inline), so the answer, its timing and a mail
    outage reveal nothing about which emails have accounts (P1-7)."""
    # 3 reset emails an hour per address, silently: a 429 here would only
    # tell a stranger they had found someone's inbox to flood.
    if await ratelimit.limit_email("forgot", body.email, 3, 3600):
        async with db.owner_conn() as conn:
            user = await conn.fetchrow(
                "select id, email, tenant_id from users where email=$1 and status='active'", body.email)
            if user:
                mail = await email.queue_password_reset(conn, user["tenant_id"], user["id"], user["email"])
                background.add_task(email.deliver_now, mail)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.post("/reset", status_code=status.HTTP_204_NO_CONTENT,
             dependencies=[Depends(rate_limit(5, 15 * 60))])
async def reset(body: ResetRequest, response: Response) -> Response:
    row = await tokens.consume(body.token, "reset")
    if row is None or not row["user_id"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired reset link")
    async with db.owner_conn() as conn, conn.transaction():
        await conn.execute("update users set password_hash=$1, updated_at=now() where id=$2",
                           hash_password(body.password), row["user_id"])
        # A reset is how a user recovers from a stolen session, so every
        # session that existed before it must die with the old password. The
        # new hash already bumped auth_epoch; deleting is belt and braces.
        await conn.execute("delete from sessions where user_id=$1", row["user_id"])
    await ratelimit.unlock(row["email"])   # the inbox owner proved themselves: lift any lockout
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT,
             dependencies=[Depends(rate_limit(5, 60))])
async def change_password(body: PasswordChange, response: Response,
                          auth: AuthContext = Depends(current_auth)) -> Response:
    """Change the password and sign out every other device. The caller keeps
    working on a re-issued session: its old one died with the epoch bump."""
    async with db.owner_conn() as conn, conn.transaction():
        current = await conn.fetchval("select password_hash from users where id=$1", auth.user_id)
        if not verify_password(current, body.current_password):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
        await conn.execute("update users set password_hash=$1, updated_at=now() where id=$2",
                           hash_password(body.new_password), auth.user_id)
        await conn.execute("delete from sessions where user_id=$1", auth.user_id)
        token = await _create_session(conn, auth.user_id, auth.tenant_id)
    _set_session_cookie(response, token)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.post("/verify", status_code=status.HTTP_204_NO_CONTENT,
             dependencies=[Depends(rate_limit(5, 15 * 60))])
async def verify(body: VerifyRequest, response: Response) -> Response:
    row = await tokens.consume(body.token, "verify")
    if row is None or not row["user_id"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired verification link")
    async with db.owner_conn() as conn:
        await conn.execute("update users set email_verified=true where id=$1", row["user_id"])
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.post("/accept-invite", response_model=UserOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(rate_limit(5, 15 * 60))])
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


async def _bootstrap(conn, user: UserOut, tenant_id: str, role_id: str | None) -> MeResponse:
    """The one bootstrap the web loads: who, which tenant, which sections, which
    permission keys, and how to render. Signup and /auth/me share it so the
    two can't drift."""
    tenant_row = await conn.fetchrow(
        "select id,name,industry_type,status,timezone from tenants where id=$1", tenant_id)
    ent_rows = await conn.fetch(
        "select section_key, enabled, limits from entitlements where tenant_id=$1 order by section_key",
        tenant_id,
    )
    # This login is the employee portal iff it is linked to a staff record.
    # The frontend renders the self-service nav instead of the admin app.
    is_employee = bool(await conn.fetchval(
        "select 1 from hrms_employees where user_id=$1", user.id))
    # The user's choice, else English; a tenant default joins here when the
    # typed tenant settings land (12-trd §4.2).
    locale = await conn.fetchval("select locale from users where id=$1", user.id) or "en"
    # RBAC v2 + module registry (D-01, D-04): one principal answers both the
    # permission map and the nav, so the two can't disagree.
    principal = await rbac.load_principal(conn, user_id=user.id, role_id=role_id)
    permissions = principal.permissions()
    on = {k for k in MODULES if is_effective(k, principal.modules_on)}
    async with db.owner_conn() as oc:   # platform-owned reference data
        flag_rows = await oc.fetch(
            """select flag_key, enabled from feature_flags
                where tenant_id is null or tenant_id = $1 order by tenant_id nulls first""",
            tenant_row["id"])
        term_sig = await oc.fetchval(
            """select md5(coalesce(string_agg(key || '=' || label, ',' order by key), ''))
                 from terminology where industry_type = $1 and locale = 'en'""",
            tenant_row["industry_type"])
    return MeResponse(
        user=user,
        tenant=TenantOut(id=str(tenant_row["id"]), name=tenant_row["name"],
                         industry_type=tenant_row["industry_type"], status=tenant_row["status"]),
        entitlements=[EntitlementOut(section_key=r["section_key"], enabled=r["enabled"], limits=r["limits"])
                      for r in ent_rows],
        permissions=permissions,
        modules=[MeModule(key=k, state="enabled" if k in on else "disabled", application=m.application)
                 for k, m in MODULES.items()],
        nav=[MeNavItem(**n) for n in nav_for(principal.modules_on, permissions)],
        flags={r["flag_key"]: r["enabled"] for r in flag_rows},   # a tenant row overrides the default
        terminology=TerminologyRef(etag=f'W/"{term_sig[:16]}"', industry_type=tenant_row["industry_type"],
                                   locale="en"),
        # A CHECK keeps users.locale to en|ur; the column type is still text.
        locale=LocaleOut(locale=locale, dir="rtl" if locale == "ur" else "ltr",  # type: ignore[arg-type]
                         timezone=tenant_row["timezone"], currency="PKR"),
        employee_portal=is_employee,
        branches=[MeBranch(id=b["id"], code=b["code"], name=b["name"], is_default=b["is_default"])
                  for b in await branches.visible(conn)],
        branding=await branding.load(conn),
    )


@router.get("/me", response_model=MeResponse)
async def me(auth: AuthContext = Depends(current_auth)) -> MeResponse:
    # Tenant-scoped reads via the app pool → exercises RLS end-to-end.
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await _bootstrap(
            conn, UserOut(id=auth.user_id, email=auth.email, name=auth.name, role=auth.role),
            auth.tenant_id, auth.role_id)
