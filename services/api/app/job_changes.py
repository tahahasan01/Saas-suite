"""Promotions and transfers (wave C, H30, St12, 0106): applying a change.

Who may make a change is checked when it is made (the router); applying it,
now or on the day by the worker, writes the employee's links, keeps the
text columns in step (as hrorg.apply_job does) and, for a new salary, adds
a compensation row dated on the effective day.
"""
from __future__ import annotations

from typing import Any

import asyncpg

from .hrorg import _manager_loop

_NAMES = {
    "job_title_id": ("hrms_job_titles", "title"),
    "department_id": ("hrms_departments", "department"),
    "location_id": ("hrms_locations", "location"),
    "manager_id": ("hrms_employees", "manager"),
}


async def snapshot(conn: asyncpg.Connection, employee_id: Any, change: dict[str, Any]) -> dict[str, Any]:
    """The from_/to_ names for the links this change touches."""
    e = await conn.fetchrow("select * from hrms_employees where id = $1", employee_id)
    out: dict[str, Any] = {}
    for col, (table, label) in _NAMES.items():
        if change.get(col) is None:
            continue
        out[f"from_{label}"] = await conn.fetchval(f"select name from {table} where id = $1", e[col]) if e[col] else None
        out[f"to_{label}"] = await conn.fetchval(f"select name from {table} where id = $1", change[col])
    return out


async def apply(conn: asyncpg.Connection, change: asyncpg.Record) -> bool:
    """Applies one scheduled change; False (and cancelled) if the manager
    link would now make a loop."""
    eid = change["employee_id"]
    if change["manager_id"] is not None and await _manager_loop(conn, str(eid), change["manager_id"]):
        await conn.execute(
            """update hrms_job_changes set status = 'cancelled',
                      note = btrim(note || ' (not applied: the reporting line would go round in a circle)')
                where id = $1""", change["id"])
        return False
    sets = [col for col in _NAMES if change[col] is not None]
    if sets:
        assign = ", ".join(f"{c} = ${i + 2}" for i, c in enumerate(sets))
        await conn.execute(f"update hrms_employees set {assign} where id = $1", eid, *[change[c] for c in sets])
        await conn.execute(
            """update hrms_employees e set
                 department = case when $2 then coalesce((select name from hrms_departments where id = e.department_id), '')
                                   else department end,
                 designation = case when $3 then coalesce((select name from hrms_job_titles where id = e.job_title_id), '')
                                    else designation end
               where e.id = $1""", eid, "department_id" in sets, "job_title_id" in sets)
    if change["new_base_minor"] is not None:
        structure = await conn.fetchval(
            """select structure_id from hrms_compensation where employee_id = $1 and effective_from <= $2
                order by effective_from desc, seq desc limit 1""", eid, change["effective_on"])
        await conn.execute(
            """insert into hrms_compensation (tenant_id, employee_id, effective_from, base_minor, reason, note,
                                              structure_id, created_by)
               values ($1, $2, $3, $4, $5, $6, $7, $8)""",
            change["tenant_id"], eid, change["effective_on"], change["new_base_minor"],
            "promotion" if change["kind"] == "promotion" else "adjustment",
            f"job change {change['id']}", structure, change["created_by"])
    await conn.execute("update hrms_job_changes set status = 'applied', applied_at = now() where id = $1", change["id"])
    return True


async def apply_due(conn: asyncpg.Connection) -> int:
    """Every scheduled change whose day has come, oldest first."""
    done = 0
    for ch in await conn.fetch(
            """select * from hrms_job_changes where status = 'scheduled' and effective_on <= current_date
                order by effective_on, created_at for update skip locked"""):
        done += await apply(conn, ch)
    return done
