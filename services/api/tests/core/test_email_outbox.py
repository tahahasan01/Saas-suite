"""Email goes through the outbox (P1-7, checklist 2B).

/auth/forgot and /team/invite never talk to SMTP: they queue an `email.send`
row and return 204. So SMTP being down can't 500 them, and /auth/forgot
answers the same for an address with no account. The row holds no token:
the link's token is minted at delivery, so the outbox is never a store of
working reset links.
"""
from __future__ import annotations

import json
import uuid

import asyncpg
import pytest

from app import alerts, email
from app.config import settings
from app.security import hash_token


async def _q(sql, *args):
    conn = await asyncpg.connect(settings.database_url)
    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    try:
        return await conn.fetch(sql, *args)
    finally:
        await conn.close()


async def _mail(tenant_id, template=None):
    rows = await _q("select * from outbox where tenant_id=$1 and kind='email.send' order by id",
                    uuid.UUID(tenant_id))
    return [r for r in rows if template is None or r["payload"]["template"] == template]


@pytest.fixture
def sent(monkeypatch):
    """Captures what the provider was asked to send."""
    out: list[tuple[str, str, str]] = []

    async def capture(to, subject, body):
        out.append((to, subject, body))

    monkeypatch.setattr(email, "_send", capture)
    return out


@pytest.fixture
def smtp_down(monkeypatch):
    async def down(to, subject, body):
        raise ConnectionRefusedError("SMTP server unreachable")

    monkeypatch.setattr(email, "_send", down)


@pytest.fixture
def raised(monkeypatch):
    got: list[alerts.Alert] = []
    monkeypatch.setattr(alerts, "_sinks", [got.append])
    return got


async def _owner_email(client) -> str:
    return (await client.get("/auth/me")).json()["user"]["email"]


# ── /auth/forgot ────────────────────────────────────────────────────────────
async def test_forgot_queues_a_reset_and_sends_it_after_the_response(client, crm_tenant, sent):
    addr = await _owner_email(client)
    r = await client.post("/auth/forgot", json={"email": addr})
    assert r.status_code == 204 and r.content == b""
    [row] = await _mail(crm_tenant.tenant_id, "password_reset")
    assert row["status"] == "done" and row["attempts"] == 1     # the post-commit fast path sent it
    [(to, subject, body)] = [s for s in sent if "Reset" in s[1]]
    assert to == addr
    # The link works, and nothing in the outbox row could have produced it.
    token = body.split("token=")[1].split()[0]
    assert token not in json.dumps(row["payload"]) and hash_token(token) not in json.dumps(row["payload"])
    r = await client.post("/auth/reset", json={"token": token, "password": "N3w-Passw0rd!"})
    assert r.status_code == 204


async def test_forgot_for_an_unknown_address_looks_exactly_the_same(client, crm_tenant, sent):
    r = await client.post("/auth/forgot", json={"email": f"nobody+{uuid.uuid4().hex[:8]}@example.com"})
    assert r.status_code == 204 and r.content == b""
    assert await _mail(crm_tenant.tenant_id, "password_reset") == []
    assert [s for s in sent if "Reset" in s[1]] == []


async def test_forgot_with_smtp_down_is_still_204_and_the_email_waits(client, crm_tenant, smtp_down):
    addr = await _owner_email(client)
    r = await client.post("/auth/forgot", json={"email": addr})
    assert r.status_code == 204
    [row] = await _mail(crm_tenant.tenant_id, "password_reset")
    assert row["status"] == "retry" and row["attempts"] == 1
    assert "SMTP server unreachable" in row["last_error"]
    [later] = await _q("select run_after > now() as v from outbox where id=$1", row["id"])
    assert later["v"]                                            # backed off, not hammering SMTP


async def test_forgot_sends_at_most_three_resets_an_hour_per_address(client, crm_tenant, sent):
    addr = await _owner_email(client)
    for _ in range(4):
        assert (await client.post("/auth/forgot", json={"email": addr})).status_code == 204
    assert len(await _mail(crm_tenant.tenant_id, "password_reset")) == 3


# ── /team/invite and the worker ─────────────────────────────────────────────
async def _role_id(client) -> str:
    return next(r["id"] for r in (await client.get("/team/roles")).json() if r["name"] == "Owner")


async def test_invite_with_smtp_down_is_204_and_the_worker_sends_it_later(client, crm_tenant, smtp_down,
                                                                          monkeypatch):
    invitee = f"new+{uuid.uuid4().hex[:8]}@example.com"
    r = await client.post("/team/invite", json={"email": invitee, "role_id": await _role_id(client)})
    assert r.status_code == 204
    [row] = await _mail(crm_tenant.tenant_id, "invite")
    assert row["status"] == "retry" and row["payload"]["to"] == invitee
    assert "token" not in json.dumps(row["payload"])

    # SMTP is back; the worker's email job picks the row up when it is due.
    captured: list = []

    async def capture(to, subject, body):
        captured.append((to, subject, body))

    monkeypatch.setattr(email, "_send", capture)
    await _q("update outbox set run_after = now() where id=$1", row["id"])
    assert await email.process_outbox() >= 1
    [row] = await _mail(crm_tenant.tenant_id, "invite")
    assert row["status"] == "done" and row["attempts"] == 2
    [(to, _, body)] = [c for c in captured if c[0] == invitee]
    token = body.split("token=")[1].split()[0]
    r = await client.post("/auth/accept-invite", json={"token": token, "name": "New Person",
                                                       "password": "Sup3rSecret!23"})
    assert r.status_code == 201, r.text


async def test_an_email_that_never_goes_through_ends_failed_with_an_alert(client, crm_tenant, smtp_down,
                                                                          raised):
    invitee = f"new+{uuid.uuid4().hex[:8]}@example.com"
    await client.post("/team/invite", json={"email": invitee, "role_id": await _role_id(client)})
    [row] = await _mail(crm_tenant.tenant_id, "invite")
    await _q("update outbox set attempts = max_attempts - 1, run_after = now() where id=$1", row["id"])
    await email.process_outbox()
    [row] = await _mail(crm_tenant.tenant_id, "invite")
    assert row["status"] == "failed"
    [alert] = [a for a in raised if a.event == "email.failed"]
    assert alert.tenant_id == crm_tenant.tenant_id and invitee not in alert.message


async def test_an_abandoned_send_is_retried(client, crm_tenant, sent):
    addr = await _owner_email(client)
    await client.post("/auth/forgot", json={"email": addr})
    [row] = await _mail(crm_tenant.tenant_id, "password_reset")
    await _q("""update outbox set status='sending', locked_until = now() - interval '1 second'
                 where id=$1""", row["id"])
    await email.process_outbox()
    [row] = await _mail(crm_tenant.tenant_id, "password_reset")
    assert row["status"] == "done" and row["attempts"] == 2


async def test_signup_queues_the_verification_email_with_the_account(client, crm_tenant):
    [row] = await _mail(crm_tenant.tenant_id, "verify_email")
    assert row["payload"]["to"] == await _owner_email(client)
