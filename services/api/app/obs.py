"""Observability: JSON logs with PII redaction, Sentry, and the access-log
middleware (gates O2, O3, O5; 12-trd TR-NFR-20/21).

Context. Who is acting comes from app/context.py — the request id (its
RequestContextMiddleware keeps a safe client X-Request-ID or makes one and
echoes it), actor_kind and actor id, set by deps.current_auth or by
context.job() in the worker. This module adds the log-only fields: the
tenant (bound by deps.current_auth) and, in the worker, job_code / job_run_id.
Every log line and Sentry event carries all of them.

Redaction. Log messages, log extras and Sentry events go through `redact()`:
emails, Pakistani and international phone numbers, CNICs, bearer tokens,
`token=`/`password=`-style pairs and long opaque strings are masked; extras
whose key names a secret or PII field are dropped to "[redacted]".

Access-log middleware (pure ASGI, just inside the request context):
  * one access line per request: method, route, status, duration_ms (no
    query string — it can carry tokens; /health and /ready are skipped);
  * hands the request id to the 500 handler (which runs outside it);
  * counts 5xx, 401 and 429/423 responses per 5-minute window in the shared
    store and alerts when a window crosses its threshold (gate O5).
"""
from __future__ import annotations

import contextvars
import json
import logging
import re
import sys
import time
from datetime import datetime, timezone
from collections.abc import Awaitable
from typing import Any, TypeVar

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from . import context as actor_context
from .config import settings

log = logging.getLogger("api.access")
T = TypeVar("T")

# Log-only extras (tenant_id, job_code, job_run_id) for this request or job run.
_ctx: contextvars.ContextVar[dict[str, Any]] = contextvars.ContextVar("bos_log_ctx")


def _extras() -> dict[str, Any]:
    try:
        return _ctx.get()
    except LookupError:
        d: dict[str, Any] = {}
        _ctx.set(d)
        return d


def new_context(**kv: Any) -> dict[str, Any]:
    d = {k: str(v) for k, v in kv.items() if v is not None}
    _ctx.set(d)
    return d


def bind(**kv: Any) -> None:
    _extras().update({k: str(v) if v is not None else None for k, v in kv.items()})
    _sentry_tags(kv)


async def in_new_context(coro: Awaitable[T], **kv: Any) -> T:
    """Run `coro` with its own log extras (one per job run in the worker).
    Call it inside its own task (gather/create_task) so they stay apart."""
    new_context(**kv)
    return await coro


def fields() -> dict[str, Any]:
    """Everything a log line or Sentry event should name about who and where."""
    out: dict[str, Any] = {}
    ctx = actor_context.current()
    if ctx is not None:
        if ctx.request_id:
            out["request_id"] = ctx.request_id
        out["actor_kind"] = ctx.actor_kind
        if ctx.actor_id:
            out["user_id"] = ctx.actor_id
    out.update({k: v for k, v in _extras().items() if v is not None})
    return out


def request_id() -> str | None:
    ctx = actor_context.current()
    return ctx.request_id if ctx else None


# ── Redaction ───────────────────────────────────────────────────────────────
_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+"), r"\1 [redacted]"),
    (re.compile(r"(?i)\b(token|password|passwd|secret|api[_-]?key|authorization|cookie|session)"
                r"(\"?'?\s*[:=]\s*\"?'?)[^\s\"'&,;}]+"), r"\1\2[redacted]"),
    (re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+"), "[email]"),
    (re.compile(r"\b\d{5}-\d{7}-\d\b|\b\d{13}\b"), "[cnic]"),
    (re.compile(r"(?:\+|\b00)92[\s-]?3\d{2}[\s-]?\d{7}\b|\b03\d{2}[\s-]?\d{7}\b"), "[phone]"),
    (re.compile(r"\+\d[\d\s-]{9,16}\d"), "[phone]"),
]
# Opaque credentials: session and link tokens are 43 url-safe characters,
# hashes 64 hex. Needs a digit and a letter, so long identifiers survive, and
# a UUID (a record id, a request id) is left alone.
_OPAQUE = re.compile(r"\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b")
_UUID = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")


def _opaque(m: re.Match[str]) -> str:
    return m.group(0) if _UUID.fullmatch(m.group(0)) else "[redacted]"
_SECRET_KEYS = re.compile(
    r"(?i)(pass(word)?|token|secret|authorization|cookie|api_?key|session|email|phone|cnic|"
    r"salary|iban|account_no)")


def redact(value: Any) -> Any:
    if isinstance(value, str):
        for pat, repl in _PATTERNS:
            value = pat.sub(repl, value)
        return _OPAQUE.sub(_opaque, value)
    if isinstance(value, dict):
        return {k: ("[redacted]" if isinstance(k, str) and _SECRET_KEYS.search(k) else redact(v))
                for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [redact(v) for v in value]
    return value


# ── Logging ─────────────────────────────────────────────────────────────────
_RESERVED = set(vars(logging.LogRecord("", 0, "", 0, "", None, None))) | {"message", "asctime", "unredacted"}


def _may_skip_redaction(record: logging.LogRecord) -> bool:
    # Only the dev console email provider asks for this (its log line IS the
    # email, link included); production always redacts.
    return bool(getattr(record, "unredacted", False)) and not settings.is_prod


class JsonFormatter(logging.Formatter):
    def __init__(self, service: str) -> None:
        super().__init__()
        self.service = service

    def format(self, record: logging.LogRecord) -> str:
        raw = _may_skip_redaction(record)
        msg = record.getMessage()
        out: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, timezone.utc).isoformat(timespec="milliseconds"),
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": msg if raw else redact(msg),
            "service": self.service,
            "env": settings.node_env,
        }
        if settings.git_sha:
            out["release"] = settings.git_sha
        out.update(fields())
        extras = {k: v for k, v in record.__dict__.items() if k not in _RESERVED and not k.startswith("_")}
        out.update(extras if raw else redact(extras))
        if record.exc_info:
            exc = self.formatException(record.exc_info)
            out["exc"] = exc if raw else redact(exc)
        return json.dumps(out, default=str, ensure_ascii=False)


