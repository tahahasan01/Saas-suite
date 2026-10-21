"""Saved payroll runs (D-40, St03 §6.5, gate M6).

    draft → calculating → review → approved → paid → locked
                 ↘ failed ↗        ↘ cancelled (from draft, calculating, failed, review, approved)
                                   approved → review (reopen)

Every transition is one conditional UPDATE (`… where status = any(allowed)`),
so two admins approving at once get one approval and one 409 (QA-H07); the
database enforces the same machine (0070's payroll_run_guard) and refuses any
change to payslips outside `calculating`. Locked runs never change again;
corrections are adjustment runs that pay the difference.

Calculation runs in the worker (job `payroll.calculate`), in batches of 100
employees, each batch its own transaction that reports progress on the run.
It is idempotent: a run is rebuilt from scratch however often it is
calculated, and a worker that dies mid-run leaves it `calculating` for the
next pass to finish (St03 risk 9).
"""
from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from datetime import date
from typing import Any

import asyncpg
from fastapi import HTTPException, status

from . import audit, db, payroll, payroll_data
from . import payroll_engine as eng
from .payroll_models import RecomputeCreate, RunCreate

log = logging.getLogger("payroll")

BATCH = 100
FINAL = payroll_data.FINAL

# to-status → the statuses it may come from (mirrors payroll_run_guard, 0070)
ALLOWED: dict[str, tuple[str, ...]] = {
    "calculating": ("draft", "review", "failed"),
    "approved": ("review",),
    "review": ("approved",),        # reopen
    "paid": ("approved",),
    "locked": ("paid",),
    "cancelled": ("draft", "calculating", "failed", "review", "approved"),
}


def conflict(msg: str) -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, msg)


async def get_run(conn: Any, run_id: str, *, lock: bool = False) -> Any:
    try:
        rid = uuid.UUID(run_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payroll run not found")
    row = await conn.fetchrow("select * from payroll_runs where id = $1" + (" for update" if lock else ""), rid)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payroll run not found")
    return row


async def _employee_ids(conn: Any, ids: list[str] | None) -> list[uuid.UUID] | None:
    if ids is None:
        return None
    try:
        wanted = sorted({uuid.UUID(i) for i in ids})
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "employee_ids must be employee ids")
    found = {r["id"] for r in await conn.fetch("select id from hrms_employees where id = any($1::uuid[])", wanted)}
    if not wanted or found != set(wanted):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Some employees were not found")
    return wanted


# ── Create ──────────────────────────────────────────────────────────────────
async def create_run(conn: Any, tenant_id: str, actor_id: str, body: RunCreate) -> Any:
    first, last = eng.month_bounds(body.month)
    pay_date = body.pay_date or last
    if pay_date < first:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The pay date can't be before the month starts")
    ty = payroll.tax_year_for(pay_date)
    ids = await _employee_ids(conn, body.employee_ids)
    if body.kind == "regular":
        number, purpose = f"PR-{first:%Y-%m}", "payroll"
        adjusts = None
    else:
        adjusts = await conn.fetchval(
            """select id from payroll_runs where kind = 'regular' and period_start = $1
                 and status in ('paid', 'locked')""", first)
        if adjusts is None:
            raise conflict("Corrections are for months already paid. Reopen an approved run instead, "
                           "or run the month first.")
        n = await conn.fetchval("select count(*) from payroll_runs where kind = 'adjustment' and period_start = $1",
                                first)
        number, purpose = f"PR-{first:%Y-%m}-A{n + 1}", "correction"
    try:
        row = await conn.fetchrow(
            """insert into payroll_runs (tenant_id, number, kind, purpose, period_start, period_end, pay_date,
                                         tax_year, adjusts_run_id, employee_ids, note, created_by)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning *""",
            tenant_id, number, body.kind, purpose, first, last, pay_date, ty.label, adjusts, ids, body.note,
            uuid.UUID(actor_id))
    except asyncpg.UniqueViolationError:
        raise conflict(f"There is already a payroll run for {first:%B %Y}. Open it, or cancel it first.")
    await conn.execute(
        """insert into payroll_run_events (tenant_id, run_id, from_status, to_status, actor_id, note)
           values ($1, $2, null, 'draft', $3, $4)""", row["tenant_id"], row["id"], uuid.UUID(actor_id), body.note)
    await audit.event(conn, "payroll.run_create", "payroll_runs", str(row["id"]),
                      data={"number": number, "kind": body.kind})
    return row


