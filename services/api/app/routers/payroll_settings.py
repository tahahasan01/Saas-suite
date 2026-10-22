"""Payroll set-up: pay components, structures, one-offs, advances and
statutory registrations (St03 §6.5–6.6, D-45).

Components and structures are validated when saved — a formula that doesn't
parse, reads an unknown code or loops is a 422 here, never a failed payroll
run later. Statutory rates themselves are platform data (migrations); a
tenant only registers for a scheme.
"""
from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status

from .. import audit, db
from .. import payroll_engine as eng
from .. import payroll_formula as formula
from ..deps import AuthContext
from ..payroll_models import (
    AdvanceIn,
    AdvanceOut,
    ComponentIn,
    ComponentOut,
    ComponentUpdate,
    MinimumWageOut,
    OneOffIn,
    OneOffOut,
    RegistrationIn,
    StatutoryOut,
    StatutoryRateOut,
    StatutorySchemeOut,
    StructureIn,
    StructureOut,
)
from ..rbac import require_key
from .payroll import uuid_or_404

router = APIRouter(prefix="/payroll", tags=["payroll"])
READ = require_key("payroll.run.read", "hrms")
MANAGE = require_key("payroll.settings.manage", "hrms")
PAY = require_key("payroll.salary.update", "hrms")


def _422(msg: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, msg)


# ── Components ──────────────────────────────────────────────────────────────
def _component(r: Any) -> ComponentOut:
    return ComponentOut(id=str(r["id"]), code=r["code"], name=r["name"], kind=r["kind"], calc=r["calc"],
                        amount_minor=r["amount_minor"], percent=float(r["percent"]) if r["percent"] is not None else None,
                        percent_of=r["percent_of"], formula=r["formula"], taxable=r["taxable"], prorate=r["prorate"],
                        sort=r["sort"], active=r["active"])


def _engine_component(r: Any) -> eng.Component:
    return eng.Component(code=r["code"], name=r["name"], kind=r["kind"], calc=r["calc"], amount_minor=r["amount_minor"],
                         percent=Decimal(str(r["percent"])) if r["percent"] is not None else None,
                         percent_of=r["percent_of"], formula=r["formula"], taxable=r["taxable"], prorate=r["prorate"],
                         sort=r["sort"])


def _check_shape(calc: str, percent: Any, formula_text: str) -> None:
    if calc == "percent" and percent is None:
        raise _422("A percent component needs a percent")
    if calc == "formula":
        try:
            formula.parse(formula_text)
        except formula.FormulaError as e:
            raise _422(f"Formula: {e} (at character {e.position + 1})")


async def _validate_structure(conn: Any, component_ids: list[uuid.UUID]) -> list[str]:
    rows = await conn.fetch("select * from pay_components where id = any($1::uuid[])", component_ids)
    if len(rows) != len(set(component_ids)):
        raise _422("Some components were not found")
    try:
        return eng.structure_order([_engine_component(r) for r in rows])
    except (formula.FormulaError, formula.CycleError) as e:
        raise _422(str(e))


