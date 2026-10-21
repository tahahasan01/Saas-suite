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

from starlette.types import ASGIApp, Message, Receive, Scope, Send

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
    # The branches this request asked for (X-Branch-Ids, D-03), already
    # parsed to canonical uuids; the database intersects them with the
    # user's own (db.tenant_conn -> bos_session_branches).
    branch_ids: tuple[str, ...] = ()


BRANCH_IDS_HEADER = "X-Branch-Ids"
_MAX_BRANCH_IDS = 50


def parse_branch_ids(value: str) -> tuple[str, ...]:
    """X-Branch-Ids is a comma-separated list of branch uuids. Anything that
    isn't a uuid is dropped, never an error and never a widening."""
    out: list[str] = []
    for part in value.split(",")[:_MAX_BRANCH_IDS]:
        try:
            canonical = str(uuid.UUID(part.strip()))
        except ValueError:
            continue
        if canonical not in out:
            out.append(canonical)
    return tuple(out)


def branch_request() -> tuple[str | None, list[str]]:
    """(user id or None, requested branch ids) for the branch GUC. None means
    no user is acting (a job, a script, signup): every branch."""
    ctx = _current.get()
    if ctx is None or ctx.actor_kind != "user" or not ctx.actor_id:
        return None, []
    return ctx.actor_id, list(ctx.branch_ids)


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


def job_run_id() -> str | None:
    """The run id inside `job()` (from request_id 'job:<name>:<run_id>'), else None."""
    ctx = _current.get()
    if ctx is None or ctx.actor_kind != "job":
        return None
    return ctx.request_id.rsplit(":", 1)[-1]


class RequestContextMiddleware:
    """Pure ASGI: gives each HTTP request a fresh context and a request id
    (the caller's X-Request-ID if it is safe, else a new one), echoed back on
    the response."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get("headers") or [])
        supplied = headers.get(REQUEST_ID_HEADER.lower().encode(), b"").decode("latin-1")
        rid = supplied if _SAFE_ID.match(supplied) else uuid.uuid4().hex
        branches = parse_branch_ids(headers.get(BRANCH_IDS_HEADER.lower().encode(), b"").decode("latin-1"))
        token = _current.set(ActorContext(request_id=rid, branch_ids=branches))

        async def send_with_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers") or [])
                headers.append((REQUEST_ID_HEADER.lower().encode(), rid.encode()))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            _current.reset(token)
