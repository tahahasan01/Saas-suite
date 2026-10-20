"""Rate limits and login lockout, shared through Redis (gate S7; 12-trd
TR-SEC-25, TR-SEC-48, TR-SEC-49).

Counters are fixed windows in app/store.py — Redis, so a limit holds across
every API process, with a per-process fallback if Redis is down (limits stay
on rather than failing open).

Client IP. X-Forwarded-For is client-controlled, so it is believed only when
the direct peer is the reverse proxy (TRUSTED_PROXY_CIDRS). Then the client is
the right-most address that is not itself a trusted proxy: anything to its
left was supplied by the client and could be anything.

Lockout. Failed logins count per account (by email, known or not, so the
responses can't reveal which emails exist): 5 failures in 15 minutes lock
the account for 15 minutes, doubling on each further lock up to 24 hours.
Locked logins get 423 with Retry-After without the password being checked.
20 failed logins from one IP in 15 minutes throttle that IP. A successful
login clears the account's failures; a successful password reset also lifts
the lock.
"""
from __future__ import annotations

import hashlib
import ipaddress
import time
from functools import lru_cache

from fastapi import HTTPException, Request, status

from . import store
from .config import settings

LOGIN_FAILS_PER_ACCOUNT = 5
LOGIN_FAILS_WINDOW_S = 15 * 60
LOCK_BASE_S = 15 * 60
LOCK_MAX_S = 24 * 3600
LOGIN_FAILS_PER_IP = 20


def reset() -> None:
    """Fresh windows. Tests sign up many tenants from one IP and would
    otherwise throttle themselves into order-dependent failures."""
    store.reset()


# ── Client IP ───────────────────────────────────────────────────────────────
@lru_cache(maxsize=8)
def _networks(spec: str) -> tuple:
    return tuple(ipaddress.ip_network(c.strip(), strict=False) for c in spec.split(",") if c.strip())


def _trusted(addr: str) -> bool:
    nets = _networks(settings.trusted_proxy_cidrs)
    if not nets:
        return False
    try:
        ip = ipaddress.ip_address(addr)
    except ValueError:
        return False
    return any(ip in n for n in nets)


def client_ip(request: Request) -> str:
    peer = request.client.host if request.client else "unknown"
    if not _trusted(peer):
        return peer
    hops = [h.strip() for h in request.headers.get("x-forwarded-for", "").split(",") if h.strip()]
    for hop in reversed(hops):
        if not _trusted(hop):
            return hop
    return hops[0] if hops else peer


# ── Windows ─────────────────────────────────────────────────────────────────
def _window(window_s: int) -> tuple[int, int]:
    now = int(time.time())
    return now // window_s, window_s - now % window_s


async def hit(bucket: str, limit: int, window_s: int) -> int:
    """Count one event in `bucket`. Returns 0 if within the limit, else the
    seconds until the window resets."""
    idx, retry_after = _window(window_s)
    n = await store.incr(f"rl:{bucket}:{window_s}:{idx}", window_s + 1)
    return 0 if n <= limit else retry_after


async def peek(bucket: str, limit: int, window_s: int) -> int:
    """Like hit(), without counting."""
    idx, retry_after = _window(window_s)
    n = await store.get(f"rl:{bucket}:{window_s}:{idx}")
    return 0 if n < limit else retry_after


def too_many(retry_after: int) -> HTTPException:
    return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests — please slow down",
                         headers={"Retry-After": str(max(1, retry_after))})


def rate_limit(max_requests: int, window_s: int):
    """Dependency factory: allow `max_requests` per `window_s` per client IP and path."""
    async def dep(request: Request) -> None:
        retry = await hit(f"ip:{client_ip(request)}:{request.url.path}", max_requests, window_s)
        if retry:
            raise too_many(retry)

    return dep


async def limit_email(scope: str, email: str, max_requests: int, window_s: int) -> bool:
    """Per-address limit (e.g. 3 reset emails an hour). True if allowed."""
    return not await hit(f"email:{scope}:{_account(email)}", max_requests, window_s)


# ── Login lockout ───────────────────────────────────────────────────────────
def _account(email: str) -> str:
    # Hashed: the store never holds an address.
    return hashlib.sha256(email.strip().lower().encode()).hexdigest()[:32]


async def locked_for(email: str) -> int:
    """Seconds left on this account's lock; 0 if it isn't locked."""
    return await store.ttl(f"lock:until:{_account(email)}")


async def ip_throttled(ip: str) -> int:
    return await peek(f"loginfail:{ip}", LOGIN_FAILS_PER_IP, LOGIN_FAILS_WINDOW_S)


async def login_failed(email: str, ip: str) -> int:
    """Record a failed login. Returns the lock length if this failure locked
    the account, else 0."""
    await hit(f"loginfail:{ip}", LOGIN_FAILS_PER_IP, LOGIN_FAILS_WINDOW_S)
    acct = _account(email)
    fails = await store.incr(f"lock:fails:{acct}", LOGIN_FAILS_WINDOW_S)
    if fails < LOGIN_FAILS_PER_ACCOUNT:
        return 0
    level = await store.incr(f"lock:level:{acct}", LOCK_MAX_S * 2)
    lock_s = min(LOCK_BASE_S * 2 ** (level - 1), LOCK_MAX_S)
    await store.put(f"lock:until:{acct}", 1, lock_s)
    await store.delete(f"lock:fails:{acct}")
    return lock_s


async def login_succeeded(email: str) -> None:
    await store.delete(f"lock:fails:{_account(email)}")


async def unlock(email: str) -> None:
    """A successful password reset proves the owner: lift the lock entirely."""
    acct = _account(email)
    await store.delete(f"lock:fails:{acct}", f"lock:until:{acct}", f"lock:level:{acct}")


def locked(retry_after: int) -> HTTPException:
    minutes = max(1, -(-retry_after // 60))
    return HTTPException(status.HTTP_423_LOCKED,
                         f"Too many failed sign-ins. Try again in {minutes} minute(s), or reset your password.",
                         headers={"Retry-After": str(max(1, retry_after))})
