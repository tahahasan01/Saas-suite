"""The AI gateway end to end over HTTP, with the model mocked — no network,
no API key. Covers the happy path, the two refusal layers, and that an
upstream model failure is a typed 502/503 rather than a 500."""
from __future__ import annotations

import uuid
from types import SimpleNamespace

import anthropic
import asyncpg
import httpx2
import pytest

from app.ai import gateway
from app.config import settings


class FakeModel:
    """Stands in for AsyncAnthropic. Each `messages.create` call pops the next
    scripted reply: a string becomes a text response, an exception is raised."""

    def __init__(self, *replies):
        self.replies = list(replies)
        self.calls: list[dict] = []
        self.messages = self

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        reply = self.replies.pop(0)
        if isinstance(reply, BaseException):
            raise reply
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=reply)],
                               usage=SimpleNamespace(input_tokens=11, output_tokens=7))


@pytest.fixture
def model(monkeypatch):
    def install(*replies) -> FakeModel:
        fake = FakeModel(*replies)
        monkeypatch.setattr(gateway, "_client", lambda: fake)
        return fake
    return install


async def _ai_log(tenant_id: str) -> list[dict]:
    owner = await asyncpg.connect(settings.database_url)
    try:
        return [dict(r) for r in await owner.fetch(
            "select response, sql, tokens_in, tokens_out from ai_interactions where tenant_id = $1",
            uuid.UUID(tenant_id))]
    finally:
        await owner.close()


@pytest.mark.asyncio
async def test_answers_from_the_tenants_own_rows(client, crm_tenant, model):
    fake = model("select count(*) as n from ai_v_leads", "You have some leads.")
    r = await client.post("/ai/ask", json={"question": "how many leads do I have?"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["answer"] == "You have some leads."
    assert "LIMIT" in body["sql"].upper()
    assert len(body["rows"]) == 1 and body["rows"][0]["n"] > 0
    # The model only ever sees schemas for the tenant's enabled sections.
    assert "ai_v_leads" in fake.calls[0]["system"] and "ai_v_sales" not in fake.calls[0]["system"]
    log = await _ai_log(crm_tenant.tenant_id)
    assert len(log) == 1 and log[0]["tokens_in"] == 22 and log[0]["tokens_out"] == 14


@pytest.mark.asyncio
async def test_unsafe_sql_from_the_model_is_refused_and_logged(client, crm_tenant, model):
    fake = model("select * from ai_v_leads, auth_tokens")
    r = await client.post("/ai/ask", json={"question": "show me everything"})
    assert r.status_code == 200
    assert r.json()["sql"] is None and r.json()["rows"] == []
    assert len(fake.calls) == 1, "a refused query is never phrased by the model"
    log = await _ai_log(crm_tenant.tenant_id)
    assert log[0]["response"].startswith("[blocked")


@pytest.mark.asyncio
async def test_the_database_still_refuses_if_the_validator_is_bypassed(client, crm_tenant, model, monkeypatch):
    monkeypatch.setattr(gateway, "sanitize", lambda sql, allowed=None: sql)
    model("select token from auth_tokens")
    r = await client.post("/ai/ask", json={"question": "steal the tokens"})
    assert r.status_code == 200
    assert r.json()["rows"] == [] and r.json()["sql"] is None
    log = await _ai_log(crm_tenant.tenant_id)
    assert log[0]["response"].startswith("[db refused")


@pytest.mark.asyncio
async def test_sql_the_database_rejects_is_an_answer_not_a_500(client, crm_tenant, model):
    model("select no_such_column from ai_v_leads")
    r = await client.post("/ai/ask", json={"question": "what is the frobnication rate?"})
    assert r.status_code == 200
    assert r.json()["rows"] == []


def _req():
    return httpx2.Request("POST", "https://api.anthropic.com/v1/messages")


def _status(cls, code):
    return cls("upstream said no", response=httpx2.Response(code, request=_req()), body=None)


@pytest.mark.asyncio
@pytest.mark.parametrize("exc,status", [
    (lambda: anthropic.APIConnectionError(request=_req()), 503),
    (lambda: anthropic.APITimeoutError(request=_req()), 503),
    (lambda: _status(anthropic.RateLimitError, 429), 503),
    (lambda: _status(anthropic.OverloadedError, 529), 503),
    (lambda: _status(anthropic.ServiceUnavailableError, 503), 503),
    (lambda: _status(anthropic.InternalServerError, 500), 502),
    (lambda: _status(anthropic.AuthenticationError, 401), 502),
    (lambda: _status(anthropic.BadRequestError, 400), 502),
], ids=["connection", "timeout", "rate-limit", "overloaded", "unavailable", "server-error", "auth", "bad-request"])
async def test_model_failures_are_typed_upstream_errors(client, crm_tenant, model, exc, status):
    model(exc())
    r = await client.post("/ai/ask", json={"question": "how many leads?"})
    assert r.status_code == status, r.text
    assert "anthropic" not in r.text.lower(), "no provider internals in the response"


@pytest.mark.asyncio
async def test_a_failure_while_phrasing_the_answer_is_also_typed(client, crm_tenant, model):
    model("select count(*) from ai_v_leads", _status(anthropic.OverloadedError, 529))
    r = await client.post("/ai/ask", json={"question": "how many leads?"})
    assert r.status_code == 503


@pytest.mark.asyncio
async def test_an_empty_model_reply_is_a_bad_gateway(client, crm_tenant, monkeypatch):
    class Empty(FakeModel):
        async def create(self, **kwargs):
            return SimpleNamespace(content=[], usage=SimpleNamespace(input_tokens=1, output_tokens=0))
    monkeypatch.setattr(gateway, "_client", lambda: Empty())
    r = await client.post("/ai/ask", json={"question": "how many leads?"})
    assert r.status_code == 502


@pytest.mark.asyncio
async def test_no_api_key_is_service_unavailable(client, crm_tenant, monkeypatch):
    monkeypatch.setattr(gateway, "_client", lambda: None)
    r = await client.post("/ai/ask", json={"question": "how many leads?"})
    assert r.status_code == 503