async def create_recompute(conn: Any, tenant_id: str, actor_id: str, body: RecomputeCreate) -> Any:
    """The one-time "recompute this tax year" adjustment (St03 risk 2): months
    of the tax year that were paid outside saved runs, under the old slabs,
    are re-taxed under the current table; the difference is a refund or a
    recovery on one payslip per employee."""
    ty = next((t for t in payroll.TAX_YEARS if t.label == body.tax_year), None)
    if ty is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"No tax table for {body.tax_year}")
    first, _ = eng.month_bounds(f"{ty.starts:%Y-%m}")
    _, last = eng.month_bounds(body.through_month)
    if not ty.starts <= last <= ty.ends:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"through_month must be inside {ty.label}")
    pay_date = body.pay_date or await conn.fetchval("select current_date")
    try:
        row = await conn.fetchrow(
            """insert into payroll_runs (tenant_id, number, kind, purpose, period_start, period_end, pay_date,
                                         tax_year, note, created_by, meta)
               values ($1, $2, 'adjustment', 'recompute_tax_year', $3, $4, $5, $6, $7, $8, $9) returning *""",
            tenant_id, f"PR-{ty.label}-RECOMPUTE", first, last, pay_date, ty.label, body.note, uuid.UUID(actor_id),
            {"old_basis": "pre-2025 slabs (5/15/25/30/35%)", "through_month": body.through_month})
    except asyncpg.UniqueViolationError:
        raise conflict(f"{ty.label} has already been recomputed once.")
    await conn.execute(
        """insert into payroll_run_events (tenant_id, run_id, from_status, to_status, actor_id, note)
           values ($1, $2, null, 'draft', $3, $4)""", row["tenant_id"], row["id"], uuid.UUID(actor_id), body.note)
    await audit.event(conn, "payroll.run_create", "payroll_runs", str(row["id"]),
                      data={"number": row["number"], "purpose": "recompute_tax_year"})
    return row


# ── Transitions ─────────────────────────────────────────────────────────────
async def transition(conn: Any, run_id: str, to: str, actor_id: str | None, note: str = "",
                     sets: dict[str, Any] | None = None) -> tuple[Any, Any]:
    """Move a run to `to` if it is in a status that may; else 409. Returns
    (before, after)."""
    before = await get_run(conn, run_id)
    extra = sets or {}
    cols = "".join(f", {k} = ${i}" for i, k in enumerate(extra, 4))
    after = await conn.fetchrow(
        f"update payroll_runs set status = $2{cols} where id = $1 and status = any($3::text[]) returning *",
        before["id"], to, list(ALLOWED[to]), *extra.values())
    if after is None:
        now = await conn.fetchval("select status from payroll_runs where id = $1", before["id"])
        raise conflict(f"This run is {now}; it can't be {_verb(to)}.")
    await conn.execute(
        """insert into payroll_run_events (tenant_id, run_id, from_status, to_status, actor_id, note)
           values ($1, $2, $3, $4, $5, $6)""",
        after["tenant_id"], after["id"], before["status"], to, uuid.UUID(actor_id) if actor_id else None, note)
    await audit.event(conn, f"payroll.run_{_verb(to).replace(' ', '_')}", "payroll_runs", str(after["id"]),
                      changes={"status": [before["status"], to]}, data={"note": note} if note else None)
    return before, after


def _verb(to: str) -> str:
    return {"calculating": "calculated", "approved": "approved", "review": "reopened", "paid": "marked paid",
            "locked": "locked", "cancelled": "cancelled"}.get(to, to)


