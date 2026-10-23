"""Pay policies each company sets (0112).

The product is sold to many companies whose rules differ, so what used to
be fixed in code is a setting: the per-day rate for encashed leave, how
gratuity is taxed and which leave types are paid out on leaving. Presets
set these together with the gratuity rule (0104) and the overtime rates
(0109) for a kind of business; each field can be changed after. Every
preset is a starting point to check, not legal advice.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

import asyncpg

from . import leave, payroll_data


@dataclass(frozen=True)
class Policies:
    encash_basis: str = "days_30"
    gratuity_tax: str = "taxed"
    gratuity_exempt_minor: int | None = None


@dataclass(frozen=True)
class Preset:
    name: str
    summary: str
    gratuity: dict[str, Any]
    overtime: tuple[float, float, float]           # ordinary day, day off, holiday
    policies: Policies
    paid_on_leaving: frozenset[str]                 # leave type codes


PRESETS: dict[str, Preset] = {
    "standing_orders": Preset(
        "Factory or shop (Standing Orders)",
        "Gratuity of 30 days' pay a year after 12 months, overtime at double, unused annual leave paid out on leaving.",
        {"enabled": True, "days_per_year": 30, "min_service_months": 12, "part_year_months": 6},
        (2.0, 2.0, 2.0), Policies("days_30", "taxed"), frozenset({"annual"})),
    "provident_fund": Preset(
        "Office with a provident fund",
        "No gratuity (a provident fund instead), overtime at double, unused annual leave paid out on leaving.",
        {"enabled": False, "days_per_year": 30, "min_service_months": 12, "part_year_months": 6},
        (2.0, 2.0, 2.0), Policies("days_30", "taxed"), frozenset({"annual"})),
    "small_business": Preset(
        "Small business (the basics)",
        "No gratuity, overtime at double, nothing paid out for unused leave on leaving.",
        {"enabled": False, "days_per_year": 30, "min_service_months": 12, "part_year_months": 6},
        (2.0, 2.0, 2.0), Policies("days_30", "taxed"), frozenset()),
}


async def load(conn: asyncpg.Connection) -> Policies:
    r = await conn.fetchrow("select * from payroll_policies")
    if r is None:
        return Policies()
    return Policies(r["encash_basis"], r["gratuity_tax"], r["gratuity_exempt_minor"])


async def divisor(conn: asyncpg.Connection, on: date) -> int:
    """Days a month's salary is divided by for one day of encashed leave."""
    basis = (await load(conn)).encash_basis
    if basis == "days_26":
        return 26
    if basis == "working_days":
        return await payroll_data.working_days(conn, on.replace(day=1))
    return 30


def gratuity_split(amount: int, p: Policies) -> tuple[int, int]:
    """(tax-free part, taxed part) of a gratuity under the company's rule."""
    if p.gratuity_tax == "exempt":
        return amount, 0
    if p.gratuity_tax == "exempt_up_to" and p.gratuity_exempt_minor:
        free = min(amount, p.gratuity_exempt_minor)
        return free, amount - free
    return 0, amount


async def apply_preset(conn: asyncpg.Connection, tenant_id: str, user_id: str, key: str) -> None:
    pre = PRESETS[key]
    g = pre.gratuity
    await conn.execute(
        """insert into payroll_gratuity_settings (tenant_id, enabled, days_per_year, min_service_months,
                                                  part_year_months, updated_by)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (tenant_id) do update set enabled = excluded.enabled, days_per_year = excluded.days_per_year,
              min_service_months = excluded.min_service_months, part_year_months = excluded.part_year_months,
              updated_by = excluded.updated_by, updated_at = now()""",
        tenant_id, g["enabled"], g["days_per_year"], g["min_service_months"], g["part_year_months"], user_id)
    normal, rest, holiday = pre.overtime
    await conn.execute(
        """insert into hrms_overtime_rates (tenant_id, normal, rest_day, holiday, updated_by)
           values ($1, $2, $3, $4, $5)
           on conflict (tenant_id) do update set normal = excluded.normal, rest_day = excluded.rest_day,
              holiday = excluded.holiday, updated_by = excluded.updated_by, updated_at = now()""",
        tenant_id, normal, rest, holiday, user_id)
    p = pre.policies
    await conn.execute(
        """insert into payroll_policies (tenant_id, encash_basis, gratuity_tax, gratuity_exempt_minor, preset,
                                         updated_by)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (tenant_id) do update set encash_basis = excluded.encash_basis,
              gratuity_tax = excluded.gratuity_tax, gratuity_exempt_minor = excluded.gratuity_exempt_minor,
              preset = excluded.preset, updated_by = excluded.updated_by, updated_at = now()""",
        tenant_id, p.encash_basis, p.gratuity_tax, p.gratuity_exempt_minor, key, user_id)
    await leave.ensure_types(conn, tenant_id)
    await conn.execute("update hrms_leave_types set paid_on_leaving = (code = any($1::text[]))",
                       list(pre.paid_on_leaving))
