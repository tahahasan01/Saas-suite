"""Registers, sessions and split tender (3C, migration 0076, D-24, St01 §6.6).

Expected money comes by FOREIGN KEY — the session's own pos_payments,
pos_cash_moves and refunds — never "sales between opened_at and now", so a
second register's sales or a late sync can't leak into the wrong drawer:

    cash      = opening float + cash taken + pay-ins − pay-outs − drops − cash refunds
    any other = taken − refunds on that method

`tenders()` turns what the till sent into payment rows: one per method, the
change only ever from cash, non-cash never more than is left to pay.
Closing counts every method, needs a manager's PIN when the cash variance is
over the register's limit, is refused while the closing device still holds
unsent sales, and freezes expected and counted.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

import asyncpg
from fastapi import HTTPException, status

from . import pins, pricing, rbac
from .deps import AuthContext

METHODS = ("cash", "card", "jazzcash", "easypaisa", "raast", "bank", "khata")


# ── Registers ───────────────────────────────────────────────────────────────
async def register(conn: asyncpg.Connection, register_id: Any = None) -> asyncpg.Record:
    """The named register, else the tenant's default one."""
    if register_id is None:
        row = await conn.fetchrow("select * from pos_registers where is_default")
    else:
        row = await conn.fetchrow("select * from pos_registers where id = $1", register_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Register not found")
    return row


async def rounding_unit(conn: asyncpg.Connection, reg: asyncpg.Record | None) -> int:
    """The register's cash rounding, else the company's."""
    if reg is not None and reg["cash_rounding_minor"] is not None:
        return int(reg["cash_rounding_minor"])
    unit = await conn.fetchval(
        "select cash_rounding_minor from tenants where id = current_setting('app.tenant_id')::uuid")
    return int(unit or 0)


async def open_session_id(conn: asyncpg.Connection, register_id: Any) -> Any:
    return await conn.fetchval("select id from pos_sessions where register_id = $1 and status = 'open'",
                               register_id)


# ── Tender ──────────────────────────────────────────────────────────────────
@dataclass
class Tender:
    method: str
    amount_minor: int       # applied to the sale
    tendered_minor: int     # handed over (cash may exceed what's applied)
    reference: str = ""

    @property
    def change_minor(self) -> int:
        return self.tendered_minor - self.amount_minor


@dataclass
class TenderPlan:
    tenders: list[Tender]
    rounding_minor: int
    due_minor: int
    paid_minor: int
    change_minor: int
    payment_method: str      # one method, or 'split'


def _short(due: int, paid: int) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                         f"Payment is short by Rs {(due - paid) / 100:,.2f} (due Rs {due / 100:,.2f}).")


def tenders(total_minor: int, unit: int, payments: list[Any] | None, legacy_method: str,
            legacy_paid: int, allowed: list[str] | None = None) -> TenderPlan:
    """Plan the payment rows. Cash rounding applies only to an all-cash sale
    (D-21: it never changes the invoice total); with a split every method
    pays exactly and only cash gives change."""
    if not payments:
        method = legacy_method
        due, rounding = pricing.cash_due(total_minor, unit) if method == "cash" else (total_minor, 0)
        paid = legacy_paid or due      # 0 = the exact amount (card, wallet, bank)
        if paid < due:
            raise _short(due, paid)
        if method != "cash" and paid > due:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                "Only cash can be overpaid: card and wallet payments are for the exact amount.")
        plan = TenderPlan([Tender(method, due, paid)] if due > 0 else [], rounding, due, paid, paid - due, method)
    else:
        methods = [p.method for p in payments]
        if len(set(methods)) != len(methods):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Give each method once")
        only_cash = methods == ["cash"]
        due, rounding = pricing.cash_due(total_minor, unit) if only_cash else (total_minor, 0)
        left = due
        rows: list[Tender] = []
        # Non-cash first, each for no more than is left; then cash covers the rest.
        for p in sorted(payments, key=lambda p: p.method == "cash"):
            if p.method != "cash":
                if p.amount_minor > left:
                    raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                        f"{p.method} pays more than is left (Rs {left / 100:,.2f}); only cash gives change.")
                rows.append(Tender(p.method, p.amount_minor, p.amount_minor, p.reference))
                left -= p.amount_minor
            else:
                if p.amount_minor < left:
                    raise _short(due, due - left + p.amount_minor)
                if left > 0:
                    rows.append(Tender("cash", left, p.amount_minor, p.reference))
                left = 0
        if left > 0:
            raise _short(due, due - left)
        paid = sum(t.tendered_minor for t in rows)
        plan = TenderPlan(rows, rounding, due, paid, paid - due,
                          rows[0].method if len(rows) == 1 else ("split" if rows else methods[0]))
    if allowed is not None:
        for t in plan.tenders:
            if t.method not in allowed:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"This register doesn't take {t.method}")
    return plan


