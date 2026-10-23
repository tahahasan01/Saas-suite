"""Saved payroll runs and the employee's own stored payslips (D-40).

Runs need `payroll.run.*` keys with HRMS switched on. `/me/payslips` is
scoped by structure like the rest of /me: it resolves the caller to their own
employee record and only ever reads that employee's payslips from approved,
paid or locked runs — it no longer computes the whole tenant (St03 §4).
"""
from __future__ import annotations

import asyncio
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status

from .. import audit, db, email, jobs, payroll, payroll_access, payroll_reports, payroll_runs, payslip_pdf, refs
from .. import payroll_engine as eng
from ..deps import AuthContext, current_auth, current_employee
from ..payroll_models import (
    LineOut,
    PayslipDetail,
    PayslipLink,
    PayslipSendIn,
    PayslipSendOut,
    PayslipSummary,
    RecomputeCreate,
    RunAction,
    RunCreate,
    RunDetail,
    RunEventOut,
    RunOut,
)
from ..rbac import require_key
from ..security import hash_token
from .payroll import uuid_or_404

router = APIRouter(prefix="/payroll", tags=["payroll"])
portal = APIRouter(prefix="/me", tags=["portal"])
public = APIRouter(prefix="/payslips", tags=["portal"])   # signed-link downloads, no session


def run_out(r: Any) -> RunOut:
    return RunOut(
        id=str(r["id"]), number=r["number"], kind=r["kind"], purpose=r["purpose"], period_start=r["period_start"],
        period_end=r["period_end"], pay_date=r["pay_date"], tax_year=r["tax_year"], status=r["status"],
        progress_done=r["progress_done"], progress_total=r["progress_total"], totals=r["totals"] or {},
        error=r["error"], note=r["note"], cancel_reason=r["cancel_reason"],
        adjusts_run_id=str(r["adjusts_run_id"]) if r["adjusts_run_id"] else None, created_at=r["created_at"],
        calculated_at=r["calculated_at"], approved_at=r["approved_at"], paid_at=r["paid_at"],
        locked_at=r["locked_at"])


def summary(p: Any) -> PayslipSummary:
    return PayslipSummary(
        id=str(p["id"]), employee_id=str(p["employee_id"]), name=p["snapshot"].get("name", ""),
        gross_minor=p["gross_minor"], deductions_minor=p["deductions_minor"], tax_minor=p["tax_minor"],
        net_minor=p["net_minor"], employer_cost_minor=p["employer_cost_minor"], tax_verified=p["tax_verified"],
        statutory_verified=p["statutory_verified"], warnings=p["warnings"] or [], error=p["error"])


async def detail(conn: Any, payslip: Any, run: Any, *, reveal: bool) -> PayslipDetail:
    lines = await conn.fetch("select * from payslip_lines where payslip_id = $1 order by sort", payslip["id"])
    p = payslip
    return PayslipDetail(
        **summary(p).model_dump(), run_id=str(run["id"]), run_number=run["number"], run_kind=run["kind"],
        run_status=run["status"], period_start=run["period_start"], period_end=run["period_end"],
        pay_date=run["pay_date"], tax_year=p["tax_year"],
        snapshot=payroll_access.snapshot_view(p["snapshot"], reveal=reveal),
        period_days=p["period_days"], employed_days=p["employed_days"], working_days=p["working_days"],
        present_days=p["present_days"], paid_leave_days=p["paid_leave_days"],
        unpaid_leave_days=p["unpaid_leave_days"], wfh_days=p["wfh_days"], absent_days=p["absent_days"],
        half_days=p["half_days"], taxable_minor=p["taxable_minor"], taxable_ytd_minor=p["taxable_ytd_minor"],
        tax_ytd_minor=p["tax_ytd_minor"], projected_annual_taxable_minor=p["projected_annual_taxable_minor"],
        annual_tax_minor=p["annual_tax_minor"], notes=p["notes"] or [],
        lines=[LineOut(code=ln["code"], name=ln["name"], kind=ln["kind"], amount_minor=ln["amount_minor"],
                       taxable=ln["taxable"], explain=ln["explain"]) for ln in lines])


async def run_unverified(conn: Any, run_id: Any) -> list[str]:
    rows = await conn.fetch(
        """select distinct on (code, explain->>'scheme') code, explain from payslip_lines
            where run_id = $1 and (code = 'INCOME_TAX' or explain ? 'scheme')""", run_id)
    return eng.unverified_items([(r["code"], r["explain"]) for r in rows])


