"""Observability (gates O1, O2, O3, O5).

/health is liveness, /ready checks the database, Redis and the migration
level. Every response carries X-Request-ID; every log line carries the
request, tenant and user ids and never an email, phone number, CNIC or token.
Sentry events are tagged and scrubbed the same way. Error and auth-failure
spikes, outbox lag and FBR trouble raise alerts.
"""
from __future__ import annotations

import io
import json
import logging
import uuid

import asyncpg
import pytest
from httpx import ASGITransport, AsyncClient

from app import alerts, db, fbr_submit, monitor, obs, store
from app.config import settings
from app.routers import meta


@pytest.fixture
def raised(monkeypatch):
    got: list[alerts.Alert] = []
    monkeypatch.setattr(alerts, "_sinks", [got.append])
    return got


@pytest.fixture
def json_logs():
    """Everything logged during the test, as the JSON lines production writes."""
    buf = io.StringIO()
    handler = logging.StreamHandler(buf)
    handler.setFormatter(obs.JsonFormatter("api"))
    root = logging.getLogger()
    root.addHandler(handler)
    old_level = root.level
    root.setLevel(logging.INFO)
    yield lambda: [json.loads(line) for line in buf.getvalue().splitlines() if line.strip()]
    root.removeHandler(handler)
    root.setLevel(old_level)


# ── /health, /ready ─────────────────────────────────────────────────────────
async def test_health_is_liveness_only(client):
    r = await client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


async def test_ready_checks_database_redis_and_migrations(client):
    if not await store.ping():
        pytest.skip("no Redis on REDIS_URL")
    r = await client.get("/ready")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["checks"] == {"database": True, "redis": True, "migrations": True}
    latest = sorted(p.name for p in meta.migrations_dir().glob("*.sql"))[-1]
    assert body["migration_head"] == latest


async def test_ready_fails_on_a_migration_not_yet_applied(client, tmp_path, monkeypatch):
    for p in meta.migrations_dir().glob("*.sql"):
        (tmp_path / p.name).write_text("")
    (tmp_path / "9999_not_applied.sql").write_text("")
    monkeypatch.setattr(settings, "migrations_dir", str(tmp_path))
    r = await client.get("/ready")
    assert r.status_code == 503
    assert r.json()["checks"]["migrations"] is False
    assert r.json()["migrations_missing"] == ["9999_not_applied.sql"]


async def test_ready_fails_when_redis_is_down(client, monkeypatch):
    async def no():
        return False

    monkeypatch.setattr(store, "ping", no)
    r = await client.get("/ready")
    assert r.status_code == 503 and r.json()["checks"]["redis"] is False


async def test_ready_fails_when_the_database_is_down(client, monkeypatch):
    await db.disconnect()
    monkeypatch.setattr(db, "owner_pool", None)
    monkeypatch.setattr(db, "app_pool", None)
    r = await client.get("/ready")
    assert r.status_code == 503 and r.json()["checks"]["database"] is False


# ── Request id ──────────────────────────────────────────────────────────────
async def test_every_response_carries_a_request_id(client):
    r = await client.get("/auth/me")
    assert r.status_code == 401
    uuid.UUID(r.headers["X-Request-ID"])
    mine = "req-" + uuid.uuid4().hex
    assert (await client.get("/health", headers={"X-Request-ID": mine})).headers["X-Request-ID"] == mine
    # Garbage (or a header injection attempt) is replaced, not echoed.
    r = await client.get("/health", headers={"X-Request-ID": "x y"})
    assert r.headers["X-Request-ID"] != "x y"


async def test_an_unhandled_error_still_returns_the_request_id():
    """The 500 response is built by Starlette's outermost error middleware,
    outside ours, so the app's handler has to add the id itself."""
    from starlette.middleware.errors import ServerErrorMiddleware

    from app.main import unhandled_exception_handler

    async def boom(scope, receive, send):
        raise RuntimeError("kaput")

    handler_app = ServerErrorMiddleware(obs.RequestContextMiddleware(boom), handler=unhandled_exception_handler)
    async with AsyncClient(transport=ASGITransport(app=handler_app, raise_app_exceptions=False),
                           base_url="http://t") as c:
        r = await c.get("/anything")
    assert r.status_code == 500
    assert r.json()["request_id"] == r.headers["X-Request-ID"]


