"""Operational alerts (gate O5): one call, pluggable sinks.

`emit()` turns a condition an operator must hear about into an `Alert` and
hands it to every sink. Sinks:
  * the structured log, always (event `alert`, level WARNING/ERROR) — the log
    pipeline is where alert rules and dashboards read from;
  * ALERT_WEBHOOK_URL, when set: a JSON POST (`text` + the alert), which
    Slack, Discord, ntfy or an uptime tool's incoming webhook can take;
  * anything registered with `add_sink()`.

Tenant-facing alerts (an FBR filing that failed) also notify the tenant's
owners in-app, where they are raised (fbr_submit._alert); this module is the
platform side. A sink can never break the caller: failures are logged and
swallowed. Repeats are suppressed with `dedup_key` for `dedup_s` seconds
(shared through Redis, so N API processes alert once).

Events raised today:
  fbr.outbox_failed / fbr.outbox_unknown   a filing needs a person
  job.disabled                              a job hit max_failures
  job.stale                                 a job has not succeeded in 2x its interval
  outbox.lag                                rows due for longer than OUTBOX_LAG_ALERT_MIN
  email.failed                              an email used up its attempts
  http.5xx_spike / http.401_spike / http.ratelimit_spike   per 5-minute window
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

from . import store
from .config import settings

log = logging.getLogger("alerts")


@dataclass
class Alert:
    event: str
    severity: str           # warning | error | critical
    message: str
    tenant_id: str | None = None
    fields: dict[str, Any] = field(default_factory=dict)
    at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def as_dict(self) -> dict[str, Any]:
        return {"event": self.event, "severity": self.severity, "message": self.message,
                "tenant_id": self.tenant_id, "at": self.at, **self.fields}


Sink = Callable[[Alert], Any]


def _log_sink(a: Alert) -> None:
    level = logging.WARNING if a.severity == "warning" else logging.ERROR
    log.log(level, "ALERT %s: %s", a.event, a.message,
            extra={"alert": a.event, "severity": a.severity, "alert_tenant_id": a.tenant_id,
                   **{f"alert_{k}": v for k, v in a.fields.items()}})


async def _webhook_sink(a: Alert) -> None:
    if not settings.alert_webhook_url:
        return
    import httpx

    async with httpx.AsyncClient(timeout=5) as c:
        await c.post(settings.alert_webhook_url,
                     json={"text": f"[{settings.node_env}] {a.severity.upper()} {a.event}: {a.message}",
                           "alert": a.as_dict()})


_sinks: list[Sink] = [_log_sink, _webhook_sink]


def add_sink(sink: Sink) -> None:
    _sinks.append(sink)


async def emit(event: str, message: str, *, severity: str = "error", tenant_id: str | None = None,
               dedup_key: str | None = None, dedup_s: int = 3600, **fields: Any) -> Alert | None:
    """Raise an alert. Returns it, or None if an identical one went out within
    `dedup_s`. Never raises."""
    try:
        if dedup_key and not await store.claim_once(f"alert:{event}:{dedup_key}", dedup_s):
            return None
        alert = Alert(event=event, severity=severity, message=message,
                      tenant_id=str(tenant_id) if tenant_id else None, fields=fields)
        for sink in list(_sinks):
            try:
                out = sink(alert)
                if asyncio.iscoroutine(out):
                    await out
            except Exception:  # noqa: BLE001 — one broken sink must not hide the alert elsewhere
                log.exception("alert sink failed for %s", event)
        return alert
    except Exception:  # noqa: BLE001
        log.exception("could not raise alert %s", event)
        return None


def emit_soon(event: str, message: str, **kw: Any) -> None:
    """Fire-and-forget from a hot path (request middleware): never adds the
    sinks' latency to a response."""
    try:
        task = asyncio.get_running_loop().create_task(emit(event, message, **kw))
        _pending.add(task)
        task.add_done_callback(_pending.discard)
    except RuntimeError:  # no running loop
        pass


_pending: set[asyncio.Task] = set()