# ── Runs ────────────────────────────────────────────────────────────────────
@router.get("/runs", response_model=list[RunOut])
async def list_runs(auth: AuthContext = Depends(require_key("payroll.run.read", "hrms"))) -> list[RunOut]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = await conn.fetch("select * from payroll_runs order by period_start desc, created_at desc limit 120")
    return [run_out(r) for r in rows]


@router.post("/runs", response_model=RunOut, status_code=status.HTTP_201_CREATED)
async def create_run(body: RunCreate, auth: AuthContext = Depends(require_key("payroll.run.create", "hrms"))
                     ) -> RunOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return run_out(await payroll_runs.create_run(conn, auth.tenant_id, auth.user_id, body))


@router.post("/runs/recompute-tax-year", response_model=RunOut, status_code=status.HTTP_201_CREATED)
async def create_recompute(body: RecomputeCreate,
                           auth: AuthContext = Depends(require_key("payroll.run.create", "hrms"))) -> RunOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return run_out(await payroll_runs.create_recompute(conn, auth.tenant_id, auth.user_id, body))


@router.get("/runs/{run_id}", response_model=RunDetail)
async def get_run(run_id: str, auth: AuthContext = Depends(require_key("payroll.run.read", "hrms"))) -> RunDetail:
    async with db.tenant_conn(auth.tenant_id) as conn:
        run = await payroll_runs.get_run(conn, run_id)
        slips = await conn.fetch("select * from payslips where run_id = $1 order by snapshot->>'name', employee_id",
                                 run["id"])
        events = await conn.fetch(
            """select e.*, u.name as actor_name from payroll_run_events e left join users u on u.id = e.actor_id
                where e.run_id = $1 order by e.at, e.id""", run["id"])
        unverified = await run_unverified(conn, run["id"])
    return RunDetail(
        **run_out(run).model_dump(), payslips=[summary(p) for p in slips],
        events=[RunEventOut(from_status=e["from_status"], to_status=e["to_status"], actor_name=e["actor_name"],
                            note=e["note"], at=e["at"]) for e in events],
        rates_verified=not unverified, unverified=unverified)


@router.get("/runs/{run_id}/payslips/{payslip_id}", response_model=PayslipDetail)
async def get_payslip(run_id: str, payslip_id: str,
                      auth: AuthContext = Depends(require_key("payroll.run.read", "hrms"))) -> PayslipDetail:
    async with db.tenant_conn(auth.tenant_id) as conn:
        run = await payroll_runs.get_run(conn, run_id)
        p = await conn.fetchrow("select * from payslips where id = $1 and run_id = $2",
                                uuid_or_404(payslip_id, "Payslip"), run["id"])
        if p is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Payslip not found")
        return await detail(conn, p, run, reveal=await payroll_access.sees_pay(conn, auth.role_id))