# ── Structured logs ─────────────────────────────────────────────────────────
async def test_an_access_line_names_the_request_tenant_and_user(client, crm_tenant, json_logs):
    r = await client.get("/crm/leads")
    assert r.status_code == 200
    me = (await client.get("/auth/me")).json()
    [line] = [l for l in json_logs() if l.get("route") == "/crm/leads" and l["logger"] == "api.access"]
    assert line["request_id"] == r.headers["X-Request-ID"]
    assert line["tenant_id"] == crm_tenant.tenant_id and line["user_id"] == me["user"]["id"]
    assert line["actor_kind"] == "user" and line["status"] == 200 and "duration_ms" in line
    assert line["level"] == "info" and line["service"] == "api"


async def test_unauthenticated_requests_log_as_anonymous(client, json_logs):
    await client.get("/auth/me")
    [line] = [l for l in json_logs() if l.get("route") == "/auth/me"]
    assert line["actor_kind"] == "anonymous" and "tenant_id" not in line and line["status"] == 401


def test_log_lines_redact_pii_and_secrets(json_logs):
    tok = "Q2x1ZGUtaXMtYS10b2tlbi1mb3ItdGVzdHMtMTIzNDU2Nzg"
    logging.getLogger("t").warning(
        "user a.khan@example.com phone +92 300 1234567 / 0300-1234567 cnic 35202-1234567-1 "
        "link /reset?token=%s auth Bearer abc.def.ghi password=hunter2 raw %s", tok, tok,
        extra={"email": "a.khan@example.com", "cnic": "3520212345671", "note": "call 03001234567"})
    [line] = json_logs()
    text = json.dumps(line)
    for leaked in ("a.khan@example.com", "1234567", "35202", tok, "hunter2", "abc.def.ghi"):
        assert leaked not in text, leaked
    assert line["email"] == "[redacted]" and line["cnic"] == "[redacted]"
    assert "[phone]" in line["note"]


def test_long_identifiers_and_uuids_survive_redaction():
    s = "job test_two_worker_processes_never_run_the_same_job run 9c5b94b1-35ad-49bb-b118-8e8fc24abf80"
    assert obs.redact(s) == s


def test_sentry_events_are_tagged_and_scrubbed():
    obs.new_context(request_id="rid-12345678", tenant_id="t-1", user_id="u-1")
    event = {
        "request": {"cookies": {"bos_session": "secret"}, "data": {"password": "x"},
                    "query_string": "token=abc", "headers": {"Cookie": "bos_session=1", "User-Agent": "ua"}},
        "user": {"id": "u-1", "email": "a@example.com", "ip_address": "1.2.3.4"},
        "exception": {"values": [{"type": "UniqueViolationError",
                                  "value": "Key (email)=(a.khan@example.com) already exists"}]},
    }
    out = obs.scrub_event(event)
    assert out["tags"]["request_id"] == "rid-12345678" and out["tags"]["tenant_id"] == "t-1"
    assert "cookies" not in out["request"] and "data" not in out["request"]
    assert "query_string" not in out["request"] and list(out["request"]["headers"]) == ["User-Agent"]
    assert out["user"] == {"id": "u-1"}
    assert "a.khan@example.com" not in json.dumps(out)


def test_sentry_init_uses_the_release_and_never_sends_pii(monkeypatch):
    import sentry_sdk

    seen = {}
    monkeypatch.setattr(settings, "sentry_dsn", "https://public@o0.ingest.example.invalid/1")
    monkeypatch.setattr(settings, "git_sha", "abc1234")
    monkeypatch.setattr(sentry_sdk, "init", lambda **kw: seen.update(kw))
    monkeypatch.setattr(sentry_sdk, "set_tag", lambda *a: None)
    assert obs.init_sentry("api")
    assert seen["release"] == "abc1234" and seen["send_default_pii"] is False
    assert seen["before_send"] is obs.scrub_event


