"""Kiosks: a shared device at a location that can only punch (D-43, F25,
TR-SEC-29, migration 0066).

HR creates a kiosk for a location and gets its token once (only sha256 of it
is stored, like every other token). The device keeps the token and calls
/kiosk/{token}/* — no session, no other endpoint. It lists the location's
staff and punches one of them in or out after their PIN, which is an Argon2
hash on the employee. Five wrong PINs lock that employee on that kiosk for
five minutes (the reservation pattern of app/ratelimit.py: the attempt is
counted before the PIN is checked, so parallel guesses can't slip past). The
request must come from the location's networks when it lists any.
"""
from __future__ import annotations

import secrets

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from .. import attendance, context, db, geofence, ratelimit, refs, store
from ..deps import AuthContext
from ..models import (
    KioskBootstrap,
    KioskCreate,
    KioskEmployee,
    KioskLocation,
    KioskOut,
    KioskPinSet,
    KioskPunchOut,
    KioskPunchRequest,
)
from ..rbac import perm
from ..security import hash_password, hash_token, verify_password

router = APIRouter(prefix="/hrms", tags=["hrms-kiosk"])
device = APIRouter(prefix="/kiosk", tags=["kiosk"])

PIN_FAILS = 5
PIN_LOCK_S = 5 * 60


# ── Admin ───────────────────────────────────────────────────────────────────
_KIOSK_SELECT = """select k.*, l.name as location_name from hrms_kiosks k
                   join hrms_locations l on l.id = k.location_id"""


def _kiosk(r: asyncpg.Record, token: str | None = None) -> KioskOut:
    return KioskOut(id=str(r["id"]), location_id=str(r["location_id"]), location_name=r["location_name"],
                    name=r["name"], created_at=r["created_at"], last_seen_at=r["last_seen_at"],
                    revoked_at=r["revoked_at"], token=token)