@router.get("/components", response_model=list[ComponentOut])
async def list_components(auth: AuthContext = Depends(READ)) -> list[ComponentOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return [_component(r) for r in await conn.fetch("select * from pay_components order by sort, code")]


@router.post("/components", response_model=ComponentOut, status_code=status.HTTP_201_CREATED)
async def create_component(body: ComponentIn, auth: AuthContext = Depends(MANAGE)) -> ComponentOut:
    _check_shape(body.calc, body.percent, body.formula)
    if body.code in eng.SYSTEM_CODES - {"BASIC"} or body.code in eng.INPUTS:
        raise _422(f"{body.code} is reserved for the system")
    async with db.tenant_conn(auth.tenant_id) as conn:
        try:
            row = await conn.fetchrow(
                """insert into pay_components (tenant_id, code, name, kind, calc, amount_minor, percent, percent_of,
                                               formula, taxable, prorate, sort)
                   values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning *""",
                auth.tenant_id, body.code, body.name, body.kind, body.calc, body.amount_minor, body.percent,
                body.percent_of, body.formula, body.taxable, body.prorate, body.sort)
        except asyncpg.UniqueViolationError:
            raise HTTPException(status.HTTP_409_CONFLICT, f"There is already a component {body.code}")
    return _component(row)


@router.patch("/components/{component_id}", response_model=ComponentOut)
async def update_component(component_id: str, body: ComponentUpdate, auth: AuthContext = Depends(MANAGE)
                           ) -> ComponentOut:
    fields = body.model_dump(exclude_unset=True)
    async with db.tenant_conn(auth.tenant_id) as conn:
        cur = await conn.fetchrow("select * from pay_components where id = $1",
                                  uuid_or_404(component_id, "Component"))
        if cur is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Component not found")
        merged = {**dict(cur), **fields}
        _check_shape(merged["calc"], merged["percent"], merged["formula"])
        if fields:
            sets = ", ".join(f"{k} = ${i}" for i, k in enumerate(fields, 2))
            row = await conn.fetchrow(f"update pay_components set {sets} where id = $1 returning *",
                                      cur["id"], *fields.values())
        else:
            row = cur
        # Every structure using it must still make sense (save-time, not run-time).
        for s in await conn.fetch("select distinct structure_id from pay_structure_lines where component_id = $1",
                                  cur["id"]):
            ids = [r["component_id"] for r in await conn.fetch(
                "select component_id from pay_structure_lines where structure_id = $1", s["structure_id"])]
            await _validate_structure(conn, ids)
    return _component(row)


# ── Structures ──────────────────────────────────────────────────────────────
async def _structure(conn: Any, row: Any) -> StructureOut:
    comps = await conn.fetch(
        """select c.* from pay_structure_lines sl join pay_components c on c.id = sl.component_id
            where sl.structure_id = $1 order by sl.sort""", row["id"])
    try:
        order = eng.structure_order([_engine_component(c) for c in comps])
    except (formula.FormulaError, formula.CycleError):
        order = []
    return StructureOut(id=str(row["id"]), name=row["name"], active=row["active"],
                        components=[_component(c) for c in comps], order=order,
                        pays_salary=eng.pays_salary([_engine_component(c) for c in comps]))


async def _save_lines(conn: Any, tenant_id: str, structure_id: Any, ids: list[uuid.UUID]) -> None:
    await conn.execute("delete from pay_structure_lines where structure_id = $1", structure_id)
    await conn.executemany(
        "insert into pay_structure_lines (tenant_id, structure_id, component_id, sort) values ($1, $2, $3, $4)",
        [(tenant_id, structure_id, cid, i) for i, cid in enumerate(ids)])


def _ids(values: list[str]) -> list[uuid.UUID]:
    try:
        out = [uuid.UUID(v) for v in values]
    except ValueError:
        raise _422("component_ids must be component ids")
    if len(set(out)) != len(out):
        raise _422("A component can be in a structure once")
    return out


@router.get("/structures", response_model=list[StructureOut])
async def list_structures(auth: AuthContext = Depends(READ)) -> list[StructureOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return [await _structure(conn, r) for r in await conn.fetch("select * from pay_structures order by name")]


@router.post("/structures", response_model=StructureOut, status_code=status.HTTP_201_CREATED)
async def create_structure(body: StructureIn, auth: AuthContext = Depends(MANAGE)) -> StructureOut:
    ids = _ids(body.component_ids)
    async with db.tenant_conn(auth.tenant_id) as conn:
        await _validate_structure(conn, ids)
        if await conn.fetchval("select 1 from pay_structures where name = $1", body.name):
            raise HTTPException(status.HTTP_409_CONFLICT, f"There is already a structure called {body.name}")
        row = await conn.fetchrow("insert into pay_structures (tenant_id, name, active) values ($1, $2, $3) returning *",
                                  auth.tenant_id, body.name, body.active)
        await _save_lines(conn, auth.tenant_id, row["id"], ids)
        return await _structure(conn, row)


@router.put("/structures/{structure_id}", response_model=StructureOut)
async def update_structure(structure_id: str, body: StructureIn, auth: AuthContext = Depends(MANAGE)
                           ) -> StructureOut:
    ids = _ids(body.component_ids)
    async with db.tenant_conn(auth.tenant_id) as conn:
        row = await conn.fetchrow("update pay_structures set name = $2, active = $3 where id = $1 returning *",
                                  uuid_or_404(structure_id, "Structure"), body.name, body.active)
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Structure not found")
        await _validate_structure(conn, ids)
        await _save_lines(conn, auth.tenant_id, row["id"], ids)
        return await _structure(conn, row)


# ── One-offs ────────────────────────────────────────────────────────────────
_ONE_OFF = """select o.*, e.name as employee_name from pay_one_offs o join hrms_employees e on e.id = o.employee_id"""


def _one_off(r: Any) -> OneOffOut:
    return OneOffOut(id=str(r["id"]), employee_id=str(r["employee_id"]), employee_name=r["employee_name"],
                     month=f"{r['period']:%Y-%m}", code=r["code"], name=r["name"], kind=r["kind"],
                     amount_minor=r["amount_minor"], taxable=r["taxable"], note=r["note"], status=r["status"],
                     run_id=str(r["run_id"]) if r["run_id"] else None)


async def _employee_uuid(conn: Any, employee_id: str) -> uuid.UUID:
    eid = uuid_or_404(employee_id, "Employee")
    if not await conn.fetchval("select 1 from hrms_employees where id = $1", eid):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
    return eid


@router.get("/one-offs", response_model=list[OneOffOut])
async def list_one_offs(month: str | None = None, employee_id: str | None = None,
                        auth: AuthContext = Depends(READ)) -> list[OneOffOut]:
    try:
        period = eng.month_bounds(month)[0] if month else None
    except ValueError:
        raise _422("month must be YYYY-MM")
    eid = uuid_or_404(employee_id, "Employee") if employee_id else None
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch(_ONE_OFF + """ where ($1::date is null or o.period = $1)
                                                 and ($2::uuid is null or o.employee_id = $2)
                                               order by o.period desc, o.created_at desc limit 500""", period, eid)
    return [_one_off(r) for r in rows]


@router.post("/one-offs", response_model=OneOffOut, status_code=status.HTTP_201_CREATED)
async def create_one_off(body: OneOffIn, auth: AuthContext = Depends(PAY)) -> OneOffOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        eid = await _employee_uuid(conn, body.employee_id)
        row = await conn.fetchrow(
            """insert into pay_one_offs (tenant_id, employee_id, period, code, name, kind, amount_minor, taxable, note,
                                         created_by)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id""",
            auth.tenant_id, eid, eng.month_bounds(body.month)[0], body.code, body.name, body.kind, body.amount_minor,
            body.taxable, body.note, uuid.UUID(auth.user_id))
        return _one_off(await conn.fetchrow(_ONE_OFF + " where o.id = $1", row["id"]))


@router.post("/one-offs/{one_off_id}/void", response_model=OneOffOut)
async def void_one_off(one_off_id: str, auth: AuthContext = Depends(PAY)) -> OneOffOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        oid = uuid_or_404(one_off_id, "One-off")
        row = await conn.fetchrow("update pay_one_offs set status = 'void' where id = $1 and status = 'pending' "
                                  "returning id", oid)
        if row is None:
            if await conn.fetchval("select 1 from pay_one_offs where id = $1", oid):
                raise HTTPException(status.HTTP_409_CONFLICT, "Only a payment that hasn't been paid yet can be voided")
            raise HTTPException(status.HTTP_404_NOT_FOUND, "One-off not found")
        return _one_off(await conn.fetchrow(_ONE_OFF + " where o.id = $1", oid))


# ── Advances ────────────────────────────────────────────────────────────────
_ADVANCE = """
select a.*, e.name as employee_name,
       coalesce((select sum(l.amount_minor) from payslip_lines l join payroll_runs r on r.id = l.run_id
                  where l.ref_id = a.id and l.code = 'ADVANCE' and r.status in ('approved', 'paid', 'locked')), 0)
         as recovered
  from pay_advances a join hrms_employees e on e.id = a.employee_id"""


def _advance(r: Any) -> AdvanceOut:
    recovered = int(r["recovered"])
    return AdvanceOut(id=str(r["id"]), employee_id=str(r["employee_id"]), employee_name=r["employee_name"],
                      principal_minor=r["principal_minor"], installment_minor=r["installment_minor"],
                      recovered_minor=recovered, outstanding_minor=max(0, r["principal_minor"] - recovered),
                      start_month=f"{r['start_period']:%Y-%m}", status=r["status"], note=r["note"])


@router.get("/advances", response_model=list[AdvanceOut])
async def list_advances(auth: AuthContext = Depends(READ)) -> list[AdvanceOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return [_advance(r) for r in await conn.fetch(_ADVANCE + " order by a.created_at desc limit 500")]


@router.post("/advances", response_model=AdvanceOut, status_code=status.HTTP_201_CREATED)
async def create_advance(body: AdvanceIn, auth: AuthContext = Depends(PAY)) -> AdvanceOut:
    if body.installment_minor > body.principal_minor:
        raise _422("The monthly instalment can't be more than the advance")
    async with db.tenant_conn(auth.tenant_id) as conn:
        eid = await _employee_uuid(conn, body.employee_id)
        row = await conn.fetchrow(
            """insert into pay_advances (tenant_id, employee_id, principal_minor, installment_minor, start_period, note,
                                         created_by)
               values ($1, $2, $3, $4, $5, $6, $7) returning id""",
            auth.tenant_id, eid, body.principal_minor, body.installment_minor, eng.month_bounds(body.start_month)[0],
            body.note, uuid.UUID(auth.user_id))
        return _advance(await conn.fetchrow(_ADVANCE + " where a.id = $1", row["id"]))


@router.post("/advances/{advance_id}/void", response_model=AdvanceOut)
async def void_advance(advance_id: str, auth: AuthContext = Depends(PAY)) -> AdvanceOut:
    """Stops further recovery; what was already recovered stays on its payslips."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        aid = uuid_or_404(advance_id, "Advance")
        row = await conn.fetchrow("update pay_advances set status = 'void' where id = $1 and status = 'active' "
                                  "returning id", aid)
        if row is None:
            if await conn.fetchval("select 1 from pay_advances where id = $1", aid):
                raise HTTPException(status.HTTP_409_CONFLICT, "This advance is already closed")
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Advance not found")
        return _advance(await conn.fetchrow(_ADVANCE + " where a.id = $1", aid))


# ── Statutory registrations (D-45) ──────────────────────────────────────────
@router.get("/statutory", response_model=StatutoryOut)
async def get_statutory(auth: AuthContext = Depends(READ)) -> StatutoryOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        schemes = await conn.fetch("select * from statutory_schemes order by available desc, code")
        regs = {r["scheme_code"]: r for r in await conn.fetch("select * from tenant_statutory_registrations")}
        rates = await conn.fetch("select * from statutory_rates order by scheme_code, province nulls first, "
                                 "effective_from desc")
        wages = await conn.fetch("select * from minimum_wages order by province, effective_from desc")
    out = []
    for s in schemes:
        reg = regs.get(s["code"])
        out.append(StatutorySchemeOut(
            code=s["code"], name=s["name"], authority=s["authority"], province=s["province"], available=s["available"],
            enabled=bool(reg and reg["enabled"]), registration_no=reg["registration_no"] if reg else "",
            effective_from=reg["effective_from"] if reg else None,
            rates=[StatutoryRateOut(province=r["province"], effective_from=r["effective_from"], base_kind=r["base_kind"],
                                    base_minor=r["base_minor"], employee_rate=float(r["employee_rate"]),
                                    employer_rate=float(r["employer_rate"]),
                                    coverage_wage_ceiling_minor=r["coverage_wage_ceiling_minor"],
                                    source_ref=r["source_ref"], verified=r["verified"])
                   for r in rates if r["scheme_code"] == s["code"]]))
    mw = [MinimumWageOut(province=w["province"], effective_from=w["effective_from"], monthly_minor=w["monthly_minor"],
                         source_ref=w["source_ref"], verified=w["verified"]) for w in wages]
    in_use = [r for s in out if s.enabled for r in s.rates]
    return StatutoryOut(schemes=out, minimum_wages=mw,
                        rates_verified=all(r.verified for r in in_use) and all(w.verified for w in mw))


@router.put("/statutory/{scheme_code}", response_model=StatutoryOut)
async def register_scheme(scheme_code: str, body: RegistrationIn, auth: AuthContext = Depends(MANAGE)
                          ) -> StatutoryOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        scheme = await conn.fetchrow("select * from statutory_schemes where code = $1", scheme_code)
        if scheme is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown scheme")
        if body.enabled and not scheme["available"]:
            raise _422(f"{scheme['name']} isn't available yet: its rules haven't been researched")
        await conn.execute(
            """insert into tenant_statutory_registrations (tenant_id, scheme_code, registration_no, enabled,
                                                           effective_from)
               values ($1, $2, $3, $4, coalesce($5, '2025-07-01'::date))
               on conflict (tenant_id, scheme_code) do update
                 set registration_no = excluded.registration_no, enabled = excluded.enabled,
                     effective_from = coalesce($5, tenant_statutory_registrations.effective_from), updated_at = now()""",
            auth.tenant_id, scheme_code, body.registration_no, body.enabled, body.effective_from)
        await audit.event(conn, "payroll.statutory_register", "tenant_statutory_registrations", scheme_code,
                          data={"enabled": body.enabled})
    return await get_statutory(auth)