class TextFormatter(logging.Formatter):
    """For a dev terminal: one readable line, still redacted, with the request id."""

    def format(self, record: logging.LogRecord) -> str:
        raw = _may_skip_redaction(record)
        line = super().format(record)
        rid = request_id()
        line = f"{line} [rid={rid}]" if rid else line
        return line if raw else redact(line)


def setup_logging(service: str) -> None:
    """Route the root logger (and uvicorn's) through one redacting handler."""
    handler = logging.StreamHandler(sys.stdout)
    if settings.log_format == "text":
        handler.setFormatter(TextFormatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    else:
        handler.setFormatter(JsonFormatter(service))
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(settings.log_level.upper())
    for name in ("uvicorn", "uvicorn.error"):
        lg = logging.getLogger(name)
        lg.handlers[:] = []
        lg.propagate = True
    # Our access line replaces uvicorn's, which logs the query string.
    logging.getLogger("uvicorn.access").disabled = True


# ── Sentry ──────────────────────────────────────────────────────────────────
def _sentry_tags(kv: dict[str, Any]) -> None:
    if not settings.sentry_dsn:
        return
    import sentry_sdk

    for k in ("request_id", "tenant_id", "job_code"):
        if kv.get(k):
            sentry_sdk.set_tag(k, str(kv[k]))
    if kv.get("user_id"):
        sentry_sdk.set_user({"id": str(kv["user_id"])})   # an id only, never an email


def scrub_event(event: Any, hint: Any = None) -> Any:
    """Sentry before_send: tag with our context, strip what could hold PII or
    credentials (cookies, headers, bodies, query strings), redact the rest."""
    tags = event.setdefault("tags", {})
    # Ours win: our context is per task, while a Sentry scope can be shared by
    # the worker's concurrent jobs.
    now = fields()
    for k in ("request_id", "tenant_id", "user_id", "job_code"):
        if now.get(k):
            tags[k] = now[k]
    req = event.get("request")
    if isinstance(req, dict):
        for k in ("cookies", "data", "query_string", "env"):
            req.pop(k, None)
        headers = req.get("headers")
        if isinstance(headers, dict):
            req["headers"] = {k: v for k, v in headers.items()
                              if k.lower() not in ("cookie", "authorization", "x-forwarded-for")}
    user = event.get("user")
    if isinstance(user, dict):
        event["user"] = {"id": user["id"]} if user.get("id") else {}
    for key in ("message", "logentry", "exception", "breadcrumbs", "extra"):
        if key in event:
            event[key] = _redact_keep_structure(event[key])
    return event


def _redact_keep_structure(value: Any) -> Any:
    # Like redact(), but leaves dict keys such as "values"/"stacktrace" alone
    # and only masks strings: Sentry needs its event shape intact.
    if isinstance(value, str):
        return redact(value)
    if isinstance(value, dict):
        return {k: _redact_keep_structure(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_redact_keep_structure(v) for v in value]
    return value


def init_sentry(service: str) -> bool:
    if not settings.sentry_dsn:
        return False
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.node_env,
        release=settings.git_sha or None,
        traces_sample_rate=0.1,
        send_default_pii=False,
        before_send=scrub_event,
        server_name=service,
    )
    sentry_sdk.set_tag("service", service)
    logging.getLogger("api").info("Sentry error tracking enabled")
    return True


# ── Access-log middleware ───────────────────────────────────────────────────
_QUIET = ("/health", "/ready")
WINDOW_S = 300


def _spike_bucket(status: int) -> tuple[str, int] | None:
    if status >= 500:
        return "http.5xx_spike", settings.alert_5xx_per_5min
    if status == 401:
        return "http.401_spike", settings.alert_401_per_5min
    if status in (423, 429):
        return "http.ratelimit_spike", settings.alert_ratelimit_per_5min
    return None


async def count_status(status: int) -> None:
    """Count an error status in this 5-minute window; alert on the request
    that crosses the threshold (exactly once per window, across processes)."""
    bucket = _spike_bucket(status)
    if bucket is None:
        return
    from . import alerts, store

    event, threshold = bucket
    window = int(time.time()) // WINDOW_S
    n = await store.incr(f"obs:{event}:{window}", WINDOW_S * 2)
    if n == threshold:
        alerts.emit_soon(event, f"{n} responses of this kind in the last {WINDOW_S // 60} minutes",
                         severity="error" if status >= 500 else "warning", window=window, count=n)


class AccessLogMiddleware:
    """Install inside context.RequestContextMiddleware, which owns the id."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        new_context()                                   # fresh log extras per request
        rid = request_id()
        if rid:
            _sentry_tags({"request_id": rid})
            scope.setdefault("state", {})["request_id"] = rid   # for the 500 handler
        started = time.perf_counter()
        status_holder = {"status": 500}

        async def send_status(message: Message) -> None:
            if message["type"] == "http.response.start":
                status_holder["status"] = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_status)
        finally:
            status = status_holder["status"]
            path = scope.get("path", "")
            if not path.startswith(_QUIET):
                route = getattr(scope.get("route"), "path", path)
                log.info("%s %s %s", scope.get("method"), route, status,
                         extra={"method": scope.get("method"), "route": route, "status": status,
                                "duration_ms": round((time.perf_counter() - started) * 1000, 1)})
                try:
                    await count_status(status)
                except Exception:  # noqa: BLE001 — counting must never fail a request
                    pass
