"""Rate limits and login lockout, shared through Redis (gate S7; 12-trd
TR-SEC-25, TR-SEC-48, TR-SEC-49).

Counters are fixed windows in app/store.py — Redis, so a limit holds across
every API process, with a per-process fallback if Redis is down (limits stay
on rather than failing open; a full fallback fails closed).

Client IP. X-Forwarded-For is client-controlled, so it is believed only when
the direct peer is the reverse proxy (TRUSTED_PROXY_CIDRS). Then the client is
the right-most address that is not itself a trusted proxy: anything to its
left was supplied by the client and could be anything.

Lockout. A login attempt is *reserved* before the password is checked (an
atomic INCR), so a burst of parallel guesses can't all slip past the check.
  * per (account, client IP): 5 attempts in 15 minutes without a success
    lock that IP out of that account — 423 + Retry-After, 15 minutes,
    doubling on each further lock up to 1 hour. Keyed on the IP as well, so
    a stranger typing wrong passwords for someone's email locks out only
    themselves; the owner signs in from their own address.
  * per account, from anywhere: past 30 attempts an hour every further
    attempt waits its turn (one per 30 s, else 429). That bounds guessing
    spread over many IPs without ever hard-locking the owner.
  * per IP, across accounts: 20 failures in 15 minutes throttle the IP.
Known and unknown emails are counted identically, so no response reveals
which emails have accounts. A success clears that IP's attempts; a password
reset lifts every lock on the account.
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
LOCK_MAX_S = 3600                  # unauthenticated failures escalate no further
LOGIN_FAILS_PER_IP = 20
ACCOUNT_SLOW_AFTER = 30            # attempts per account per hour, from all IPs
ACCOUNT_SLOW_S = 30                # then one attempt per this many seconds


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
    try:
        n = await store.incr(f"rl:{bucket}:{window_s}:{idx}", window_s + 1)
    except store.StoreFull:
        return retry_after                 # no room to count: fail closed
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


async def _gen(acct: str) -> int:
    # Bumped by unlock(): every key below includes it, so one increment
    # retires all of an account's locks across every IP at once.
    return await store.get(f"lock:gen:{acct}")


async def _attempt_key(email: str, ip: str) -> str:
    acct = _account(email)
    return f"lock:try:{acct}:{await _gen(acct)}:{ip}"


async def begin_login(email: str, ip: str) -> None:
    """Reserve one login attempt, before the password is checked. Raises 429
    (IP throttled, account slowed, or no room to count) or 423 (this IP is
    locked out of this account)."""
    try:
        if retry := await ip_throttled(ip):
            raise too_many(retry)
        acct = _account(email)
        gen = await _gen(acct)
        k = f"lock:try:{acct}:{gen}:{ip}"
        n = await store.incr(k, LOGIN_FAILS_WINDOW_S)
        if n > LOGIN_FAILS_PER_ACCOUNT:
            if n == LOGIN_FAILS_PER_ACCOUNT + 1:   # this attempt starts a lock
                level = await store.incr(f"lock:level:{acct}:{gen}:{ip}", 24 * 3600)
                await store.expire(k, min(LOCK_BASE_S * 2 ** (level - 1), LOCK_MAX_S))
            raise locked(await store.ttl(k))
        total = await store.incr(f"lock:acct:{acct}:{gen}", 3600)
        if total > ACCOUNT_SLOW_AFTER and not await store.claim_once(f"lock:slow:{acct}:{gen}", ACCOUNT_SLOW_S):
            raise too_many(await store.ttl(f"lock:slow:{acct}:{gen}") or ACCOUNT_SLOW_S)
    except store.StoreFull:
        raise too_many(60) from None


async def locked_for(email: str, ip: str) -> int:
    """Seconds left on this IP's lock on this account; 0 if it isn't locked."""
    k = await _attempt_key(email, ip)
    return await store.ttl(k) if await store.get(k) > LOGIN_FAILS_PER_ACCOUNT else 0


async def ip_throttled(ip: str) -> int:
    return await peek(f"loginfail:{ip}", LOGIN_FAILS_PER_IP, LOGIN_FAILS_WINDOW_S)


async def login_failed(email: str, ip: str) -> None:
    """A reserved attempt failed: count it against the IP across accounts
    (the per-account count was taken when the attempt was reserved)."""
    await hit(f"loginfail:{ip}", LOGIN_FAILS_PER_IP, LOGIN_FAILS_WINDOW_S)


async def login_succeeded(email: str, ip: str) -> None:
    await store.delete(await _attempt_key(email, ip))


async def unlock(email: str) -> None:
    """A successful password reset proves the owner: lift every lock."""
    try:
        await store.incr(f"lock:gen:{_account(email)}", 30 * 24 * 3600)
    except store.StoreFull:
        pass   # nothing new can be locked either while the fallback is full


def locked(retry_after: int) -> HTTPException:
    minutes = max(1, -(-retry_after // 60))
    return HTTPException(status.HTTP_423_LOCKED,
                         f"Too many failed sign-ins. Try again in {minutes} minute(s), or reset your password.",
                         headers={"Retry-After": str(max(1, retry_after))})