async def record_tenders(conn: asyncpg.Connection, tenant_id: str, sale_id: Any, session_id: Any,
                         plan: TenderPlan) -> None:
    await conn.executemany(
        """insert into pos_payments (tenant_id, sale_id, session_id, method, amount_minor, tendered_minor,
                                     change_minor, reference)
           values ($1, $2, $3, $4, $5, $6, $7, $8)""",
        [(tenant_id, sale_id, session_id, t.method, t.amount_minor, t.tendered_minor, t.change_minor, t.reference)
         for t in plan.tenders])


# ── Figures ─────────────────────────────────────────────────────────────────
async def live_figures(conn: asyncpg.Connection, s: asyncpg.Record) -> dict[str, dict[str, int]]:
    """Per method: taken, refunded, expected — computed by FK."""
    out: dict[str, dict[str, int]] = {}
    for r in await conn.fetch(
            "select method, sum(amount_minor)::bigint as taken from pos_payments where session_id = $1 group by method",
            s["id"]):
        out.setdefault(r["method"], {"taken": 0, "refunds": 0})["taken"] = int(r["taken"])
    for r in await conn.fetch(
            """select refund_method, sum(refund_minor)::bigint as refunded from pos_returns
                where session_id = $1 group by refund_method""", s["id"]):
        out.setdefault(r["refund_method"], {"taken": 0, "refunds": 0})["refunds"] = int(r["refunded"])
    moves = {r["kind"]: int(r["total"]) for r in await conn.fetch(
        "select kind, sum(amount_minor)::bigint as total from pos_cash_moves where session_id = $1 group by kind",
        s["id"])}
    cash = out.setdefault("cash", {"taken": 0, "refunds": 0})
    cash["pay_in"], cash["pay_out"], cash["drop"] = moves.get("pay_in", 0), moves.get("pay_out", 0), moves.get("drop", 0)
    for m, f in out.items():
        f["expected"] = f["taken"] - f["refunds"]
        if m == "cash":
            f["expected"] += s["opening_float_minor"] + f["pay_in"] - f["pay_out"] - f["drop"]
    return out


async def session_out(conn: asyncpg.Connection, s: asyncpg.Record) -> dict[str, Any]:
    figures = await live_figures(conn, s)
    frozen = s["expected"] or {}
    counted = s["counted"] or {}
    methods = []
    for m in sorted(set(figures) | set(frozen) | set(counted), key=lambda m: (m != "cash", m)):
        f = figures.get(m, {"taken": 0, "refunds": 0, "expected": 0})
        expected = int(frozen[m]) if m in frozen else f["expected"]
        c = counted.get(m)
        methods.append({"method": m, "taken_minor": f["taken"], "refunds_minor": f["refunds"],
                        "expected_minor": expected, "counted_minor": c,
                        "variance_minor": None if c is None else int(c) - expected})
    names = {r["id"]: r["name"] for r in await conn.fetch(
        "select id, name from users where id = any($1::uuid[])",
        [x for x in (s["opened_by"], s["closed_by"], s["variance_approved_by"]) if x])}
    reg = await conn.fetchrow("select code, name from pos_registers where id = $1", s["register_id"])
    cash = figures.get("cash", {})
    return {
        "id": str(s["id"]), "register_id": str(s["register_id"]), "register_code": reg["code"],
        "register_name": reg["name"], "status": s["status"], "opened_at": s["opened_at"],
        "opened_by": names.get(s["opened_by"]), "closed_at": s["closed_at"], "closed_by": names.get(s["closed_by"]),
        "opening_float_minor": s["opening_float_minor"], "methods": methods,
        "pay_in_minor": cash.get("pay_in", 0), "pay_out_minor": cash.get("pay_out", 0), "drop_minor": cash.get("drop", 0),
        "variance_approved_by": str(s["variance_approved_by"]) if s["variance_approved_by"] else None,
        "notes": s["notes"] or "", "warnings": [],
    }


