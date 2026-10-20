"""Who is acting right now — the request or job context behind every audit row.

`tenant_conn()` copies this into transaction-local GUCs (`app.actor_id`,
`app.request_id`, `app.actor_kind`, TRD TR-SEC-06), which the audit trigger
and `audit_event()` read (migration 0044, D-07). One context per request (the
middleware below) or per job run (`job()`); with neither — an owner script, a
test — the database records actor_kind 'system'.

The context object is created per request and mutated in place when the
session resolves (`set_actor`), so the auth dependency's update is visible to
the handler and nothing outlives the request.
"""
from __future__ import annotations

import re
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass

from .models import ActorKind

REQUEST_ID_HEADER = "X-Request-ID"
# A caller-supplied id is kept only if it is short and plain: it lands in
# logs and the audit trail.
_SAFE_ID = re.compile(r"^[A-Za-z0-9._:-]{1,64}$")


@dataclass
class ActorContext:
    request_id: str
    actor_kind: ActorKind = "system"
    actor_id: str | None = None


_current: ContextVar[ActorContext | None] = ContextVar("bos_actor_context", default=None)


def current() -> ActorContext | None:
    return _current.get()


def set_actor(user_id: str, kind: ActorKind = "user") -> None:
    """Record the authenticated actor on this request's context."""
    ctx = _current.get()
    if ctx is None:  # outside the middleware (a direct call in a test or script)
        _current.set(ActorContext(request_id="", actor_kind=kind, actor_id=user_id))
        return
    ctx.actor_id, ctx.actor_kind = user_id, kind


def gucs() -> tuple[str, str, str]:
    """(actor_id, request_id, actor_kind) as the strings set_config takes."""
    ctx = _current.get()
    if ctx is None:
        return "", "", "system"
    return ctx.actor_id or "", ctx.request_id, ctx.actor_kind


@contextmanager
def job(name: str, run_id: str | None = None) -> Iterator[ActorContext]:
    """Run a block as a job: tenant connections opened inside it audit as
    actor_kind 'job' with request_id 'job:<name>:<run_id>'. For the worker
    (D-08); `db.job_conn()` wraps this around a tenant connection."""
    ctx = ActorContext(request_id=f"job:{name}:{run_id or uuid.uuid4().hex}", actor_kind="job")
    token = _current.set(ctx)
    try:
        yield ctx
    finally:
        _current.reset(token)


class RequestContextMiddleware:
    """Pure ASGI: gives each HTTP request a fresh context and a request id
    (the caller's X-Request-ID if it is safe, else a new one), echoed back on
    the response."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        supplied = dict(scope.get("headers") or []).get(REQUEST_ID_HEADER.lower().encode(), b"").decode("latin-1")
        rid = supplied if _SAFE_ID.match(supplied) else uuid.uuid4().hex
        token = _current.set(ActorContext(request_id=rid))

        async def send_with_id(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers") or [])
                headers.append((REQUEST_ID_HEADER.lower().encode(), rid.encode()))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            _current.reset(token)
