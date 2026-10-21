"""Payroll (Phase 3, 3F): compensation history and payroll identity.

Payroll is its own grant (D-42): every route needs a `payroll.*` key and the
HRMS module switched on (`require_key(..., "hrms")`). The one exception is
reading an employee's payroll details, which HR may do masked.
"""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from .. import audit, db, iban
from ..deps import AuthContext
from ..payroll_access import mask_iban, mask_tail, sees_pay
from ..payroll_models import CompensationCreate, CompensationOut, PayrollDetailsOut, PayrollDetailsUpdate
from ..payroll_province import resolve_work_provinces
from ..rbac import holds, perm, require_key

router = APIRouter(prefix="/payroll", tags=["payroll"])


def uuid_or_404(value: str, what: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


async def _employee(conn: Any, employee_id: str) -> Any:
    row = await conn.fetchrow("select * from hrms_employees where id = $1",
                              uuid_or_404(employee_id, "Employee"))
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
    return row


# ── Compensation (D-42) ─────────────────────────────────────────────────────
_COMP_SELECT = """
select c.id, c.employee_id, c.effective_from, c.base_minor, c.reason, c.note, c.created_at, c.structure_id,
       s.name as structure_name
  from hrms_compensation c left join pay_structures s on s.id = c.structure_id"""


def _comp(r: Any) -> CompensationOut:
    return CompensationOut(
        id=str(r["id"]), employee_id=str(r["employee_id"]), effective_from=r["effective_from"],
        base_minor=r["base_minor"], reason=r["reason"], note=r["note"], created_at=r["created_at"],
        structure_id=str(r["structure_id"]) if r["structure_id"] else None, structure_name=r["structure_name"])


@router.get("/employees/{employee_id}/compensation", response_model=list[CompensationOut])
async def list_compensation(employee_id: str,
                            auth: AuthContext = Depends(require_key("payroll.salary.read", "hrms"))
                            ) -> list[CompensationOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        emp = await _employee(conn, employee_id)
        rows = await conn.fetch(_COMP_SELECT + " where c.employee_id = $1 order by c.effective_from desc, c.seq desc",
                                emp["id"])
    return [_comp(r) for r in rows]


@router.post("/employees/{employee_id}/compensation", response_model=CompensationOut,
             status_code=status.HTTP_201_CREATED)
async def add_compensation(employee_id: str, body: CompensationCreate,
                           auth: AuthContext = Depends(require_key("payroll.salary.update", "hrms"))
                           ) -> CompensationOut:
    """A raise, promotion or correction is a new dated row; history is never
    rewritten, so a locked payslip can't move (D-40, D-42)."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        emp = await _employee(conn, employee_id)
        structure = None
        if body.structure_id:
            structure = await conn.fetchval("select id from pay_structures where id = $1 and active",
                                            uuid_or_404(body.structure_id, "Structure"))
            if structure is None:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That pay structure doesn't exist")
        row = await conn.fetchrow(
            """insert into hrms_compensation (tenant_id, employee_id, effective_from, base_minor, reason, note,
                                              structure_id, created_by)
               values ($1, $2, $3, $4, $5, $6, $7, $8) returning id""",
            auth.tenant_id, emp["id"], body.effective_from, body.base_minor, body.reason, body.note, structure,
            auth.user_id)
        row = await conn.fetchrow(_COMP_SELECT + " where c.id = $1", row["id"])
    return _comp(row)


# ── Payroll identity ────────────────────────────────────────────────────────
def _details(r: Any, *, reveal: bool, base: int | None, province: tuple[str | None, str]) -> PayrollDetailsOut:
    return PayrollDetailsOut(
        employee_id=str(r["id"]), bank_name=r["bank_name"],
        iban=r["iban"] if reveal else mask_iban(r["iban"]),
        iban_valid=iban.problem(r["iban"]) is None,
        ntn=r["ntn"] if reveal else mask_tail(r["ntn"]),
        eobi_number=r["eobi_number"] if reveal else mask_tail(r["eobi_number"]),
        ss_number=r["ss_number"] if reveal else mask_tail(r["ss_number"]),
        payment_mode=r["payment_mode"], eobi_applicable=r["eobi_applicable"], ss_applicable=r["ss_applicable"],
        statutory_note=r["statutory_note"], masked=not reveal,
        current_base_minor=base if reveal else None,
        work_province=province[0], work_province_source=province[1])


async def _details_for(conn: Any, row: Any, role_id: str | None) -> PayrollDetailsOut:
    reveal = await sees_pay(conn, role_id)
    base = await conn.fetchval("select hrms_base_on($1, current_date)", row["id"]) if reveal else None
    province = (await resolve_work_provinces(conn, [str(row["id"])]))[str(row["id"])]
    return _details(row, reveal=reveal, base=base, province=province)


@router.get("/employees/{employee_id}/details", response_model=PayrollDetailsOut)
async def get_details(employee_id: str, auth: AuthContext = Depends(perm("hrms.employee.read"))
                      ) -> PayrollDetailsOut:
    """For the employee profile's payroll card. HR sees it masked; payroll
    readers see the real values."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await _employee(conn, employee_id)
        return await _details_for(conn, row, auth.role_id)


@router.put("/employees/{employee_id}/details", response_model=PayrollDetailsOut)
async def update_details(employee_id: str, body: PayrollDetailsUpdate,
                         auth: AuthContext = Depends(perm("hrms.employee.read"))) -> PayrollDetailsOut:
    fields: dict[str, Any] = body.model_dump(exclude_unset=True, exclude={"eobi_auto", "ss_auto"})
    if "iban" in fields:
        try:
            fields["iban"] = iban.validate(fields["iban"]) if fields["iban"].strip() else ""
        except iban.InvalidIban as e:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                f"That IBAN isn't valid ({e.reason}). A Pakistani IBAN is PK + 22 characters.")
    for flag, col in (("eobi_auto", "eobi_applicable"), ("ss_auto", "ss_applicable")):
        if getattr(body, flag):
            fields[col] = None
    async with db.tenant_conn(auth.tenant_id) as conn:
        if not await holds(conn, auth.role_id, "payroll.salary.update"):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Requires payroll.salary.update")
        row = await _employee(conn, employee_id)
        if fields:
            sets = ", ".join(f"{k} = ${i}" for i, k in enumerate(fields, 2))
            row = await conn.fetchrow(f"update hrms_employees set {sets} where id = $1 returning *",
                                      row["id"], *fields.values())
            await audit.event(conn, "payroll.details_update", "hrms_employees", str(row["id"]),
                              data={"fields": sorted(fields)})
        return await _details_for(conn, row, auth.role_id)
