"""Which transmission failures may have reached FBR (1C, St01 §6.5).

A failure before the request left this machine is safe to resend; one after
it was sent (no answer, dropped mid-response, gateway timeout) may already be
filed, so the outbox marks it unknown instead. No real FBR call is made:
httpx's client is replaced by a stub.
"""
from __future__ import annotations

import uuid

import httpx
import pytest

from app import crypto, fbr

_TENANT = uuid.uuid4()
# Shaped like an fbr_settings row: the token is only ever stored encrypted.
SETTINGS = {"environment": "sandbox", "tenant_id": _TENANT,
            "token_enc": crypto.encrypt("t", fbr.token_aad(_TENANT))}
REQUEST = httpx.Request("POST", fbr.POST_URL["sandbox"])


def _stub(monkeypatch, outcome):
    async def post(self, url, **kwargs):
        if isinstance(outcome, Exception):
            raise outcome
        return httpx.Response(outcome, json={}, request=REQUEST)
    monkeypatch.setattr(httpx.AsyncClient, "post", post)


@pytest.mark.parametrize("outcome", [
    httpx.ConnectError("refused", request=REQUEST),
    httpx.ConnectTimeout("no route", request=REQUEST),
    httpx.PoolTimeout("pool", request=REQUEST),
    500, 502, 503,
])
async def test_failures_before_fbr_could_file_are_safe_to_resend(monkeypatch, outcome):
    _stub(monkeypatch, outcome)
    result = await fbr.post_invoice(SETTINGS, {})
    assert not result.ok
    assert result.maybe_delivered is False


@pytest.mark.parametrize("outcome", [
    httpx.ReadTimeout("no answer", request=REQUEST),
    httpx.WriteTimeout("stalled", request=REQUEST),
    httpx.ReadError("reset", request=REQUEST),
    httpx.RemoteProtocolError("closed mid-response", request=REQUEST),
    504,
])
async def test_failures_after_sending_may_have_been_filed(monkeypatch, outcome):
    _stub(monkeypatch, outcome)
    result = await fbr.post_invoice(SETTINGS, {})
    assert not result.ok
    assert result.maybe_delivered is True


async def test_there_is_no_fbr_lookup_so_reconciling_needs_a_person():
    assert (await fbr.lookup_invoice(SETTINGS, {})).status == "unsupported"