async def start_calculation(conn: Any, run_id: str, actor_id: str) -> Any:
    _, after = await transition(conn, run_id, "calculating", actor_id, sets={
        "progress_done": 0, "progress_total": 0, "error": ""})
    return after


async def approve(conn: Any, run_id: str, actor_id: str, note: str = "") -> Any:
    run = await get_run(conn, run_id)
    if run["status"] == "review":
        errors = await conn.fetchval("select count(*) from payslips where run_id = $1 and error <> ''", run["id"])
        if errors:
            raise conflict(f"{errors} payslip(s) need attention before this run can be approved.")
    _, after = await transition(conn, run_id, "approved", actor_id, note, sets={
        "approved_by": uuid.UUID(actor_id), "approved_at": await conn.fetchval("select now()")})
    # Inputs freeze with the approval (St03 §6.5): one-offs are paid by this
    # run, the month's attendance is locked, finished advances close.
    refs = [r["ref_id"] for r in await conn.fetch(
        "select distinct ref_id from payslip_lines where run_id = $1 and ref_id is not null and explain ? 'one_off_id'",
        after["id"])]
    if refs:
        applied = await conn.execute(
            "update pay_one_offs set status = 'applied', run_id = $1 where id = any($2::uuid[]) and status = 'pending'",
            after["id"], refs)
        if int(applied.split()[-1]) != len(refs):
            raise conflict("Some one-off payments were already paid by another run. Recalculate this run.")
    if after["kind"] == "regular":
        await conn.execute(
            """update hrms_attendance set locked = true
                where work_date between $2 and $3 and not locked
                  and employee_id in (select employee_id from payslips where run_id = $1)""",
            after["id"], after["period_start"], after["period_end"])
    await conn.execute(
        """update pay_advances a set status = 'closed'
            where a.id in (select ref_id from payslip_lines where run_id = $1 and code = 'ADVANCE')
              and a.principal_minor <= (select coalesce(sum(l.amount_minor), 0) from payslip_lines l
                                          join payroll_runs r on r.id = l.run_id
                                         where l.ref_id = a.id and l.code = 'ADVANCE'
                                           and r.status = any($2::text[]))""",
        after["id"], list(FINAL))
    return after


async def _release_inputs(conn: Any, run: Any) -> None:
    """Undo what approval froze (reopen, or cancelling an approved run)."""
    await conn.execute("update pay_one_offs set status = 'pending', run_id = null where run_id = $1 and status = 'applied'",
                       run["id"])
    if run["kind"] == "regular":
        await conn.execute(
            """update hrms_attendance set locked = false
                where work_date between $2 and $3 and locked
                  and employee_id in (select employee_id from payslips where run_id = $1)""",
            run["id"], run["period_start"], run["period_end"])
    await conn.execute(
        """update pay_advances set status = 'active'
            where status = 'closed' and id in (select ref_id from payslip_lines where run_id = $1 and code = 'ADVANCE')""",
        run["id"])


async def reopen(conn: Any, run_id: str, actor_id: str, note: str) -> Any:
    if not note.strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Say why the run is being reopened")
    _, after = await transition(conn, run_id, "review", actor_id, note, sets={"approved_by": None, "approved_at": None})
    await _release_inputs(conn, after)
    return after


async def mark_paid(conn: Any, run_id: str, actor_id: str, note: str = "") -> Any:
    _, after = await transition(conn, run_id, "paid", actor_id, note, sets={"paid_at": await conn.fetchval("select now()")})
    return after


async def lock(conn: Any, run_id: str, actor_id: str, note: str = "") -> Any:
    _, after = await transition(conn, run_id, "locked", actor_id, note,
                                sets={"locked_at": await conn.fetchval("select now()")})
    return after


