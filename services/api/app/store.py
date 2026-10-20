"""Short-lived shared counters: Redis, with an in-process fallback.

Rate limits, login lockouts, alert de-duplication and the error-spike
counters live here. Redis is shared by every API process and the worker, so a
limit holds across replicas; it is never a source of truth (13-system-design
P5) — losing it loses only counters.

If Redis is unreachable the same operations run against a bounded in-process
map (TR-SEC-49): limits still apply per process instead of failing open, and
the outage is logged once per back-off period instead of on every request.
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from collections import OrderedDict

from .config import settings

log = logging.getLogger("store")

_RETRY_REDIS_AFTER_S = 15          # after a failure, skip Redis this long
_MEMORY_MAX_KEYS = 10_000

# Every key carries this namespace. reset() starts a fresh one, which is how
# tests get clean limits without deleting anything (old keys just expire).
_ns = uuid.uuid4().hex[:8]
_client = None
_client_loop = None
_down_until = 0.0


def reset() -> None:
    global _ns, _down_until
    _ns = uuid.uuid4().hex[:8]
    _down_until = 0.0
    _mem.clear()


def key(name: str) -> str:
    return f"{settings.redis_prefix}{_ns}:{name}"


# ── In-process fallback ─────────────────────────────────────────────────────
class _Memory:
    """A tiny TTL map with LRU eviction, mirroring the Redis calls used."""

    def __init__(self) -> None:
        self._d: OrderedDict[str, tuple[int, float]] = OrderedDict()

    def clear(self) -> None:
        self._d.clear()

    def _live(self, k: str) -> tuple[int, float] | None:
        v = self._d.get(k)
        if v is None:
            return None
        if v[1] and v[1] <= time.monotonic():
            del self._d[k]
            return None
        self._d.move_to_end(k)
        return v

    def _put(self, k: str, value: int, expires: float) -> None:
        self._d[k] = (value, expires)
        self._d.move_to_end(k)
        while len(self._d) > _MEMORY_MAX_KEYS:
            self._d.popitem(last=False)

    def incr(self, k: str, ttl_s: int) -> int:
        v = self._live(k)
        if v is None:
            self._put(k, 1, time.monotonic() + ttl_s)
            return 1
        self._put(k, v[0] + 1, v[1])
        return v[0] + 1

    def get(self, k: str) -> int:
        v = self._live(k)
        return v[0] if v else 0

    def set(self, k: str, value: int, ttl_s: int) -> None:
        self._put(k, value, time.monotonic() + ttl_s)

    def set_nx(self, k: str, ttl_s: int) -> bool:
        if self._live(k) is not None:
            return False
        self._put(k, 1, time.monotonic() + ttl_s)
        return True

    def ttl(self, k: str) -> int:
        v = self._live(k)
        return max(0, int(v[1] - time.monotonic())) if v else 0

    def delete(self, *ks: str) -> None:
        for k in ks:
            self._d.pop(k, None)


_mem = _Memory()


# ── Redis ───────────────────────────────────────────────────────────────────
def _redis():
    """One client per event loop (a pooled connection can't cross loops)."""
    global _client, _client_loop
    loop = asyncio.get_running_loop()
    if _client is None or _client_loop is not loop:
        import redis.asyncio as aioredis

        _client = aioredis.from_url(settings.redis_url, socket_timeout=0.5,
                                    socket_connect_timeout=0.5, decode_responses=True)
        _client_loop = loop
    return _client


def degraded() -> bool:
    return time.monotonic() < _down_until


async def _try(op):
    """Run `op(redis)`; on any Redis failure, note the outage and return the
    sentinel so the caller uses the in-process map."""
    global _down_until
    if degraded():
        return _FALLBACK
    try:
        return await op(_redis())
    except Exception as e:  # noqa: BLE001 — connection, timeout, auth: all mean "use memory"
        _down_until = time.monotonic() + _RETRY_REDIS_AFTER_S
        log.warning("Redis unavailable, using in-process counters for %ss: %r", _RETRY_REDIS_AFTER_S, e)
        return _FALLBACK


_FALLBACK = object()


async def incr(name: str, ttl_s: int) -> int:
    """Increment a counter that expires `ttl_s` after its first increment."""
    k = key(name)

    async def op(r):
        async with r.pipeline(transaction=True) as p:
            p.incr(k)
            p.expire(k, ttl_s, nx=True)
            n, _ = await p.execute()
        return int(n)

    out = await _try(op)
    return _mem.incr(k, ttl_s) if out is _FALLBACK else out


async def get(name: str) -> int:
    k = key(name)

    async def op(r):
        return int(await r.get(k) or 0)

    out = await _try(op)
    return _mem.get(k) if out is _FALLBACK else out


async def put(name: str, value: int, ttl_s: int) -> None:
    k = key(name)

    async def op(r):
        await r.set(k, value, ex=ttl_s)

    if await _try(op) is _FALLBACK:
        _mem.set(k, value, ttl_s)


async def ttl(name: str) -> int:
    """Seconds until `name` expires; 0 if it doesn't exist."""
    k = key(name)

    async def op(r):
        return max(0, int(await r.ttl(k)))

    out = await _try(op)
    return _mem.ttl(k) if out is _FALLBACK else out


async def delete(*names: str) -> None:
    ks = [key(n) for n in names]

    async def op(r):
        await r.delete(*ks)

    if await _try(op) is _FALLBACK:
        _mem.delete(*ks)


async def claim_once(name: str, ttl_s: int) -> bool:
    """True the first time within `ttl_s` (SET NX): de-duplicates alerts."""
    k = key(name)

    async def op(r):
        return bool(await r.set(k, 1, ex=ttl_s, nx=True))

    out = await _try(op)
    return _mem.set_nx(k, ttl_s) if out is _FALLBACK else out


async def ping() -> bool:
    """For /ready: a real round trip, ignoring the fallback."""
    try:
        return bool(await asyncio.wait_for(_redis().ping(), timeout=1))
    except Exception:  # noqa: BLE001
        return False