@router.get("/kiosks", response_model=list[KioskOut])
async def list_kiosks(auth: AuthContext = Depends(perm("hrms.kiosk.manage"))) -> list[KioskOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(_KIOSK_SELECT + " order by k.revoked_at nulls first, l.name, k.name")
    return [_kiosk(r) for r in rows]


@router.post("/kiosks", response_model=KioskOut, status_code=status.HTTP_201_CREATED)
async def create_kiosk(body: KioskCreate, auth: AuthContext = Depends(perm("hrms.kiosk.manage"))) -> KioskOut:
    """The response carries the token once; open /kiosk/{token} on the device."""
    token = secrets.token_urlsafe(32)
    async with db.tenant_conn(auth.tenant_id) as conn:
        await refs.ensure_visible(conn, "hrms_locations", body.location_id)
        kid = await conn.fetchval(
            """insert into hrms_kiosks (tenant_id, location_id, name, token_hash, created_by)
               values ($1,$2,btrim($3),$4,$5) returning id""",
            auth.tenant_id, body.location_id, body.name, hash_token(token), auth.user_id)
        return _kiosk(await conn.fetchrow(_KIOSK_SELECT + " where k.id=$1", kid), token)


@router.post("/kiosks/{kiosk_id}/revoke", response_model=KioskOut)
async def revoke_kiosk(kiosk_id: str, auth: AuthContext = Depends(perm("hrms.kiosk.manage"))) -> KioskOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        if await conn.fetchval("update hrms_kiosks set revoked_at = coalesce(revoked_at, now()) "
                               "where id=$1 returning id", kiosk_id) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Kiosk not found")
        return _kiosk(await conn.fetchrow(_KIOSK_SELECT + " where k.id=$1", kiosk_id))


@router.put("/employees/{employee_id}/kiosk-pin", status_code=status.HTTP_204_NO_CONTENT)
async def set_kiosk_pin(employee_id: str, body: KioskPinSet, response: Response,
                        auth: AuthContext = Depends(perm("hrms.employee.update"))) -> Response:
    """Set or replace an employee's kiosk PIN (4–6 digits, stored hashed)."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        if await conn.fetchval("update hrms_employees set kiosk_pin_hash=$2 where id=$1 returning id",
                               employee_id, hash_password(body.pin)) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


# ── The device ──────────────────────────────────────────────────────────────
async def _resolve(token: str, request: Request) -> asyncpg.Record:
    """The kiosk for a raw token, or 404; 403 from outside its networks."""
    async with db.owner_conn() as oc:
        k = await oc.fetchrow(
            """select k.id, k.tenant_id, k.name, k.location_id, l.name as location_name,
                      array(select c::text from unnest(l.allowed_cidrs) c) as cidrs
                 from hrms_kiosks k
                 join hrms_locations l on l.id = k.location_id
                 join tenants t on t.id = k.tenant_id
                 join entitlements e on e.tenant_id = k.tenant_id and e.section_key = 'hrms' and e.enabled
                where k.token_hash = $1 and k.revoked_at is null and l.active and t.status = 'active'""",
            hash_token(token))
        if k is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "This kiosk link isn't valid any more.")
        if k["cidrs"] and not geofence.ip_allowed(ratelimit.client_ip(request), list(k["cidrs"])):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This kiosk only works on the location's own network.")
        await oc.execute("update hrms_kiosks set last_seen_at = now() where id = $1", k["id"])
    # Audit rows from this request name the device (D-07).
    context.set_actor(str(k["id"]), "device")
    return k


@device.get("/{token}/bootstrap", response_model=KioskBootstrap,
            dependencies=[Depends(ratelimit.rate_limit(120, 60))])
async def bootstrap(token: str, request: Request) -> KioskBootstrap:
    k = await _resolve(token, request)
    async with db.tenant_conn(str(k["tenant_id"])) as conn:
        rows = await conn.fetch(
            """select id, name, kiosk_pin_hash is not null as has_pin from hrms_employees
                where location_id = $1 and status = 'active' order by name""", k["location_id"])
    return KioskBootstrap(location=KioskLocation(id=str(k["location_id"]), name=k["location_name"]),
                          kiosk_name=k["name"],
                          employees=[KioskEmployee(id=str(r["id"]), name=r["name"], has_pin=r["has_pin"])
                                     for r in rows])


async def _reserve_pin_attempt(kiosk_id: str, employee_id: str) -> str:
    """Count this attempt before the PIN is checked; 423 once locked."""
    k = f"lock:kiosk:{kiosk_id}:{employee_id}"
    try:
        n = await store.incr(k, PIN_LOCK_S)
    except store.StoreFull:
        raise ratelimit.too_many(60) from None
    if n > PIN_FAILS:
        if n == PIN_FAILS + 1:      # this attempt starts the lock: a full five minutes
            await store.expire(k, PIN_LOCK_S)
        left = await store.ttl(k)
        raise HTTPException(status.HTTP_423_LOCKED,
                            f"Too many wrong PINs. Try again in {max(1, -(-left // 60))} minute(s) or ask HR.",
                            headers={"Retry-After": str(max(1, left))})
    return k


@device.post("/{token}/punch", response_model=KioskPunchOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(ratelimit.rate_limit(120, 60))])
async def kiosk_punch(token: str, body: KioskPunchRequest, request: Request) -> KioskPunchOut:
    k = await _resolve(token, request)
    async with db.tenant_conn(str(k["tenant_id"])) as conn:
        emp = await conn.fetchrow(
            """select id, name, kiosk_pin_hash from hrms_employees
                where id = $1 and location_id = $2 and status = 'active'""", body.employee_id, k["location_id"])
        if emp is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "That person isn't on this location's list.")
        if emp["kiosk_pin_hash"] is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "No PIN is set for you yet. Ask HR to set one.")
    lock_key = await _reserve_pin_attempt(str(k["id"]), str(body.employee_id))
    if not verify_password(emp["kiosk_pin_hash"], body.pin):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "That PIN isn't right.")
    await store.delete(lock_key)
    async with db.tenant_conn(str(k["tenant_id"])) as conn:
        await conn.execute("select 1 from hrms_employees where id=$1 for update", body.employee_id)
        kind = await attendance.next_kind(conn, str(body.employee_id))
        at = await conn.fetchval("select now()")
        ev = attendance.Evidence(ip=ratelimit.client_ip(request), geo_status="not_required",
                                 ip_status="allowed" if k["cidrs"] else "not_required",
                                 location_id=k["location_id"], kiosk_id=k["id"])
        row_id = await attendance.punch(conn, str(body.employee_id), kind, method="kiosk", at=at, evidence=ev)
        worked = await conn.fetchval("select worked_min from hrms_attendance where id=$1", row_id) if row_id else 0
    return KioskPunchOut(kind=kind, name=emp["name"], at=at, worked_today_min=worked or 0)