async def cancel(conn: Any, run_id: str, actor_id: str, note: str) -> Any:
    run = await get_run(conn, run_id)
    if run["status"] == "approved" and not note.strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Say why an approved run is being cancelled")
    before, after = await transition(conn, run_id, "cancelled", actor_id, note, sets={
        "cancelled_at": await conn.fetchval("select now()"), "cancel_reason": note})
    if before["status"] == "approved":
        await _release_inputs(conn, after)
    return after


# ── Calculation (the worker job) ────────────────────────────────────────────
async def _scope(conn: Any, run: Any) -> list[str]:
    rows = await conn.fetch(
        """select id from hrms_employees where status = 'active' and ($1::uuid[] is null or id = any($1::uuid[]))
            order by name, id""", run["employee_ids"])
    return [str(r["id"]) for r in rows]


async def _paid_lines(conn: Any, period_start: date, ids: list[str]) -> dict[str, list[eng.PaidLine]]:
    out: dict[str, list[eng.PaidLine]] = defaultdict(list)
    for r in await conn.fetch(
            """select l.employee_id, l.code, l.name, l.kind, l.amount_minor, l.taxable
                 from payslip_lines l join payroll_runs r on r.id = l.run_id
                where r.period_start = $1 and r.status = any($2::text[]) and r.purpose <> 'recompute_tax_year'
                  and l.employee_id = any($3::uuid[]) and l.code <> 'ADVANCE'
                order by r.created_at, l.sort""", period_start, list(FINAL), [uuid.UUID(i) for i in ids]):
        out[str(r["employee_id"])].append((r["code"], r["name"], r["kind"], r["amount_minor"], r["taxable"]))
    return out


async def compute_batch(conn: Any, run: Any, ids: list[str]) -> list[tuple[payroll_data.Loaded, eng.PayslipResult]]:
    """The payslips of `ids` for `run`, computed but not stored."""
    if run["purpose"] == "recompute_tax_year":
        return await _recompute_batch(conn, run, ids)
    adjustment = run["kind"] == "adjustment"
    loaded = await payroll_data.load_inputs(
        conn, period_start=run["period_start"], period_end=run["period_end"], pay_date=run["pay_date"],
        employee_ids=ids, current_run_id=str(run["id"]), with_advances=not adjustment,
        include_applied_one_offs=adjustment)
    out = []
    paid = await _paid_lines(conn, run["period_start"], ids) if adjustment else {}
    for ld in loaded:
        res = eng.calculate(ld.input)
        if res.employed_days == 0:
            continue
        if adjustment:
            res = eng.difference(res, paid.get(ld.input.employee_id, []))
            if not res.lines:
                continue
        out.append((ld, res))
    return out


