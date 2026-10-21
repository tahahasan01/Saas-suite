"""Branches inside a tenant (D-03, migration 0055).

The data model lives in the database: `branches`, `user_branches`, the
restrictive `branch_scope` policy and the `bos_fill_branch` trigger. Python
only has to (1) send the requested branches, which the request middleware
reads from X-Branch-Ids into the context (app/context.py), and (2) open
connections through db.tenant_conn, which turns that into `app.branch_ids`.

A new transactional table gets isolation with one line in its migration:

    call bos_branch_scope('payroll_runs', true);   -- required branch_id
    call bos_branch_scope('contacts', false);      -- master: nullable, shared

and is listed below so the structure tests cover it.
"""
from __future__ import annotations

from typing import Any

import asyncpg

# Rows that belong to one branch: branch_id NOT NULL + restrictive policy.
TRANSACTIONAL_TABLES: tuple[str, ...] = (
    "pos_sales", "pos_returns", "pos_drawers", "pos_purchase_orders",
    "hrms_attendance", "hrms_punches", "crm_invoice_requests",
    # Phase 3 Wave 1 (0073)
    "activities", "hrms_attendance_corrections", "payroll_runs",
    "invoices",   # 0074
    "pos_stock_moves",   # 0075
)
# Shared masters: branch_id nullable (null = every branch).
MASTER_TABLES: tuple[str, ...] = ("pos_products", "hrms_locations", "hrms_departments", "hrms_kiosks")

_COLS = ("id, code, name, address, phone, region_code, timezone, fbr_pos_id, receipt_header, "
         "is_default, active")


def out(row: asyncpg.Record) -> dict[str, Any]:
    return {**dict(row), "id": str(row["id"])}


async def visible(conn: asyncpg.Connection) -> list[dict[str, Any]]:
    """Branches the current transaction may work in (app.branch_ids), default first."""
    rows = await conn.fetch(
        f"""select {_COLS} from branches
             where app_branch_visible(id) order by is_default desc, name""")
    return [out(r) for r in rows]


async def all_branches(conn: asyncpg.Connection) -> list[dict[str, Any]]:
    rows = await conn.fetch(f"select {_COLS} from branches order by is_default desc, name")
    return [out(r) for r in rows]


async def default_branch_id(conn: asyncpg.Connection) -> str:
    return str(await conn.fetchval("select id from branches where is_default"))
