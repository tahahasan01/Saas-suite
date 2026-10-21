"""Till PINs: argon2 hashes (app/security.py) and a lockout after five wrong
tries, counted before the PIN is checked so parallel guesses can't race past
it — the same rule as the HR kiosk (routers/hrms_kiosk.py)."""
from __future__ import annotations

from fastapi import HTTPException, status

from . import ratelimit, store
from .security import verify_password

FAILS = 5
LOCK_S = 5 * 60


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
