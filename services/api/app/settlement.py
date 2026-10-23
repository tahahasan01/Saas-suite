"""Final settlement and gratuity (wave C, H12, St12 §3, 0104).

A leaver's settlement lists what the company owes (gratuity, encashed
annual leave, hand-added notice pay or bonus) and what it recovers
(outstanding advances, the cost of assets kept). Approval books every line
as a one-off in the leaver's last pay month, so one payslip carries it all
and payroll's freezing and tax apply as usual. When that run is marked paid
the settlement is paid and the employee becomes inactive (`on_run_paid`).

Gratuity follows the company's rule (payroll_gratuity_settings): days'
wages per year of service on the last basic salary, a part year longer than
`part_year_months` counting as a year, nothing under `min_service_months`.
The defaults mirror the Standing Orders pattern and stay unverified until
the founder confirms them.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

import asyncpg
from fastapi import HTTPException, status

from . import leave, pay_policies, payroll_data, provident_fund
from .payroll_engine import encash_amount

FINAL_RUNS = ("approved", "paid", "locked")


@dataclass(frozen=True)
class GratuityRule:
    enabled: bool
    days_per_year: int
    min_service_months: int
    part_year_months: int


def _add_months(d: date, n: int) -> date:
    """`d` plus n calendar months, clamped to the month's last day."""
    m = d.month - 1 + n
    y, m = d.year + m // 12, m % 12 + 1
    last = (date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)).day
    return date(y, m, min(d.day, last))


def service(joined: date, last_day: date) -> tuple[int, int]:
    """(whole months, extra days) from the joining date through the last
    working day, both counted."""
    end = last_day + timedelta(days=1)
    months = (end.year - joined.year) * 12 + end.month - joined.month
    if _add_months(joined, months) > end:
        months -= 1
    return months, (end - _add_months(joined, months)).days


def gratuity(base_minor: int, joined: date | None, last_day: date, rule: GratuityRule) -> tuple[int, int, dict[str, Any]]:
    """(years counted, amount in paisa, how it was worked out)."""
    if not rule.enabled or joined is None or base_minor <= 0 or last_day < joined:
        return 0, 0, {}
    months, days = service(joined, last_day)
    explain: dict[str, Any] = {"service": f"{months // 12}y {months % 12}m {days}d", "base_minor": base_minor,
                               "days_per_year": rule.days_per_year}
    if months < rule.min_service_months:
        return 0, 0, {**explain, "reason": f"under {rule.min_service_months} months' service"}
    years = months // 12
    left = months % 12
    if left > rule.part_year_months or (left == rule.part_year_months and days > 0):
        years += 1                                     # a part year over the threshold counts
    amount = int((Decimal(base_minor) * rule.days_per_year * years / 30).quantize(Decimal(1), ROUND_HALF_UP))
    return years, amount, {**explain, "years": years}


async def rule_for(conn: asyncpg.Connection) -> tuple[GratuityRule, bool]:
    r = await conn.fetchrow("select * from payroll_gratuity_settings")
    if r is None:
        return GratuityRule(enabled=False, days_per_year=30, min_service_months=12, part_year_months=6), False
    return GratuityRule(r["enabled"], r["days_per_year"], r["min_service_months"], r["part_year_months"]), r["verified"]


async def _base(conn: asyncpg.Connection, employee_id: Any, on: date) -> int:
    v = await conn.fetchval(
        """select base_minor from hrms_compensation where employee_id = $1 and effective_from <= $2
            order by effective_from desc, seq desc limit 1""", employee_id, on)
    if v is None:          # someone whose pay starts after their last day: their first salary
        v = await conn.fetchval(
            "select base_minor from hrms_compensation where employee_id = $1 order by effective_from, seq limit 1",
            employee_id)
    return int(v or 0)


async def outstanding_advances(conn: asyncpg.Connection, employee_id: Any) -> list[asyncpg.Record]:
    rows: list[asyncpg.Record] = await conn.fetch(
        """select a.id, a.principal_minor - coalesce((
                  select sum(l.amount_minor) from payslip_lines l join payroll_runs pr on pr.id = l.run_id
                   where l.ref_id = a.id and l.code = 'ADVANCE' and pr.status = any($2::text[])), 0)
                  - """ + payroll_data.REPAID_SQL + """ as outstanding
             from pay_advances a where a.employee_id = $1 and a.status = 'active' order by a.created_at""",
        employee_id, list(FINAL_RUNS))
    return [r for r in rows if r["outstanding"] > 0]


async def held_assets(conn: asyncpg.Connection, employee_id: Any) -> list[asyncpg.Record]:
    rows: list[asyncpg.Record] = await conn.fetch(
        """select a.id, a.name, a.tag, a.value_minor from hrms_asset_assignments h
             join hrms_assets a on a.id = h.asset_id
            where h.employee_id = $1 and h.returned_at is null order by a.name""", employee_id)
    return rows


