"""Gap-free document numbers (D-06, gate M8, migration 0056).

The one call other modules make, as the LAST step of the document's own
transaction (after validation, stock moves, the outbox row):

    async with db.tenant_conn(tenant_id) as conn:
        ...insert the invoice...
        got = await sequences.next_number(conn, "sales.invoice", at=invoice_date)
        await conn.execute("update invoices set number=$1, period_key=$2 where id=$3",
                           got.number, got.period_key, invoice_id)

Why last: the allocation upsert row-locks the (sequence, period) counter
until COMMIT, so the lock is held for the shortest time, a rollback returns
the number (no gap), and a save that fails validation never took one.

Scopes: a sequence row is found register > branch > tenant. Codes in
DEFAULTS are created on first use; a module adds its own with
`register_default()` at import time. Periods: the tenant's fiscal year
(tenants.fy_start_month, July by default) on the document's local date
(tenant timezone, Asia/Karachi by default), or calendar year, month, never.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Literal

import asyncpg

from .models import SequenceReset

Scope = Literal["tenant", "branch", "register"]


@dataclass(frozen=True)
class SequenceDefault:
    name: str
    pattern: str
    padding: int = 5
    reset: SequenceReset = "fiscal_year"
    gapless: bool = True
    scope: Scope = "tenant"


# Codes are module.document. Tokens: {FY} {YYYY} {YY} {MM} {BR} {REG} {N}.
DEFAULTS: dict[str, SequenceDefault] = {
    "sales.invoice": SequenceDefault("Sales invoices", "INV-{FY}-{N}"),
    "sales.credit_note": SequenceDefault("Credit notes", "CN-{FY}-{N}"),
    "pos.receipt": SequenceDefault("POS receipts", "{BR}-{FY}-{N}", padding=6, scope="branch"),
    "pos.return": SequenceDefault("POS returns", "{BR}-R-{FY}-{N}", scope="branch"),
    "purchase.order": SequenceDefault("Purchase orders", "PO-{FY}-{N}", gapless=False),
    "payroll.run": SequenceDefault("Payroll runs", "PR-{FY}-{N}", padding=4),
    "payroll.payslip": SequenceDefault("Payslips", "PS-{YYYY}{MM}-{N}", reset="month"),
}


def register_default(code: str, *, name: str, pattern: str, padding: int = 5,
                     reset: SequenceReset = "fiscal_year", gapless: bool = True,
                     scope: Scope = "tenant") -> None:
    """Declare a module's numbering default (call at import time)."""
    if "{N}" not in pattern:
        raise ValueError("a sequence pattern needs {N}")
    DEFAULTS[code] = SequenceDefault(name, pattern, padding, reset, gapless, scope)


@dataclass(frozen=True)
class Allocated:
    number: str        # rendered, e.g. 'INV-2026-27-00042'
    value: int         # the raw counter value, 42
    period_key: str    # '2026-27'
    sequence_id: str


# ── Pure helpers ────────────────────────────────────────────────────────────
def fiscal_year_label(d: date, start_month: int = 7) -> str:
    """'2025-26' for a July–June year; a January start is just '2026'."""
    if start_month == 1:
        return str(d.year)
    start = d.year if d.month >= start_month else d.year - 1
    return f"{start}-{(start + 1) % 100:02d}"


def period_key(reset: str, d: date, fy_start_month: int = 7) -> str:
    if reset == "fiscal_year":
        return fiscal_year_label(d, fy_start_month)
    if reset == "calendar_year":
        return str(d.year)
    if reset == "month":
        return f"{d.year}-{d.month:02d}"
    return "-"


def render(pattern: str, value: int, padding: int, *, d: date, period: str,
           branch_code: str = "", register_code: str = "") -> str:
    fy = period if len(period) == 7 and period[4] == "-" else fiscal_year_label(d)
    out = (pattern.replace("{FY}", fy).replace("{YYYY}", f"{d.year:04d}")
           .replace("{YY}", f"{d.year % 100:02d}").replace("{MM}", f"{d.month:02d}")
           .replace("{BR}", branch_code).replace("{REG}", register_code))
    return out.replace("{N}", str(value).zfill(padding))


# ── Database ────────────────────────────────────────────────────────────────
_ALLOCATE = """
insert into sequence_counters (tenant_id, sequence_id, period_key, next_value)
values ($1, $2, $3, 2)
on conflict (sequence_id, period_key)
do update set next_value = sequence_counters.next_value + 1, updated_at = now()
returning next_value - 1"""

_COLS = "id, tenant_id, code, name, branch_id, register_id, pattern, padding, reset, gapless"


async def local_date(conn: asyncpg.Connection, at: date | datetime | None) -> date:
    """The document's date on the tenant's clock (tenant_conn set TimeZone)."""
    if at is None:
        d: date = await conn.fetchval("select current_date")
        return d
    if isinstance(at, datetime):
        if at.tzinfo is None:
            raise ValueError("pass an aware datetime (or a date)")
        local: date = await conn.fetchval(
            "select ($1::timestamptz at time zone current_setting('TimeZone'))::date", at)
        return local
    return at


