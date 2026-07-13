"""Minimal in-memory sliding-window rate limiter.

Sufficient for a single API instance. For multi-instance deployment, back this
with Redis (INCR + EXPIRE) so limits are shared across workers.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

_hits: dict[str, deque[float]] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    # Behind Cloudflare/proxy the real IP is in X-Forwarded-For.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(max_requests: int, window_s: int):
    """Dependency factory: allow `max_requests` per `window_s` per IP+path."""
    async def dep(request: Request) -> None:
        key = f"{_client_ip(request)}:{request.url.path}"
        now = time.monotonic()
        dq = _hits[key]
        while dq and now - dq[0] > window_s:
            dq.popleft()
        if len(dq) >= max_requests:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests — please slow down")
        dq.append(now)

    return dep