# ── Alerts ──────────────────────────────────────────────────────────────────
async def test_a_5xx_spike_alerts_once_per_window(raised, monkeypatch):
    monkeypatch.setattr(settings, "alert_5xx_per_5min", 3)

    async def fails(scope, receive, send):
        await send({"type": "http.response.start", "status": 503, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    async with AsyncClient(transport=ASGITransport(app=obs.RequestContextMiddleware(fails)),
                           base_url="http://t") as c:
        for _ in range(6):
            await c.get("/x")
    for t in list(alerts._pending):
        await t
    assert [a.event for a in raised] == ["http.5xx_spike"]


async def test_a_401_spike_alerts(client, raised, monkeypatch):
    monkeypatch.setattr(settings, "alert_401_per_5min", 4)
    for _ in range(5):
        await client.get("/auth/me")
    for t in list(alerts._pending):
        await t
    assert [a.event for a in raised] == ["http.401_spike"]


async def test_a_rate_limit_spike_alerts(client, raised, monkeypatch):
    monkeypatch.setattr(settings, "alert_ratelimit_per_5min", 2)
    for _ in range(8):
        await client.post("/auth/verify", json={"token": "x"})
    for t in list(alerts._pending):
        await t
    assert [a.event for a in raised] == ["http.ratelimit_spike"]


async def test_outbox_lag_alerts_once_per_kind(client, crm_tenant, raised):
    owner = await asyncpg.connect(settings.database_url)
    try:
        await owner.execute(
            """insert into outbox (tenant_id, kind, dedup_key, payload, run_after)
               values ($1, 'email.send', $2, '{"template": "verify_email", "to": "x@example.com"}',
                       now() - interval '2 hours')""",
            uuid.UUID(crm_tenant.tenant_id), uuid.uuid4().hex)
    finally:
        await owner.close()
    lag = await monitor.outbox_lag()
    assert any(r["kind"] == "email.send" and r["oldest_s"] >= 7000 for r in lag)
    await monitor.outbox_lag()                                    # still lagging: de-duplicated
    assert [a.event for a in raised].count("outbox.lag") == 1
    assert "x@example.com" not in json.dumps([a.as_dict() for a in raised])


async def test_an_fbr_row_that_fails_raises_a_platform_alert(client, pos_tenant, raised):
    owner = await asyncpg.connect(settings.database_url)
    try:
        await owner.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
        row = await owner.fetchrow(
            """insert into outbox (tenant_id, kind, dedup_key, payload, status)
               values ($1, 'fbr.submit_sale', $2, '{}', 'failed') returning *""",
            uuid.UUID(pos_tenant.tenant_id), uuid.uuid4().hex)
    finally:
        await owner.close()
    await fbr_submit._alert(row, "failed", "0401 Seller not registered")
    await fbr_submit._alert(row, "failed", "0401 Seller not registered")   # once per row
    [a] = [a for a in raised if a.event == "fbr.outbox_failed"]
    assert a.tenant_id == pos_tenant.tenant_id and a.fields["outbox_id"] == row["id"]


async def test_a_broken_sink_does_not_stop_the_others(monkeypatch):
    got = []

    def broken(a):
        raise RuntimeError("webhook down")

    monkeypatch.setattr(alerts, "_sinks", [broken, got.append])
    assert await alerts.emit("test.event", "hello") is not None
    assert len(got) == 1


async def test_the_webhook_sink_posts_json_when_configured(monkeypatch):
    import httpx

    posted = {}

    async def post(self, url, json=None, **kw):
        posted.update(url=url, json=json)

    monkeypatch.setattr(settings, "alert_webhook_url", "https://hooks.example.invalid/x")
    monkeypatch.setattr(httpx.AsyncClient, "post", post)
    await alerts._webhook_sink(alerts.Alert(event="job.disabled", severity="critical", message="m"))
    assert posted["url"] == "https://hooks.example.invalid/x"
    assert posted["json"]["alert"]["event"] == "job.disabled" and "job.disabled" in posted["json"]["text"]