async def resolve(conn: asyncpg.Connection, code: str, *, branch_id: str | None = None,
                  register_id: str | None = None) -> asyncpg.Record:
    """The sequence for `code`, most specific first (register > branch >
    tenant); created from DEFAULTS when there is none yet."""
    row: asyncpg.Record | None = await conn.fetchrow(
        f"""select {_COLS} from sequences
             where code = $1
               and (branch_id is null or branch_id = coalesce($2::uuid, app_current_branch(tenant_id)))
               and (register_id is null or register_id = $3::uuid)
             order by register_id is null, branch_id is null
             limit 1""", code, branch_id, register_id)
    if row is not None and (register_id is None or row["register_id"] is not None):
        return row
    default = DEFAULTS.get(code)
    if default is None:
        if row is not None:  # no default to make a register counter from: share the branch's
            return row
        raise KeyError(f"no sequence and no default for {code!r}")
    scope = "register" if register_id is not None else default.scope
    await conn.execute(
        """insert into sequences (tenant_id, code, name, branch_id, register_id, pattern, padding, reset, gapless)
           select current_setting('app.tenant_id')::uuid, $1, $2,
                  case when $3 = 'tenant' then null
                       else coalesce($4::uuid, app_current_branch(current_setting('app.tenant_id')::uuid)) end,
                  $5::uuid, $6, $7, $8, $9
           on conflict do nothing""",
        code, default.name, scope, branch_id, register_id, default.pattern, default.padding,
        default.reset, default.gapless)
    created: asyncpg.Record = await conn.fetchrow(
        f"""select {_COLS} from sequences
             where code = $1
               and (branch_id is null or branch_id = coalesce($2::uuid, app_current_branch(tenant_id)))
               and (register_id is null or register_id = $3::uuid)
             order by register_id is null, branch_id is null
             limit 1""", code, branch_id, register_id)
    return created


async def _render_for(conn: asyncpg.Connection, seq: asyncpg.Record, value: int, d: date, period: str,
                      register_code: str) -> str:
    branch_code = ""
    if seq["branch_id"] is not None:
        branch_code = await conn.fetchval("select code from branches where id = $1", seq["branch_id"]) or ""
    return render(seq["pattern"], value, seq["padding"], d=d, period=period,
                  branch_code=branch_code, register_code=register_code)


async def _fy_start(conn: asyncpg.Connection) -> int:
    start: int = await conn.fetchval(
        "select fy_start_month from tenants where id = current_setting('app.tenant_id')::uuid")
    return start


async def next_number(conn: asyncpg.Connection, code: str, *, at: date | datetime | None = None,
                      branch_id: str | None = None, register_id: str | None = None,
                      register_code: str = "") -> Allocated:
    """Take the next number. Must be the last step of the document's
    transaction (see the module docstring)."""
    if not conn.is_in_transaction():
        raise RuntimeError("next_number must run inside the document's transaction")
    seq = await resolve(conn, code, branch_id=branch_id, register_id=register_id)
    d = await local_date(conn, at)
    period = period_key(seq["reset"], d, await _fy_start(conn))
    # Queue briefly behind a concurrent document on the same counter rather
    # than failing a till outright; the rest of this transaction keeps it.
    await conn.execute("select set_config('lock_timeout', '3s', true)")
    value: int = await conn.fetchval(_ALLOCATE, seq["tenant_id"], seq["id"], period)
    number = await _render_for(conn, seq, value, d, period, register_code)
    return Allocated(number=number, value=value, period_key=period, sequence_id=str(seq["id"]))


async def peek(conn: asyncpg.Connection, seq: asyncpg.Record, d: date) -> tuple[str, int, str]:
    """(period, next value, rendered next number) without taking it."""
    period = period_key(seq["reset"], d, await _fy_start(conn))
    nxt: int = await conn.fetchval(
        "select coalesce((select next_value from sequence_counters where sequence_id = $1 and period_key = $2), 1)",
        seq["id"], period)
    return period, nxt, await _render_for(conn, seq, nxt, d, period, "")


async def list_all(conn: asyncpg.Connection) -> list[asyncpg.Record]:
    rows: list[asyncpg.Record] = await conn.fetch(f"select {_COLS} from sequences order by code, branch_id")
    return rows


async def set_next(conn: asyncpg.Connection, sequence_id: str, next_value: int,
                   period: str | None = None) -> tuple[int, int, str] | None:
    """Move a counter forward (never back: that would reissue numbers).
    Returns (before, after, period), or None when the sequence isn't visible.
    Raises ValueError when asked to go backwards."""
    seq = await conn.fetchrow(f"select {_COLS} from sequences where id = $1", sequence_id)
    if seq is None:
        return None
    if period is None:
        period = period_key(seq["reset"], await local_date(conn, None), await _fy_start(conn))
    before: int = await conn.fetchval(
        """select coalesce((select next_value from sequence_counters
                             where sequence_id = $1 and period_key = $2 for update), 1)""",
        seq["id"], period)
    if next_value < before:
        raise ValueError(f"The next number can only move forward (it is {before} now)")
    await conn.execute(
        """insert into sequence_counters (tenant_id, sequence_id, period_key, next_value)
           values ($1, $2, $3, $4)
           on conflict (sequence_id, period_key) do update
              set next_value = excluded.next_value, updated_at = now()
            where sequence_counters.next_value <= excluded.next_value""",
        seq["tenant_id"], seq["id"], period, next_value)
    return before, next_value, period