@router.post("/runs/{run_id}/calculate", response_model=RunOut, status_code=status.HTTP_202_ACCEPTED)
async def calculate(run_id: str, auth: AuthContext = Depends(require_key("payroll.run.calculate", "hrms"))
                    ) -> RunOut:
    """Queues the calculation for the worker (batches of 100) and answers at
    once; poll the run for progress."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        run = await payroll_runs.start_calculation(conn, run_id, auth.user_id)
    await jobs.trigger("payroll.calculate")
    return run_out(run)


@router.post("/runs/{run_id}/approve", response_model=RunOut)
async def approve(run_id: str, body: RunAction | None = None,
                  auth: AuthContext = Depends(require_key("payroll.run.approve", "hrms"))) -> RunOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return run_out(await payroll_runs.approve(conn, run_id, auth.user_id, body.note if body else ""))


@router.post("/runs/{run_id}/reopen", response_model=RunOut)
async def reopen(run_id: str, body: RunAction,
                 auth: AuthContext = Depends(require_key("payroll.run.reopen", "hrms"))) -> RunOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return run_out(await payroll_runs.reopen(conn, run_id, auth.user_id, body.note))


@router.post("/runs/{run_id}/payslips/send", response_model=PayslipSendOut, status_code=status.HTTP_202_ACCEPTED)
async def send_payslips(run_id: str, body: PayslipSendIn,
                        auth: AuthContext = Depends(require_key("payroll.run.pay", "hrms"))) -> PayslipSendOut:
    """Email each payslip of a final run to the employee's email on file
    (0111), through the outbox. Sent once unless `again`; no email, skipped."""
    async with db.tenant_conn(auth.tenant_id) as conn, conn.transaction():
        run = await payroll_runs.get_run(conn, run_id)
        for eid in body.employee_ids or []:          # ids are proven before anything else
            await refs.ensure_visible(conn, "hrms_employees", eid)
        if run["status"] not in payroll_runs.FINAL:
            raise HTTPException(status.HTTP_409_CONFLICT, "Approve the run before sending payslips")
        only = [str(i) for i in body.employee_ids] if body.employee_ids is not None else None
        slips = await conn.fetch(
            """select p.id, p.employee_id, btrim(e.email) as email,
                      exists (select 1 from pay_payslip_sends s where s.payslip_id = p.id) as sent
                 from payslips p join hrms_employees e on e.id = p.employee_id
                where p.run_id = $1 and ($2::uuid[] is null or p.employee_id = any($2::uuid[]))
                order by e.name""", run["id"], only)
        out = PayslipSendOut()
        for s in slips:
            if not s["email"]:
                out.no_email += 1
            elif s["sent"] and not body.again:
                out.already_sent += 1
            else:
                oid = await email.queue_payslip(conn, auth.tenant_id, s["email"], str(s["id"]))
                await conn.execute(
                    """insert into pay_payslip_sends (tenant_id, payslip_id, run_id, employee_id, email, outbox_id,
                                                      sent_by)
                       values ($1, $2, $3, $4, $5, $6, $7)""",
                    auth.tenant_id, s["id"], run["id"], s["employee_id"], s["email"], oid, auth.user_id)
                out.queued += 1
        await audit.event(conn, "payroll.payslips_sent", "payroll_runs", str(run["id"]),
                          data={"queued": out.queued, "again": body.again})
    return out


@router.post("/runs/{run_id}/mark-paid", response_model=RunOut)
async def mark_paid(run_id: str, body: RunAction | None = None,
                    auth: AuthContext = Depends(require_key("payroll.run.pay", "hrms"))) -> RunOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return run_out(await payroll_runs.mark_paid(conn, run_id, auth.user_id, body.note if body else ""))


@router.post("/runs/{run_id}/lock", response_model=RunOut)
async def lock(run_id: str, body: RunAction | None = None,
               auth: AuthContext = Depends(require_key("payroll.run.lock", "hrms"))) -> RunOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return run_out(await payroll_runs.lock(conn, run_id, auth.user_id, body.note if body else ""))


@router.post("/runs/{run_id}/cancel", response_model=RunOut)
async def cancel(run_id: str, body: RunAction | None = None,
                 auth: AuthContext = Depends(require_key("payroll.run.cancel", "hrms"))) -> RunOut:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return run_out(await payroll_runs.cancel(conn, run_id, auth.user_id, body.note if body else ""))


# ── The employee's own payslips ─────────────────────────────────────────────
MY_PAYSLIPS = """
select p.*, r.id as r_id from payslips p join payroll_runs r on r.id = p.run_id
 where p.employee_id = $1 and r.status = any($2::text[])"""


@portal.get("/payslips", response_model=list[PayslipDetail])
async def my_payslips(month: str | None = None, auth: AuthContext = Depends(current_auth),
                      employee_id: str = Depends(current_employee)) -> list[PayslipDetail]:
    """Stored payslips of approved, paid or locked runs — newest first, or
    one month's (regular and any adjustments) with `month=YYYY-MM`."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        args: list[Any] = [uuid_or_404(employee_id, "Employee"), list(payroll_runs.FINAL)]
        sql = MY_PAYSLIPS
        if month:
            if not _is_month(month):
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "month must be YYYY-MM")
            sql += " and r.period_start = $3"
            args.append(eng.month_bounds(month)[0])
        rows = await conn.fetch(sql + " order by r.period_start desc, r.created_at desc limit 36", *args)
        out = []
        for p in rows:
            run = await conn.fetchrow("select * from payroll_runs where id = $1", p["r_id"])
            out.append(await detail(conn, p, run, reveal=True))
    return out


LINK_TTL = timedelta(minutes=5)