async def build_auto_lines(conn: asyncpg.Connection, tenant_id: str, settlement: asyncpg.Record) -> int:
    """(Re)writes the worked-out lines of a draft; hand-added ones stay.
    Returns the gratuity years counted."""
    sid, eid, last = settlement["id"], settlement["employee_id"], settlement["last_working_day"]
    await conn.execute("delete from hrms_final_settlement_lines where settlement_id = $1 and auto", sid)
    joined = await conn.fetchval("select join_date from hrms_employees where id = $1", eid)
    base = await _base(conn, eid, last)
    lines: list[tuple[Any, ...]] = []

    rule, _ = await rule_for(conn)
    policy = await pay_policies.load(conn)
    years, amount, explain = gratuity(base, joined, last, rule)
    label = f"Gratuity ({years} year{'s' if years != 1 else ''})"
    # The company's tax rule (0112): all taxed, all tax-free, or tax-free up to a limit.
    free, taxed = pay_policies.gratuity_split(amount, policy)
    if free > 0:
        lines.append(("payable", "GRATUITY", f"{label}, tax-free", free, False, None, None, explain))
    if taxed > 0:
        lines.append(("payable", "GRATUITY", label + (", taxed part" if free else ""), taxed, True, None, None, explain))

    divisor = await pay_policies.divisor(conn, last)
    balances = await leave.balances(conn, tenant_id, str(eid), on=last)   # seeds a new company's leave types
    paid_out = {str(r["id"]) for r in await conn.fetch("select id from hrms_leave_types where paid_on_leaving")}
    for b in balances:
        if b.leave_type_id in paid_out and b.remaining > 0:
            days = Decimal(str(b.remaining))
            per_day, value = encash_amount(base, days, divisor=divisor)
            if value > 0:
                lines.append(("payable", "LEAVE_ENCASH", f"{b.name or b.leave_type} not taken ({b.remaining:g} days)"[:120], value, True,
                              b.leave_type_id, days, {"per_day_minor": per_day}))

    # The provident fund (0113): their own share and the vested employer share.
    pf = await provident_fund.balance(conn, eid, on=last)
    if pf.employee_minor + pf.vested_employer_minor > 0:
        lines.append(("payable", "PF_PAYOUT", "Provident fund", pf.employee_minor + pf.vested_employer_minor, False,
                      None, None, {"employee_minor": pf.employee_minor, "employer_minor": pf.employer_minor,
                                   "vested_employer_minor": pf.vested_employer_minor}))

    for a in await outstanding_advances(conn, eid):
        lines.append(("receivable", "ADVANCE_SETTLE", "Advance still owed", int(a["outstanding"]), False, a["id"],
                      None, {}))
    for a in await held_assets(conn, eid):
        if a["value_minor"]:
            lines.append(("receivable", "ASSET_RECOVERY", f"Not returned: {a['name']}"[:120], a["value_minor"], False,
                          a["id"], None, {}))

    start = await conn.fetchval(
        "select coalesce(max(sort), 0) + 1 from hrms_final_settlement_lines where settlement_id = $1", sid)
    await conn.executemany(
        """insert into hrms_final_settlement_lines (tenant_id, settlement_id, kind, code, name, amount_minor, taxable,
                                                    auto, ref_id, days, explain, sort)
           values ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10, $11)""",
        [(tenant_id, sid, k, c, n, amt, tx, ref, d, ex, start + i)
         for i, (k, c, n, amt, tx, ref, d, ex) in enumerate(lines)])
    await conn.execute("update hrms_final_settlements set service_years = $2 where id = $1", sid, years)
    return years