# ── Close ───────────────────────────────────────────────────────────────────
async def close(conn: asyncpg.Connection, auth: AuthContext, session_id: str, counted: dict[str, int], notes: str,
                device_id: Any, approver_id: Any, approver_pin: str | None) -> tuple[asyncpg.Record, list[str]]:
    s = await conn.fetchrow("select * from pos_sessions where id = $1 for update", session_id)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if s["status"] != "open":
        raise HTTPException(status.HTTP_409_CONFLICT, "This session is already closed")
    reg = await conn.fetchrow("select * from pos_registers where id = $1", s["register_id"])
    warnings: list[str] = []
    for d in await conn.fetch(
            "select id, name, device_code, outbox_count from pos_devices where register_id = $1 and outbox_count > 0",
            s["register_id"]):
        if device_id is not None and str(d["id"]) == str(device_id):
            raise HTTPException(status.HTTP_409_CONFLICT,
                                f"This till still has {d['outbox_count']} unsent sale(s). Let them sync, then close.")
        warnings.append(f"{d['name'] or d['device_code']} still has {d['outbox_count']} unsent sale(s).")

    figures = await live_figures(conn, s)
    expected = {m: f["expected"] for m, f in figures.items()}
    for m in counted:
        if m not in METHODS:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown method {m}")
    cash_counted = int(counted.get("cash", 0))
    variance = cash_counted - expected.get("cash", 0)
    approver = None
    if abs(variance) > reg["max_variance_minor"]:
        if approver_id is None or not approver_pin:
            raise HTTPException(status.HTTP_403_FORBIDDEN,
                                f"The cash is Rs {abs(variance) / 100:,.2f} {'over' if variance > 0 else 'short'}: "
                                "a manager must approve with their PIN.")
        mgr = await conn.fetchrow("select id, role_id, pos_pin_hash from users where id = $1 and status = 'active'",
                                  approver_id)
        held = await rbac.effective_permissions(conn, auth.tenant_id, mgr["role_id"] if mgr else None,
                                                str(mgr["id"]) if mgr else None)
        if mgr is None or "pos.session.approve" not in held:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "That person can't approve a variance")
        await pins.check(f"user:{mgr['id']}", mgr["pos_pin_hash"], approver_pin)
        approver = mgr["id"]

    now: datetime = await conn.fetchval("select now()")
    closed = await conn.fetchrow(
        """update pos_sessions set status = 'closed', closed_by = $2, closed_at = $3, expected = $4, counted = $5,
                                   expected_minor = $6, counted_minor = $7, notes = $8, variance_approved_by = $9,
                                   closed_device_id = $10
            where id = $1 returning *""",
        session_id, auth.user_id, now, expected, {k: int(v) for k, v in counted.items()},
        expected.get("cash", 0), cash_counted, notes, approver, device_id)
    return closed, warnings


async def z_report(conn: asyncpg.Connection, s: asyncpg.Record) -> dict[str, Any]:
    """The closed (or still open) session's own sales, by FK."""
    totals = await conn.fetchrow(
        """select count(*) as n, coalesce(sum(subtotal_minor), 0)::bigint as gross,
                  coalesce(sum(discount_minor), 0)::bigint as discount, coalesce(sum(tax_minor), 0)::bigint as tax,
                  coalesce(sum(total_minor), 0)::bigint as total, coalesce(sum(rounding_minor), 0)::bigint as rounding
             from pos_sales where session_id = $1 and ($2::timestamptz is null or created_at <= $2)""",
        s["id"], s["closed_at"])
    refunds = await conn.fetchrow(
        """select count(*) as n, coalesce(sum(refund_minor), 0)::bigint as total,
                  coalesce(sum(tax_minor), 0)::bigint as tax
             from pos_returns where session_id = $1""", s["id"])
    cashiers = await conn.fetch(
        """select u.name, count(*) as n, coalesce(sum(s.total_minor), 0)::bigint as total
             from pos_sales s left join users u on u.id = s.cashier_id
            where s.session_id = $1 group by u.name order by total desc""", s["id"])
    late = await conn.fetch(
        """select id, total_minor, created_at from pos_sales
            where session_id = $1 and $2::timestamptz is not null and created_at > $2 order by created_at""",
        s["id"], s["closed_at"])
    out = await session_out(conn, s)
    return {
        "session": out, "sales_count": totals["n"], "gross_minor": totals["gross"],
        "discount_minor": totals["discount"], "tax_minor": totals["tax"], "net_minor": totals["total"],
        "rounding_minor": totals["rounding"], "refunds_count": refunds["n"], "refunds_minor": refunds["total"],
        "refund_tax_minor": refunds["tax"],
        "methods": [{"method": m["method"], "taken_minor": m["taken_minor"], "refunds_minor": m["refunds_minor"],
                     "expected_minor": m["expected_minor"], "counted_minor": m["counted_minor"],
                     "variance_minor": m["variance_minor"]} for m in out["methods"] if m["taken_minor"] or m["refunds_minor"]],
        "cashiers": [{"name": c["name"] or "—", "sales_count": c["n"], "total_minor": c["total"]} for c in cashiers],
        "late_synced": [{"sale_id": str(r["id"]), "total_minor": r["total_minor"], "created_at": r["created_at"]}
                        for r in late],
    }
