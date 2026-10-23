"""Provident fund (0113): the company's rule, a member's balance, the payout.

A member's fund is the PF_EE and PF_ER lines of final payroll runs plus the
entries HR records (opening balance, withdrawal, adjustment) and, on
leaving, the payout and the forfeited unvested employer share. The
employer's share belongs to the member once they have the company's
vesting months of membership.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

import asyncpg

from . import payroll_data
from . import payroll_engine as eng


@dataclass(frozen=True)
class Balance:
    employee_minor: int
    employer_minor: int
    vested_employer_minor: int


async def rule(conn: asyncpg.Connection) -> eng.ProvidentFund | None:
    r = await conn.fetchrow("select * from payroll_policies")
    if r is None or not r["pf_enabled"]:
        return None
    return eng.ProvidentFund(employee_rate=Decimal(r["pf_employee_rate"]) / 100,
                             employer_rate=Decimal(r["pf_employer_rate"]) / 100, base=r["pf_base"])


async def vesting_months(conn: asyncpg.Connection) -> int:
    return int(await conn.fetchval("select pf_vesting_months from payroll_policies") or 0)


def _months(since: date, until: date) -> int:
    m = (until.year - since.year) * 12 + until.month - since.month
    return m - (1 if until.day < since.day else 0)


async def balance(conn: asyncpg.Connection, employee_id: Any, *, on: date | None = None) -> Balance:
    lines = await conn.fetchrow(
        """select coalesce(sum(l.amount_minor) filter (where l.code = 'PF_EE'), 0) as ee,
                  coalesce(sum(l.amount_minor) filter (where l.code = 'PF_ER'), 0) as er
             from payslip_lines l join payroll_runs r on r.id = l.run_id
            where l.employee_id = $1 and l.code in ('PF_EE', 'PF_ER') and r.status = any($2::text[])""",
        employee_id, list(payroll_data.FINAL))
    entries = await conn.fetchrow(
        """select coalesce(sum(employee_minor), 0) as ee, coalesce(sum(employer_minor), 0) as er
             from pay_pf_entries where employee_id = $1""", employee_id)
    ee, er = int(lines["ee"]) + int(entries["ee"]), int(lines["er"]) + int(entries["er"])
    e = await conn.fetchrow("select pf_joined_on, join_date from hrms_employees where id = $1", employee_id)
    since = (e["pf_joined_on"] or e["join_date"]) if e else None
    today: date = on or await conn.fetchval("select current_date")
    vested = er if since is not None and _months(since, today) >= await vesting_months(conn) else 0
    return Balance(ee, er, max(0, vested))


async def history(conn: asyncpg.Connection, employee_id: Any) -> list[dict[str, Any]]:
    """Monthly contributions (final runs) and the recorded entries, oldest first."""
    rows: list[dict[str, Any]] = [dict(r) for r in await conn.fetch(
        """select r.period_start as on, 'Contribution ' || to_char(r.period_start, 'Mon YYYY') as what,
                  coalesce(sum(l.amount_minor) filter (where l.code = 'PF_EE'), 0) as employee_minor,
                  coalesce(sum(l.amount_minor) filter (where l.code = 'PF_ER'), 0) as employer_minor
             from payslip_lines l join payroll_runs r on r.id = l.run_id
            where l.employee_id = $1 and l.code in ('PF_EE', 'PF_ER') and r.status = any($2::text[])
            group by r.period_start""", employee_id, list(payroll_data.FINAL))]
    rows += [dict(r) for r in await conn.fetch(
        """select created_at::date as on, initcap(kind) || case when note <> '' then ': ' || note else '' end as what,
                  employee_minor, employer_minor from pay_pf_entries where employee_id = $1""", employee_id)]
    rows.sort(key=lambda x: x["on"])
    return rows