async def approve(conn: asyncpg.Connection, tenant_id: str, user_id: str, settlement: asyncpg.Record) -> None:
    sid, eid = settlement["id"], settlement["employee_id"]
    lines = await conn.fetch("select * from hrms_final_settlement_lines where settlement_id = $1 order by sort", sid)
    charged = {ln["ref_id"] for ln in lines if ln["code"] == "ASSET_RECOVERY"}
    kept = [a["name"] for a in await held_assets(conn, eid) if a["id"] not in charged]
    if kept:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "Still holding: " + ", ".join(kept) + ". Take them back or charge them first")
    owed = {a["id"]: int(a["outstanding"]) for a in await outstanding_advances(conn, eid)}
    booked = {ln["ref_id"]: ln["amount_minor"] for ln in lines if ln["code"] == "ADVANCE_SETTLE"}
    if owed != booked:
        raise HTTPException(status.HTTP_409_CONFLICT, "The advances changed since this was drafted: recalculate it")

    # The exit month, unless its payroll is already final; then the next one payroll will run.
    first = settlement["last_working_day"].replace(day=1)
    closed = await conn.fetchval(
        "select 1 from payroll_runs where kind = 'regular' and period_start = $1 and status = any($2::text[])",
        first, list(FINAL_RUNS))
    month = await payroll_data.next_pay_month(conn) if closed else first

    for ln in lines:
        earning = ln["kind"] == "payable"
        one_off = await conn.fetchval(
            """insert into pay_one_offs (tenant_id, employee_id, period, code, name, kind, amount_minor, taxable,
                                         note, created_by)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id""",
            tenant_id, eid, month, ln["code"], ln["name"], "earning" if earning else "deduction", ln["amount_minor"],
            ln["taxable"] and earning, f"final settlement {sid}", user_id)
        await conn.execute("update hrms_final_settlement_lines set one_off_id = $2 where id = $1", ln["id"], one_off)
        if ln["code"] == "ADVANCE_SETTLE":       # recovered in full here, so no instalment as well
            await conn.execute("update pay_advances set status = 'closed' where id = $1", ln["ref_id"])
        elif ln["code"] == "ASSET_RECOVERY":
            await conn.execute(
                """update hrms_asset_assignments set returned_at = now(),
                          return_note = 'Not returned: cost recovered in the final settlement'
                    where asset_id = $1 and returned_at is null""", ln["ref_id"])
            await conn.execute("update hrms_assets set status = 'lost', updated_at = now() where id = $1", ln["ref_id"])
        elif ln["code"] == "PF_PAYOUT":
            # Paid out with the last salary: the fund empties, the unvested employer share is forfeited.
            pf = await provident_fund.balance(conn, eid, on=settlement["last_working_day"])
            await conn.execute(
                """insert into pay_pf_entries (tenant_id, employee_id, kind, employee_minor, employer_minor,
                                               settlement_id, note, created_by)
                   values ($1, $2, 'payout', $3, $4, $5, 'final settlement', $6)""",
                tenant_id, eid, -pf.employee_minor, -pf.vested_employer_minor, sid, user_id)
            if pf.employer_minor > pf.vested_employer_minor:
                await conn.execute(
                    """insert into pay_pf_entries (tenant_id, employee_id, kind, employee_minor, employer_minor,
                                                   settlement_id, note, created_by)
                       values ($1, $2, 'forfeit', 0, $3, $4, 'employer share not yet vested', $5)""",
                    tenant_id, eid, -(pf.employer_minor - pf.vested_employer_minor), sid, user_id)
            await conn.execute("update hrms_employees set pf_member = false where id = $1", eid)
        elif ln["code"] == "LEAVE_ENCASH" and ln["ref_id"] is not None and ln["days"]:
            lt = await conn.fetchrow("select * from hrms_leave_types where id = $1", ln["ref_id"])
            cycle, _ = leave.cycle_bounds(settlement["last_working_day"], lt["cycle_start_month"])
            await conn.execute(
                """insert into hrms_leave_ledger (tenant_id, employee_id, leave_type_id, cycle_start, entry, days,
                                                  note, created_by)
                   values ($1, $2, $3, $4, 'encash', $5, 'final settlement', $6)""",
                tenant_id, eid, lt["id"], cycle, -ln["days"], user_id)
            await conn.execute(
                """insert into hrms_leave_encashments (tenant_id, employee_id, leave_type_id, days, per_day_minor,
                                                       amount_minor, one_off_id, note, created_by)
                   values ($1, $2, $3, $4, $5, $6, $7, 'final settlement', $8)""",
                tenant_id, eid, lt["id"], ln["days"], int((ln["explain"] or {}).get("per_day_minor", 0)),
                ln["amount_minor"], one_off, user_id)
    await conn.execute(
        """update hrms_final_settlements set status = 'approved', pay_month = $2, approved_by = $3, approved_at = now()
            where id = $1""", sid, month, user_id)


async def on_run_paid(conn: asyncpg.Connection) -> None:
    """Settlements whose every one-off a paid run carried are paid; their
    employees leave the books."""
    rows = await conn.fetch(
        """select s.id, s.employee_id from hrms_final_settlements s
            where s.status = 'approved'
              and not exists (
                select 1 from hrms_final_settlement_lines l
                  left join pay_one_offs o on o.id = l.one_off_id
                  left join payroll_runs r on r.id = o.run_id
                 where l.settlement_id = s.id
                   and (o.status is distinct from 'applied' or r.status not in ('paid', 'locked')))""")
    for r in rows:
        await conn.execute("update hrms_final_settlements set status = 'paid', paid_at = now() where id = $1", r["id"])
        await conn.execute("update hrms_employees set status = 'inactive' where id = $1", r["employee_id"])
