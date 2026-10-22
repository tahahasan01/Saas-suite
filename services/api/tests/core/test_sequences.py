"""Gap-free document numbers (D-06, gate M8, checklist §6.3, migration 0056).

`sequences.next_number()` is the last statement of a document's
transaction: one upsert on (sequence, period) that row-locks the counter
until COMMIT, so concurrent documents queue, a rollback gives the number
back, and nothing is burnt by a save that fails earlier.
"""
from __future__ import annotations

import asyncio
import json
import time
import uuid
from datetime import date, datetime, timedelta, timezone

import asyncpg
import pytest

from app import db, sequences
from app.config import settings

PKT = timezone(timedelta(hours=5))


async def _owner():
    return await asyncpg.connect(settings.database_url)


# ── Pure helpers ────────────────────────────────────────────────────────────
@pytest.mark.parametrize("d,start,label", [
    (date(2026, 6, 30), 7, "2025-26"),
    (date(2026, 7, 1), 7, "2026-27"),
    (date(2026, 12, 31), 7, "2026-27"),
    (date(2099, 7, 1), 7, "2099-00"),
    (date(2026, 3, 31), 4, "2025-26"),
    (date(2026, 5, 1), 1, "2026"),
])
def test_fiscal_year_label(d, start, label):
    assert sequences.fiscal_year_label(d, start) == label


def test_period_keys_per_reset_rule():
    d = date(2026, 10, 21)
    assert sequences.period_key("fiscal_year", d, 7) == "2026-27"
    assert sequences.period_key("calendar_year", d, 7) == "2026"
    assert sequences.period_key("month", d, 7) == "2026-10"
    assert sequences.period_key("never", d, 7) == "-"


def test_render_tokens():
    out = sequences.render("{BR}-{REG}-{FY}-{YYYY}{MM}-{YY}-{N}", 42, 5, d=date(2026, 7, 1),
                           period="2026-27", branch_code="LHR1", register_code="R2")
    assert out == "LHR1-R2-2026-27-202607-26-00042"
    # A number longer than the padding is never truncated.
    assert sequences.render("INV-{N}", 123456, 3, d=date(2026, 7, 1), period="-") == "INV-123456"


# ── Allocation ──────────────────────────────────────────────────────────────
async def _next(tenant_id: str, code: str = "sales.invoice", **kw) -> sequences.Allocated:
    async with db.tenant_conn(tenant_id) as conn:
        return await sequences.next_number(conn, code, **kw)


async def test_first_invoice_is_number_one_of_the_fiscal_year(client, crm_tenant):
    a = await _next(crm_tenant.tenant_id, at=date(2026, 10, 21))
    assert (a.number, a.value, a.period_key) == ("INV-2026-27-00001", 1, "2026-27")
    b = await _next(crm_tenant.tenant_id, at=date(2026, 10, 22))
    assert (b.number, b.value) == ("INV-2026-27-00002", 2)


async def test_fifty_concurrent_documents_get_one_to_fifty_without_gaps(client, crm_tenant):
    async def one(i: int) -> int:
        async with db.tenant_conn(crm_tenant.tenant_id) as conn:
            # The document's own work comes first; the number is the last step.
            await conn.fetchval("select count(*) from tenants")
            await asyncio.sleep((i % 5) * 0.001)
            return (await sequences.next_number(conn, "sales.invoice", at=date(2026, 10, 21))).value

    values = await asyncio.gather(*(one(i) for i in range(50)))
    assert sorted(values) == list(range(1, 51))


async def test_a_rolled_back_document_gives_its_number_back(client, crm_tenant):
    assert (await _next(crm_tenant.tenant_id, at=date(2026, 10, 21))).value == 1
    with pytest.raises(RuntimeError):
        async with db.tenant_conn(crm_tenant.tenant_id) as conn:
            got = await sequences.next_number(conn, "sales.invoice", at=date(2026, 10, 21))
            assert got.value == 2
            raise RuntimeError("the save failed after taking the number")
    assert (await _next(crm_tenant.tenant_id, at=date(2026, 10, 21))).value == 2


async def test_fiscal_year_rolls_over_at_midnight_karachi_time(client, crm_tenant):
    last = await _next(crm_tenant.tenant_id, at=datetime(2026, 6, 30, 23, 59, tzinfo=PKT))
    assert last.period_key == "2025-26" and last.number == "INV-2025-26-00001"
    # 1 Jul 00:01 PKT is still 30 Jun in UTC: the tenant's clock decides.
    first = await _next(crm_tenant.tenant_id, at=datetime(2026, 6, 30, 19, 1, tzinfo=timezone.utc))
    assert first.period_key == "2026-27" and first.value == 1


async def test_without_a_date_it_uses_the_tenants_today(client, crm_tenant):
    a = await _next(crm_tenant.tenant_id)
    today = datetime.now(PKT).date()
    assert a.period_key == sequences.fiscal_year_label(today, 7)


