"""Till PINs: argon2 hashes (app/security.py) and lockouts counted before the
PIN is checked, so parallel guesses can't race past them — the same rule as
the HR kiosk (routers/hrms_kiosk.py).

Approval PINs have three limits (security reviews of 0076/0077):
- per (approver, caller): five wrong tries lock that caller against that
  approver for five minutes;
- per caller, across every approver: CALLER_FAILS wrong tries an hour lock
  that caller out of approvals;
- per approver, over 24 hours: the PIN is switched off only when wrong tries
  came from at least DAILY_DISTINCT different callers and add up to
  DAILY_FAILS — one person can't switch a manager off on their own. An
  admin can switch it back on (`clear`).
"""
from __future__ import annotations

from fastapi import HTTPException, status

from . import ratelimit, store
from .security import verify_password

FAILS = 5
LOCK_S = 5 * 60
CALLER_FAILS = 20
HOUR_S = 60 * 60
DAILY_FAILS = 10
DAILY_DISTINCT = 3
DAY_S = 24 * 60 * 60


def _locked(left: int, msg: str = "Too many wrong PINs.") -> HTTPException:
    return HTTPException(status.HTTP_423_LOCKED, f"{msg} Try again in {max(1, -(-left // 60))} minute(s).",
                         headers={"Retry-After": str(max(1, left))})


async def _incr(name: str, ttl: int) -> int:
    try:
        return await store.incr(name, ttl)
    except store.StoreFull:
        raise ratelimit.too_many(60) from None


async def reserve(key: str) -> str:
    """Count this attempt; 423 once `key` has failed FAILS times."""
    k = f"lock:pin:{key}"
    n = await _incr(k, LOCK_S)
    if n > FAILS:
        if n == FAILS + 1:      # this attempt starts the lock: a full five minutes
            await store.expire(k, LOCK_S)
        raise _locked(await store.ttl(k))
    return k


async def check(key: str, pin_hash: str | None, pin: str, wrong: str = "That PIN isn't right.") -> None:
    """403 on a wrong PIN (the attempt counts), 423 when locked; a right PIN
    clears the count."""
    lock = await reserve(key)
    if not pin_hash or not verify_password(pin_hash, pin):
        raise HTTPException(status.HTTP_403_FORBIDDEN, wrong)
    await store.delete(lock)


async def record_daily_failure(approver_key: str, caller_key: str) -> bool:
    """Count a wrong approval PIN; True once the approver's PIN is now off."""
    await _incr(f"pin24:{approver_key}", DAY_S)
    if await store.claim_once(f"pin24c:{approver_key}:{caller_key}", DAY_S):
        await _incr(f"pin24d:{approver_key}", DAY_S)
    return await daily_off(approver_key)


async def daily_off(approver_key: str) -> bool:
    return (int(await store.get(f"pin24d:{approver_key}") or 0) >= DAILY_DISTINCT
            and int(await store.get(f"pin24:{approver_key}") or 0) >= DAILY_FAILS)


async def clear(approver_key: str) -> None:
    """An admin switches the approver's PIN back on."""
    await store.delete(f"pin24:{approver_key}", f"pin24d:{approver_key}")


def switched_off() -> HTTPException:
    return HTTPException(status.HTTP_423_LOCKED,
                         "This approver's PIN is switched off for 24 hours after too many wrong tries. "
                         "Ask another manager to approve.")


async def check_approval(approver_key: str, caller_key: str, pin_hash: str | None, pin: str) -> bool:
    """Check an approver's PIN entered by a caller. Returns True when this
    attempt switched the approver's PIN off (so the caller can tell them);
    raises 403 / 423 as `check` does."""
    if await daily_off(approver_key):
        raise switched_off()
    caller = f"pinc:{caller_key}"
    if int(await store.get(caller) or 0) >= CALLER_FAILS:
        raise _locked(await store.ttl(caller), "Too many wrong PINs from you this hour.")
    lock = await reserve(f"{approver_key}:{caller_key}")
    if not pin_hash or not verify_password(pin_hash, pin):
        await _incr(caller, HOUR_S)
        if await record_daily_failure(approver_key, caller_key):
            return True
        raise HTTPException(status.HTTP_403_FORBIDDEN, "That PIN isn't right.")
    await store.delete(lock)
    return False
