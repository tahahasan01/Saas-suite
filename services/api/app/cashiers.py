"""Cashier = employee (3C, migration 0080, pos_hrms link module, D-24).

At a till, a cashier signs in with their employee PIN — the same argon2
kiosk_pin_hash the HR kiosk uses, with the same five-tries lock — and gets a
cashier token (12 hours; only its hash is stored). The till sends it as
X-Cashier-Token, and the employee is written on every sale, payment and
cash move.

No PIN hash or verifier ever leaves the server: a 4-6 digit PIN cracks
offline in seconds, and the same PIN clocks staff in at the kiosk. An
offline till (3D) keeps the cashier token it got while online.
"""
from __future__ import annotations

from datetime import timedelta
from typing import Any

import asyncpg
from fastapi import HTTPException, status

from . import pins
from .modules import service as modules_service
from .security import hash_token, new_session_token

TOKEN_HOURS = 12


async def require_link(conn: asyncpg.Connection) -> None:
    """Cashier PINs exist only when both POS and Staff are on (pos_hrms)."""
    if "pos_hrms" not in modules_service.enabled_of(await modules_service.states(conn)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Cashier PINs need both Point of sale and Staff turned on")


async def sign_in(conn: asyncpg.Connection, tenant_id: str, employee_id: Any, pin: str,
                  device_id: Any = None) -> tuple[str, asyncpg.Record]:
    await require_link(conn)
    if device_id is not None and not await conn.fetchval("select 1 from pos_devices where id = $1", device_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Device not found")
    emp = await conn.fetchrow(
        "select id, name, kiosk_pin_hash from hrms_employees where id = $1 and status = 'active'", employee_id)
    if emp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That person isn't on the staff list")
    if emp["kiosk_pin_hash"] is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "No PIN is set for you yet. Ask the manager to set one.")
    await pins.check(f"cashier:{emp['id']}", emp["kiosk_pin_hash"], pin)
    token = new_session_token()
    await conn.execute(
        """insert into pos_cashier_sessions (tenant_id, employee_id, device_id, token_hash, expires_at)
           values ($1, $2, $3, $4, now() + $5::interval)""",
        tenant_id, emp["id"], device_id, hash_token(token), timedelta(hours=TOKEN_HOURS))
    return token, emp


async def employee_for(conn: asyncpg.Connection, token: str | None) -> Any:
    """The employee a cashier token names (None without a token); 401 for a
    token that's unknown, ended or expired."""
    if not token:
        return None
    emp = await conn.fetchval(
        """select employee_id from pos_cashier_sessions
            where token_hash = $1 and ended_at is null and expires_at > now()""", hash_token(token))
    if emp is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "The cashier has been signed out: sign in again with your PIN")
    return emp


async def sign_out(conn: asyncpg.Connection, token: str) -> None:
    await conn.execute("update pos_cashier_sessions set ended_at = now() where token_hash = $1 and ended_at is null",
                       hash_token(token))