async def _recompute_batch(conn: Any, run: Any, ids: list[str]) -> list[tuple[payroll_data.Loaded, eng.PayslipResult]]:
    """Each month of the tax year through `period_end` that has no saved
    payslip was taxed under the pre-2025 slabs; re-tax it under the current
    table and carry the difference as one INCOME_TAX line."""
    months = payroll_data.month_starts(run["period_start"], run["period_end"])
    per_emp: dict[str, list[tuple[date, int, int, int]]] = defaultdict(list)
    firsts: dict[str, payroll_data.Loaded] = {}
    covered = {(str(r["employee_id"]), r["period_start"]) for r in await conn.fetch(
        """select distinct p.employee_id, r.period_start from payslips p join payroll_runs r on r.id = p.run_id
            where r.status = any($1::text[]) and r.purpose <> 'recompute_tax_year'
              and r.period_start between $2 and $3 and p.employee_id = any($4::uuid[])""",
        list(FINAL), run["period_start"], run["period_end"], [uuid.UUID(i) for i in ids])}
    for m in months:
        _, m_end = eng.month_bounds(f"{m:%Y-%m}")
        for ld in await payroll_data.load_inputs(conn, period_start=m, period_end=m_end, pay_date=m_end,
                                                 employee_ids=ids, with_advances=False):
            eid = ld.input.employee_id
            firsts.setdefault(eid, ld)
            if (eid, m) in covered:
                continue
            res = eng.calculate(ld.input)
            if res.employed_days == 0 or res.error:
                continue
            gross = sum(s.base_minor * s.days for s in ld.input.segments) // max(1, res.employed_days)
            old = payroll.legacy_monthly_tax_minor(gross)
            per_emp[eid].append((m, gross, old, res.tax_minor))
    out = []
    for eid, rows in per_emp.items():
        old_total = sum(r[2] for r in rows)
        new_total = sum(r[3] for r in rows)
        if old_total == new_total:
            continue
        ld = firsts[eid]
        res = eng.PayslipResult(employee_id=eid, name=ld.input.name, lines=[], period_days=0, employed_days=0,
                                attendance=eng.Attendance(), tax_year=run["tax_year"],
                                tax_verified=payroll.tax_year_for(run["period_end"]).verified)
        res.lines.append(eng.Line("INCOME_TAX", "Income tax recomputed for the year", "deduction",
                                  new_total - old_total, recurring=False, explain={
                                      "recompute": True, "verified": res.tax_verified, "tax_year": run["tax_year"],
                                      "old_basis": "pre-2025 slabs", "withheld_minor": old_total,
                                      "correct_minor": new_total,
                                      "months": [{"month": f"{m:%Y-%m}", "salary_minor": g, "withheld_minor": o,
                                                  "correct_minor": n} for m, g, o, n in rows]}))
        res.tax_minor = new_total - old_total
        res.deductions_minor = res.tax_minor
        res.net_minor = -res.tax_minor
        out.append((ld, res))
    return out


async def _store(conn: Any, run: Any, ld: payroll_data.Loaded, res: eng.PayslipResult) -> None:
    a = res.attendance
    pid = await conn.fetchval(
        """insert into payslips (tenant_id, run_id, employee_id, snapshot, period_days, employed_days, working_days,
                                 present_days, paid_leave_days, unpaid_leave_days, wfh_days, absent_days, half_days,
                                 gross_minor, deductions_minor, employer_cost_minor, net_minor, taxable_minor, tax_minor,
                                 taxable_ytd_minor, tax_ytd_minor, projected_annual_taxable_minor, annual_tax_minor,
                                 tax_year, tax_verified, statutory_verified, warnings, notes, error)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
                   $22, $23, $24, $25, $26, $27, $28, $29) returning id""",
        run["tenant_id"], run["id"], uuid.UUID(res.employee_id), ld.snapshot, res.period_days, res.employed_days,
        a.working_days, a.present_days, a.paid_leave_days, a.unpaid_leave_days, a.wfh_days, a.absent_days,
        a.half_days, res.gross_minor, res.deductions_minor, res.employer_cost_minor, res.net_minor, res.taxable_minor,
        res.tax_minor, res.taxable_ytd_minor, res.tax_ytd_minor, res.projected_annual_taxable_minor,
        res.annual_tax_minor, res.tax_year, res.tax_verified, res.statutory_verified, res.warnings, res.notes,
        res.error or "")
    if res.lines:
        await conn.executemany(
            """insert into payslip_lines (tenant_id, payslip_id, run_id, employee_id, code, name, kind, amount_minor,
                                          taxable, recurring, ref_id, sort, explain)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)""",
            [(run["tenant_id"], pid, run["id"], uuid.UUID(res.employee_id), ln.code, ln.name, ln.kind,
              ln.amount_minor, ln.taxable, ln.recurring, _ref(ln), i, ln.explain) for i, ln in enumerate(res.lines)])


def _ref(ln: eng.Line) -> uuid.UUID | None:
    ref = ln.explain.get("one_off_id") or ln.explain.get("advance_id")
    return uuid.UUID(ref) if ref else None


