"""Till PINs: argon2 hashes (app/security.py) and lockouts counted before the
PIN is checked, so parallel guesses can't race past them — the same rule as
the HR kiosk (routers/hrms_kiosk.py).

Approval PINs have two counters (security review of 0076):
- per (approver, caller): five wrong tries lock that caller against that
  approver for five minutes — one cashier can't lock the manager out for
  everyone;
- per approver, over 24 hours: DAILY_FAILS wrong tries from anyone switch the
  approver's PIN off for the day; the caller tells the approver.
"""
from __future__ import annotations

from fastapi import HTTPException, status

from . import ratelimit, store
from .security import verify_password

FAILS = 5
LOCK_S = 5 * 60
DAILY_FAILS = 10
DAY_S = 24 * 60 * 60


async def reserve(key: str) -> str:
    """Count this attempt; 423 once `key` has failed FAILS times."""
    k = f"lock:pin:{key}"
    try:
        n = await store.incr(k, LOCK_S)
    except store.StoreFull:
        raise ratelimit.too_many(60) from None
    if n > FAILS:
        if n == FAILS + 1:      # this attempt starts the lock: a full five minutes
            await store.expire(k, LOCK_S)
        left = await store.ttl(k)
        raise HTTPException(status.HTTP_423_LOCKED,
                            f"Too many wrong PINs. Try again in {max(1, -(-left // 60))} minute(s).",
                            headers={"Retry-After": str(max(1, left))})
    return k


async def check(key: str, pin_hash: str | None, pin: str, wrong: str = "That PIN isn't right.") -> None:
    """403 on a wrong PIN (the attempt counts), 423 when locked; a right PIN
    clears the count."""
    lock = await reserve(key)
    if not pin_hash or not verify_password(pin_hash, pin):
        raise HTTPException(status.HTTP_403_FORBIDDEN, wrong)
    await store.delete(lock)


async def daily_failures(approver_key: str) -> int:
    return int(await store.get(f"pin24:{approver_key}") or 0)


async def record_daily_failure(approver_key: str) -> int:
    try:
        return await store.incr(f"pin24:{approver_key}", DAY_S)
    except store.StoreFull:
        raise ratelimit.too_many(60) from None


def switched_off() -> HTTPException:
    return HTTPException(status.HTTP_423_LOCKED,
                         "This approver's PIN is switched off for 24 hours after too many wrong tries. "
                         "Ask another manager to approve.")


async def check_approval(approver_key: str, caller_key: str, pin_hash: str | None, pin: str) -> bool:
    """Check an approver's PIN entered by a caller. Returns True when this
    attempt switched the approver's PIN off (so the caller can tell them);
    raises 403 / 423 as `check` does."""
    if await daily_failures(approver_key) >= DAILY_FAILS:
        raise switched_off()
    lock = await reserve(f"{approver_key}:{caller_key}")
    if not pin_hash or not verify_password(pin_hash, pin):
        n = await record_daily_failure(approver_key)
        if n >= DAILY_FAILS:
            return True
        raise HTTPException(status.HTTP_403_FORBIDDEN, "That PIN isn't right.")
    await store.delete(lock)
    return False