async def pdf_bytes(conn: Any, p: Any, run: Any, *, reveal: bool) -> bytes:
    """Render a stored payslip (its frozen lines, never a recalculation)."""
    company = await conn.fetchrow(
        """select t.name, coalesce(f.seller_ntn_cnic, '') as ntn from tenants t
             left join fbr_settings f on f.tenant_id = t.id where t.id = $1""", p["tenant_id"])
    lines = await conn.fetch("select code, name, kind, amount_minor, explain from payslip_lines "
                             "where payslip_id = $1 order by sort", p["id"])
    unverified = eng.unverified_items([(ln["code"], ln["explain"]) for ln in lines])
    payload = {
        "company": company["name"], "company_ntn": company["ntn"], "run_number": run["number"],
        "period": f"{run['period_start']:%B %Y}", "pay_date": f"{run['pay_date']:%d %b %Y}", "tax_year": p["tax_year"],
        "rates_verified": not unverified, "snapshot": payroll_access.snapshot_view(p["snapshot"], reveal=reveal),
        "employed_days": p["employed_days"],
        "period_days": p["period_days"], "absent_days": p["absent_days"], "unpaid_leave_days": p["unpaid_leave_days"],
        "gross_minor": p["gross_minor"], "deductions_minor": p["deductions_minor"], "net_minor": p["net_minor"],
        "employer_cost_minor": p["employer_cost_minor"], "taxable_ytd_minor": p["taxable_ytd_minor"],
        "tax_ytd_minor": p["tax_ytd_minor"], "warnings": p["warnings"] or [],
        "lines": [dict(ln) for ln in lines]}
    return await asyncio.to_thread(payslip_pdf.render, payload)