async def test_branch_sequences_use_the_branch_code(client, pos_tenant):
    # Receipts are per register since 0078 ({REG}); returns stay per branch.
    a = await _next(pos_tenant.tenant_id, "pos.return", at=date(2026, 10, 21))
    assert a.number.startswith("MAIN-R-2026-27-") and a.value == 1


async def test_registers_do_not_block_each_other(client, pos_tenant):
    """Per-register counters are separate rows: while register A's sale holds
    its counter lock, register B allocates at once."""
    reg_a, reg_b = str(uuid.uuid4()), str(uuid.uuid4())
    holding = asyncio.Event()
    release = asyncio.Event()

    async def sale_on_a() -> None:
        async with db.tenant_conn(pos_tenant.tenant_id) as conn:
            await sequences.next_number(conn, "pos.receipt", register_id=reg_a, register_code="A",
                                        at=date(2026, 10, 21))
            holding.set()
            await release.wait()

    task = asyncio.create_task(sale_on_a())
    await holding.wait()
    try:
        started = time.monotonic()
        b = await asyncio.wait_for(
            _next(pos_tenant.tenant_id, "pos.receipt", register_id=reg_b, register_code="B", at=date(2026, 10, 21)),
            timeout=2)
        assert time.monotonic() - started < 1.0
        assert b.value == 1 and b.number == "B-2026-27-000001"      # the register's own counter
    finally:
        release.set()
        await task


async def test_tenants_have_separate_counters(client):
    from ..conftest import _drop, _signup
    t1 = await _signup(client, ["crm"])
    t2 = await _signup(client, ["crm"])
    try:
        assert (await _next(t1, at=date(2026, 10, 21))).value == 1
        assert (await _next(t2, at=date(2026, 10, 21))).value == 1
    finally:
        await _drop(t1)
        await _drop(t2)


async def test_next_number_refuses_to_run_outside_a_transaction(client, crm_tenant):
    conn = await asyncpg.connect(settings.app_database_url)
    try:
        with pytest.raises(RuntimeError, match="transaction"):
            await sequences.next_number(conn, "sales.invoice")
    finally:
        await conn.close()


async def test_an_unknown_code_without_a_default_is_refused(client, crm_tenant):
    with pytest.raises(KeyError):
        await _next(crm_tenant.tenant_id, "nothing.here")


async def test_modules_can_register_their_own_default(client, crm_tenant):
    sequences.register_default("test.thing", name="Things", pattern="TH-{YYYY}-{N}", padding=3,
                               reset="calendar_year")
    try:
        a = await _next(crm_tenant.tenant_id, "test.thing", at=date(2026, 10, 21))
        assert a.number == "TH-2026-001" and a.period_key == "2026"
    finally:
        sequences.DEFAULTS.pop("test.thing")


# ── The counters can't be rewound ───────────────────────────────────────────
async def _seq_id(tenant_id: str, code: str = "sales.invoice") -> str:
    conn = await _owner()
    try:
        return str(await conn.fetchval("select id from sequences where tenant_id=$1 and code=$2",
                                       uuid.UUID(tenant_id), code))
    finally:
        await conn.close()


async def test_listing_shows_the_next_number(client, crm_tenant):
    await _next(crm_tenant.tenant_id)
    r = await client.get("/sequences")
    assert r.status_code == 200
    [s] = [x for x in r.json() if x["code"] == "sales.invoice"]
    assert s["next_value"] == 2 and s["preview"].endswith("-00002")


async def test_next_can_only_move_forward_and_is_audited(client, crm_tenant):
    await _next(crm_tenant.tenant_id)
    sid = await _seq_id(crm_tenant.tenant_id)
    r = await client.patch(f"/sequences/{sid}", json={"next_value": 100})
    assert r.status_code == 200, r.text
    assert r.json()["next_value"] == 100
    r = await client.patch(f"/sequences/{sid}", json={"next_value": 99})
    assert r.status_code == 422
    assert (await _next(crm_tenant.tenant_id)).value == 100
    conn = await _owner()
    try:
        ev = await conn.fetchrow(
            "select changes, data from audit_log where tenant_id=$1 and action='sequence.set_next'",
            uuid.UUID(crm_tenant.tenant_id))
    finally:
        await conn.close()
    assert ev is not None and json.loads(ev["changes"])["next_value"] == [2, 100]


async def test_only_settings_admins_move_numbers(client, crm_tenant):
    from .test_me_permissions import _member
    await _next(crm_tenant.tenant_id)
    sid = await _seq_id(crm_tenant.tenant_id)
    mate, _ = await _member(client, {"crm": ["write"], "settings": ["read"]})
    try:
        assert (await mate.get("/sequences")).status_code == 200
        assert (await mate.patch(f"/sequences/{sid}", json={"next_value": 500})).status_code == 403
    finally:
        await mate.aclose()


async def test_app_user_cannot_delete_counters(client, crm_tenant):
    await _next(crm_tenant.tenant_id)
    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        async with db.tenant_conn(crm_tenant.tenant_id) as conn:
            await conn.execute("delete from sequence_counters")
