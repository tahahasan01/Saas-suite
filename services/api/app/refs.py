"""Checks that a referenced id belongs to the caller's tenant (audit P1-5).

Foreign keys are enforced by the database without RLS, so an id from another
tenant satisfies them. Reading the row through the tenant connection — where
RLS applies — is what proves the reference is the caller's own.
"""
from __future__ import annotations

from fastapi import HTTPException, status

# Tables a request may point at, and how to name them in an error.
_LABELS = {
    "roles": "Role",
    "users": "User",
    "crm_pipelines": "Pipeline",
    "crm_stages": "Stage",
    "pos_suppliers": "Supplier",
    "hrms_employees": "Employee",
    "contacts": "Contact",
    "teams": "Team",
}


async def ensure_visible(conn, table: str, ref_id) -> None:
    """404 unless `ref_id` is a row of `table` this tenant can see."""
    label = _LABELS[table]  # KeyError on an unlisted table: never interpolate input
    if ref_id is None:
        return
    if await conn.fetchval(f"select 1 from {table} where id = $1", ref_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{label} not found")