async def calculate_run(tenant_id: str, run_id: str, *, batch_size: int = BATCH, job_run: str | None = None
                        ) -> dict[str, Any]:
    """Rebuild a `calculating` run's payslips, `batch_size` employees per
    transaction, then move it to review (or failed). Safe to call again."""
    async with db.job_conn(tenant_id, "payroll.calculate", job_run) as conn:
        run = await conn.fetchrow("select * from payroll_runs where id = $1 for update", uuid.UUID(run_id))
        if run is None or run["status"] != "calculating":
            return {"skipped": run["status"] if run else "missing"}
        ids = await _scope(conn, run)
        await conn.execute("delete from payslips where run_id = $1 and not (employee_id = any($2::uuid[]))",
                           run["id"], [uuid.UUID(i) for i in ids])
        await conn.execute("update payroll_runs set progress_total = $2, progress_done = 0, error = '' where id = $1",
                           run["id"], len(ids))
    done = 0
    for start in range(0, len(ids), batch_size):
        batch = ids[start:start + batch_size]
        async with db.job_conn(tenant_id, "payroll.calculate", job_run) as conn:
            run = await conn.fetchrow("select * from payroll_runs where id = $1 for update", uuid.UUID(run_id))
            if run is None or run["status"] != "calculating":
                return {"stopped": run["status"] if run else "missing", "done": done}
            results = await compute_batch(conn, run, batch)
            await conn.execute("delete from payslips where run_id = $1 and employee_id = any($2::uuid[])",
                               run["id"], [uuid.UUID(i) for i in batch])
            for ld, res in results:
                await _store(conn, run, ld, res)
            done += len(batch)
            await conn.execute("update payroll_runs set progress_done = $2 where id = $1", run["id"], done)
    async with db.job_conn(tenant_id, "payroll.calculate", job_run) as conn:
        run = await conn.fetchrow("select * from payroll_runs where id = $1 for update", uuid.UUID(run_id))
        if run is None or run["status"] != "calculating":
            return {"stopped": run["status"] if run else "missing", "done": done}
        t = await conn.fetchrow(
            """select count(*) as employees, coalesce(sum(gross_minor), 0) as gross_minor,
                      coalesce(sum(deductions_minor), 0) as deductions_minor, coalesce(sum(net_minor), 0) as net_minor,
                      coalesce(sum(tax_minor), 0) as tax_minor,
                      coalesce(sum(employer_cost_minor), 0) as employer_cost_minor,
                      count(*) filter (where error <> '') as errors
                 from payslips where run_id = $1""", run["id"])
        totals = {k: int(t[k]) for k in t.keys()}
        to = "failed" if totals["errors"] else "review"
        error = f"{totals['errors']} payslip(s) need attention" if totals["errors"] else ""
        await conn.execute(
            """update payroll_runs set status = $2, totals = $3, error = $4, calculated_at = now()
                where id = $1""", run["id"], to, totals, error)
        await conn.execute(
            """insert into payroll_run_events (tenant_id, run_id, from_status, to_status, note)
               values ($1, $2, 'calculating', $3, $4)""", run["tenant_id"], run["id"], to, error)
    return {"run": run_id, "status": to, **totals}


async def run_due_calculations() -> dict[str, Any]:
    """The `payroll.calculate` job: every run waiting in `calculating`."""
    async with db.owner_conn() as oc:
        rows = await oc.fetch(
            "select id, tenant_id from payroll_runs where status = 'calculating' order by updated_at limit 50")
    finished = failed = 0
    for r in rows:
        try:
            await calculate_run(str(r["tenant_id"]), str(r["id"]))
            finished += 1
        except Exception as e:  # noqa: BLE001 — one broken run must not stop the others
            failed += 1
            log.exception("payroll run %s failed to calculate", r["id"])
            async with db.job_conn(str(r["tenant_id"]), "payroll.calculate") as conn:
                await conn.execute(
                    """update payroll_runs set status = 'failed', error = $2
                        where id = $1 and status = 'calculating'""",
                    r["id"], f"Calculation stopped ({type(e).__name__}). Try again; if it repeats, contact support.")
    return {"runs": len(rows), "finished": finished, "failed": failed}