def pdf_response(content: bytes, run: Any, p: Any) -> Response:
    name = f"payslip-{run['period_start']:%Y-%m}-{str(p['employee_id'])[:8]}.pdf"
    return Response(content, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store, private"})


@router.get("/runs/{run_id}/payslips/{payslip_id}/pdf")
async def payslip_pdf_admin(run_id: str, payslip_id: str,
                            auth: AuthContext = Depends(require_key("payroll.run.read", "hrms"))) -> Response:
    async with db.tenant_conn(auth.tenant_id) as conn:
        run = await payroll_runs.get_run(conn, run_id)
        p = await conn.fetchrow("select * from payslips where id = $1 and run_id = $2",
                                uuid_or_404(payslip_id, "Payslip"), run["id"])
        if p is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Payslip not found")
        content = await pdf_bytes(conn, p, run, reveal=await payroll_access.sees_pay(conn, auth.role_id))
    return pdf_response(content, run, p)


@portal.post("/payslips/{payslip_id}/link", response_model=PayslipLink)
async def my_payslip_link(payslip_id: str, auth: AuthContext = Depends(current_auth),
                          employee_id: str = Depends(current_employee)) -> PayslipLink:
    """A 5-minute download link for one of the caller's own final payslips
    (St03 risk 14: a signed short-lived link, not a CNIC-derived password)."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        p = await conn.fetchrow(MY_PAYSLIPS + " and p.id = $3", uuid_or_404(employee_id, "Employee"),
                                list(payroll_runs.FINAL), uuid_or_404(payslip_id, "Payslip"))
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payslip not found")
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + LINK_TTL
    async with db.owner_conn() as oc:
        await oc.execute("delete from payslip_links where expires_at < now() - interval '1 day'")
        await oc.execute(
            """insert into payslip_links (token_hash, tenant_id, payslip_id, user_id, expires_at)
               values ($1, $2, $3, $4, $5)""",
            hash_token(token), p["tenant_id"], p["id"], uuid_or_404(auth.user_id, "User"), expires)
    return PayslipLink(url=f"/payslips/download?token={token}", expires_at=expires)


@public.get("/download")
async def download_payslip(token: str = "") -> Response:
    """No session needed: the unexpired token is the credential."""
    async with db.owner_conn() as oc:
        link = await oc.fetchrow("select tenant_id, payslip_id from payslip_links "
                                 "where token_hash = $1 and expires_at > now()", hash_token(token))
    if link is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This download link has expired. Open your payslips again.")
    async with db.tenant_conn(str(link["tenant_id"])) as conn:
        p = await conn.fetchrow("select * from payslips where id = $1", link["payslip_id"])
        run = await conn.fetchrow("select * from payroll_runs where id = $1", p["run_id"])
        content = await pdf_bytes(conn, p, run, reveal=True)   # the employee's own payslip
    return pdf_response(content, run, p)


# ── Exports (we export; we never file) ──────────────────────────────────────
EXPORT = require_key("payroll.report.export", "hrms")


async def _final_run(conn: Any, run_id: str) -> Any:
    run = await payroll_runs.get_run(conn, run_id)
    if run["status"] not in payroll_runs.FINAL:
        raise HTTPException(status.HTTP_409_CONFLICT, "Exports come from an approved run. Approve it first.")
    return run


def _csv(body: str, name: str) -> Response:
    return Response(body, media_type="text/csv", headers={
        "Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store, private"})


async def _export(run_id: str, auth: AuthContext, kind: str, build: Any) -> Response:
    async with db.tenant_conn(auth.tenant_id) as conn:
        run = await _final_run(conn, run_id)
        reveal = await payroll_access.sees_pay(conn, auth.role_id)
        body = await build(conn, run, reveal)
        # St03 §7.10: every export of pay data is audited.
        await audit.event(conn, "payroll.export", "payroll_runs", str(run["id"]), data={"kind": kind, "masked": not reveal})
    return _csv(body, f"{kind}-{run['period_start']:%Y-%m}.csv")


@router.get("/runs/{run_id}/exports/wht.csv")
async def export_wht(run_id: str, auth: AuthContext = Depends(EXPORT)) -> Response:
    return await _export(run_id, auth, "wht", lambda c, r, rv: payroll_reports.wht(c, r, reveal=rv))


@router.get("/runs/{run_id}/exports/eobi.csv")
async def export_eobi(run_id: str, auth: AuthContext = Depends(EXPORT)) -> Response:
    return await _export(run_id, auth, "eobi",
                         lambda c, r, rv: payroll_reports.contributions(c, r, "EOBI", reveal=rv))


@router.get("/runs/{run_id}/exports/social-security.csv")
async def export_social_security(run_id: str, scheme: str = "PESSI", auth: AuthContext = Depends(EXPORT)) -> Response:
    if scheme not in ("PESSI", "SESSI"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "scheme must be PESSI or SESSI")
    return await _export(run_id, auth, scheme.lower(),
                         lambda c, r, rv: payroll_reports.contributions(c, r, scheme, reveal=rv))


@router.get("/runs/{run_id}/exports/bank.csv")
async def export_bank(run_id: str, auth: AuthContext = Depends(EXPORT)) -> Response:
    return await _export(run_id, auth, "bank", lambda c, r, rv: payroll_reports.bank_file(c, r, reveal=rv))


@router.get("/runs/{run_id}/exports/bank-check")
async def bank_check(run_id: str, auth: AuthContext = Depends(EXPORT)) -> dict[str, Any]:
    """Before downloading the bank file: who it pays, who it can't, and why."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        run = await _final_run(conn, run_id)
        checked = await payroll_reports.bank_check(conn, run, reveal=False)
    return {"ready": len(checked["ready_slips"]), "problems": checked["problems"], "cash": checked["cash"],
            "total_minor": sum(p["net_minor"] for p, _ in checked["ready_slips"])}


async def _certificate(conn: Any, auth: AuthContext, employee_id: str, tax_year: str) -> dict[str, Any]:
    if not any(t.label == tax_year for t in payroll.TAX_YEARS):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"No tax table for {tax_year}")
    cert = await payroll_reports.salary_certificate(conn, uuid_or_404(employee_id, "Employee"), tax_year,
                                                    reveal=await payroll_access.sees_pay(conn, auth.role_id))
    if cert is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No approved payslips for this employee in that tax year")
    await audit.event(conn, "payroll.export", "hrms_employees", employee_id, data={"kind": "salary_certificate"})
    return cert


@router.get("/reports/salary-certificate.json")
async def salary_certificate_data(employee_id: str, tax_year: str, auth: AuthContext = Depends(EXPORT)
                                  ) -> dict[str, Any]:
    async with db.tenant_conn(auth.tenant_id) as conn:
        return await _certificate(conn, auth, employee_id, tax_year)


@router.get("/reports/salary-certificate")
async def salary_certificate_pdf(employee_id: str, tax_year: str, auth: AuthContext = Depends(EXPORT)) -> Response:
    async with db.tenant_conn(auth.tenant_id) as conn:
        cert = await _certificate(conn, auth, employee_id, tax_year)
        company = await conn.fetchrow(
            """select t.name, coalesce(f.seller_ntn_cnic, '') as ntn from tenants t
                 left join fbr_settings f on f.tenant_id = t.id where t.id = $1""", uuid_or_404(auth.tenant_id, "Tenant"))
    content = await asyncio.to_thread(payslip_pdf.render_certificate, cert, company["name"], company["ntn"])
    return Response(content, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="salary-certificate-{tax_year}.pdf"',
        "Cache-Control": "no-store, private"})


def _is_month(value: str) -> bool:
    try:
        eng.month_bounds(value)
    except ValueError:
        return False
    return True
