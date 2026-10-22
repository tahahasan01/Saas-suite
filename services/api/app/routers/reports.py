"""Reports (3G): sales by day, item, cashier and method; stock valuation;
tax summary; attendance; payroll. JSON for the screen, `?format=csv` for a
spreadsheet. Branch isolation comes from RLS (tenant_conn); dates are the
tenant's own (tenant_conn sets TimeZone). Voided sales count nowhere, and
neither do refunds of them."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Literal

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from .. import audit, csv_io, db, payroll_access, sequences
from ..deps import AuthContext
from ..rbac import perm, require_key
from .payroll_runs import _final_run

router = APIRouter(prefix="/reports", tags=["reports"])

Format = Literal["json", "csv"]
MAX_DAYS = 366
_LOCAL_DAY = "(({col}) at time zone current_setting('TimeZone'))::date"

# (key, CSV header, money?) per report: money columns print as rupees.
Columns = list[tuple[str, str, bool]]


def _respond(rows: list[dict[str, Any]], cols: Columns, fmt: Format, name: str, **extra: Any) -> Any:
    if fmt == "json":
        return {"rows": rows, **extra}
    def cell(v: Any, money: bool) -> Any:
        if v is None:
            return ""
        return f"{v / 100:.2f}" if money else v
    body = csv_io.to_csv([h for _, h, _ in cols],
                         [{h: cell(r.get(k), m) for k, h, m in cols} for r in rows])
    return Response(body, media_type="text/csv", headers={
        "Content-Disposition": f'attachment; filename="{name}.csv"', "Cache-Control": "no-store, private"})


async def _range(conn: asyncpg.Connection, start: date | None, end: date | None) -> tuple[date, date]:
    end = end or await sequences.local_date(conn, None)
    start = start or end - timedelta(days=29)
    if start > end:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The start date is after the end date")
    if (end - start).days >= MAX_DAYS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Pick a range of a year or less")
    return start, end


# ── Sales ───────────────────────────────────────────────────────────────────
SalesBy = Literal["day", "item", "cashier", "method"]
_SALE_DAY = _LOCAL_DAY.format(col="s.created_at")

_SALES_SQL: dict[str, str] = {
    "day": f"""
        with s as (select {_SALE_DAY} as d, count(*) as n, sum(s.subtotal_minor) as gross,
                          sum(s.discount_minor) as discount, sum(s.tax_minor) as tax, sum(s.total_minor) as net
                     from pos_sales s where s.status <> 'void' and {_SALE_DAY} between $1 and $2 group by 1),
             r as (select {_LOCAL_DAY.format(col="r.created_at")} as d, count(*) as n, sum(r.refund_minor) as refunds
                     from pos_returns r join pos_sales s on s.id = r.sale_id
                    where s.status <> 'void' and {_LOCAL_DAY.format(col="r.created_at")} between $1 and $2 group by 1)
        select coalesce(s.d, r.d) as date, coalesce(s.n, 0)::int as sales_count,
               coalesce(s.gross, 0)::bigint as gross_minor, coalesce(s.discount, 0)::bigint as discount_minor,
               coalesce(s.tax, 0)::bigint as tax_minor, coalesce(s.net, 0)::bigint as net_minor,
               coalesce(r.n, 0)::int as refunds_count, coalesce(r.refunds, 0)::bigint as refunds_minor,
               (coalesce(s.net, 0) - coalesce(r.refunds, 0))::bigint as after_refunds_minor
          from s full join r on r.d = s.d order by 1 desc""",
    "item": f"""
        select i.product_id, i.name, sum(i.qty)::float as qty,
               sum(coalesce(i.total_minor, i.line_total_minor))::bigint as net_minor,
               sum(coalesce(i.tax_minor, 0))::bigint as tax_minor,
               coalesce(sum((select sum(ri.qty) from pos_return_items ri where ri.sale_item_id = i.id)), 0)::float
                 as returned_qty,
               coalesce(sum((select sum(ri.line_refund_minor) from pos_return_items ri where ri.sale_item_id = i.id)), 0)::bigint
                 as refunds_minor
          from pos_sale_items i join pos_sales s on s.id = i.sale_id
         where s.status <> 'void' and {_SALE_DAY} between $1 and $2
         group by i.product_id, i.name order by net_minor desc""",
    "cashier": f"""
        select coalesce(e.name, u.name, '—') as cashier, count(*)::int as sales_count,
               sum(s.total_minor)::bigint as net_minor, sum(s.discount_minor)::bigint as discount_minor
          from pos_sales s left join hrms_employees e on e.id = s.employee_id left join users u on u.id = s.cashier_id
         where s.status <> 'void' and {_SALE_DAY} between $1 and $2
         group by 1 order by net_minor desc""",
    "method": f"""
        with p as (select p.method, count(distinct p.sale_id) as n, sum(p.amount_minor) as amount
                     from pos_payments p join pos_sales s on s.id = p.sale_id
                    where s.status <> 'void' and {_SALE_DAY} between $1 and $2 group by 1),
             r as (select r.refund_method as method, sum(r.refund_minor) as refunds
                     from pos_returns r join pos_sales s on s.id = r.sale_id
                    where s.status <> 'void' and {_LOCAL_DAY.format(col="r.created_at")} between $1 and $2 group by 1)
        select coalesce(p.method, r.method) as method, coalesce(p.n, 0)::int as sales_count,
               coalesce(p.amount, 0)::bigint as amount_minor, coalesce(r.refunds, 0)::bigint as refunds_minor
          from p full join r on r.method = p.method where coalesce(p.method, r.method) is not null
         order by amount_minor desc""",
}

_SALES_COLS: dict[str, Columns] = {
    "day": [("date", "Date", False), ("sales_count", "Sales", False), ("gross_minor", "Gross (PKR)", True),
            ("discount_minor", "Discounts (PKR)", True), ("tax_minor", "Sales tax (PKR)", True),
            ("net_minor", "Net sales (PKR)", True), ("refunds_count", "Refunds", False),
            ("refunds_minor", "Refunded (PKR)", True), ("after_refunds_minor", "After refunds (PKR)", True)],
    "item": [("name", "Item", False), ("qty", "Qty", False), ("net_minor", "Net sales (PKR)", True),
             ("tax_minor", "Sales tax (PKR)", True), ("returned_qty", "Returned qty", False),
             ("refunds_minor", "Refunded (PKR)", True)],
    "cashier": [("cashier", "Cashier", False), ("sales_count", "Sales", False),
                ("net_minor", "Net sales (PKR)", True), ("discount_minor", "Discounts (PKR)", True)],
    "method": [("method", "Method", False), ("sales_count", "Sales", False),
               ("amount_minor", "Taken (PKR)", True), ("refunds_minor", "Refunded (PKR)", True)],
}


def _num(v: Any) -> Any:
    """Whole quantities print as integers (3, not 3.0)."""
    return int(v) if isinstance(v, float) and v.is_integer() else v


@router.get("/sales")
async def sales(by: SalesBy, start: date | None = Query(None, alias="from"), end: date | None = Query(None, alias="to"),
                fmt: Format = Query("json", alias="format"),
                auth: AuthContext = Depends(perm("pos.report.sales"))) -> Any:
    async with db.tenant_conn(auth.tenant_id) as conn:
        start, end = await _range(conn, start, end)
        rows = [{k: (str(v) if k in ("date", "product_id") and v is not None else _num(v)) for k, v in dict(r).items()}
                for r in await conn.fetch(_SALES_SQL[by], start, end)]
    return _respond(rows, _SALES_COLS[by], fmt, f"sales-by-{by}-{start}-{end}", by=by, start=str(start), end=str(end))


# ── Stock valuation (cost is field-guarded) ─────────────────────────────────
_STOCK_COLS: Columns = [("name", "Product", False), ("sku", "SKU", False), ("category", "Category", False),
                        ("stock_qty", "In stock", False), ("cost_minor", "Unit cost (PKR)", True),
                        ("value_minor", "Value (PKR)", True)]


@router.get("/stock-valuation")
async def stock_valuation(fmt: Format = Query("json", alias="format"),
                          auth: AuthContext = Depends(perm("products.cost.read"))) -> Any:
    async with db.tenant_conn(auth.tenant_id) as conn:
        rows = [dict(r) for r in await conn.fetch(
            """select p.id::text as product_id, p.name, p.sku, coalesce(c.name, p.category) as category,
                      p.stock_qty::float as stock_qty, p.cost_minor,
                      round(greatest(p.stock_qty, 0) * p.cost_minor)::bigint as value_minor
                 from pos_products p left join pos_categories c on c.id = p.category_id
                where p.active and p.track_stock order by value_minor desc, p.name""")]
    for r in rows:
        r["stock_qty"] = _num(r["stock_qty"])
    total = sum(r["value_minor"] for r in rows)
    return _respond(rows, _STOCK_COLS, fmt, "stock-valuation", total_minor=total)


# ── Tax summary ─────────────────────────────────────────────────────────────
_TAX_COLS: Columns = [("source", "Source", False), ("tax_rate", "Rate (%)", False),
                      ("taxable_minor", "Taxable value (PKR)", True), ("tax_minor", "Sales tax (PKR)", True),
                      ("refund_tax_minor", "Tax refunded (PKR)", True)]


@router.get("/tax")
async def tax_summary(start: date | None = Query(None, alias="from"), end: date | None = Query(None, alias="to"),
                      fmt: Format = Query("json", alias="format"),
                      auth: AuthContext = Depends(perm("pos.report.sales"))) -> Any:
    """POS sales by rate from the sale-line snapshots (never the current
    product), plus issued invoices and credit notes."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        start, end = await _range(conn, start, end)
        pos = await conn.fetch(
            f"""select 'pos' as source, coalesce(i.tax_rate, 0)::float as tax_rate,
                       sum(coalesce(i.excl_minor, coalesce(i.total_minor, i.line_total_minor) - coalesce(i.tax_minor, 0)))::bigint
                         as taxable_minor,
                       sum(coalesce(i.tax_minor, 0))::bigint as tax_minor,
                       coalesce(sum((select round(sum(ri.line_refund_minor) * coalesce(i.tax_minor, 0)
                                                  / nullif(coalesce(i.total_minor, i.line_total_minor), 0))
                                       from pos_return_items ri where ri.sale_item_id = i.id)), 0)::bigint
                         as refund_tax_minor
                  from pos_sale_items i join pos_sales s on s.id = i.sale_id
                 where s.status <> 'void' and {_SALE_DAY} between $1 and $2
                 group by 2 order by 2""", start, end)
        invoices = await conn.fetch(
            """select case v.kind when 'credit_note' then 'credit_note' else 'invoice' end as source,
                      coalesce(l.tax_rate_pct, 0)::float as tax_rate,
                      sum(l.net_excl_minor)::bigint as taxable_minor, sum(l.tax_minor)::bigint as tax_minor,
                      0::bigint as refund_tax_minor
                 from invoice_lines l join invoices v on v.id = l.invoice_id
                where v.status in ('issued', 'partially_paid', 'paid') and v.issue_date between $1 and $2
                group by 1, 2 order by 1, 2""", start, end)
    rows = [{**dict(r), "tax_rate": _num(r["tax_rate"])} for r in [*pos, *invoices]]
    return _respond(rows, _TAX_COLS, fmt, f"tax-summary-{start}-{end}", start=str(start), end=str(end))


# ── Attendance ──────────────────────────────────────────────────────────────
_ATT_COLS: Columns = [("name", "Employee", False), ("present", "Present", False), ("late", "Late", False),
                      ("half_day", "Half days", False), ("absent", "Absent", False), ("leave", "Leave", False),
                      ("worked_min", "Minutes worked", False), ("late_min", "Minutes late", False),
                      ("overtime_min", "Overtime minutes", False)]


@router.get("/attendance")
async def attendance(start: date | None = Query(None, alias="from"), end: date | None = Query(None, alias="to"),
                     fmt: Format = Query("json", alias="format"),
                     auth: AuthContext = Depends(perm("hrms.attendance.read"))) -> Any:
    async with db.tenant_conn(auth.tenant_id) as conn:
        start, end = await _range(conn, start, end)
        rows = [{**dict(r), "employee_id": str(r["employee_id"])} for r in await conn.fetch(
            """select e.id as employee_id, e.name,
                      count(*) filter (where a.status = 'present')::int as present,
                      count(*) filter (where a.status = 'late')::int as late,
                      count(*) filter (where a.status = 'half_day')::int as half_day,
                      count(*) filter (where a.status = 'absent')::int as absent,
                      count(*) filter (where a.status = 'leave')::int as leave,
                      coalesce(sum(a.worked_min), 0)::int as worked_min,
                      coalesce(sum(a.late_min), 0)::int as late_min,
                      coalesce(sum(a.overtime_min), 0)::int as overtime_min
                 from hrms_attendance a join hrms_employees e on e.id = a.employee_id
                where a.work_date between $1 and $2
                group by e.id, e.name order by e.name""", start, end)]
    return _respond(rows, _ATT_COLS, fmt, f"attendance-{start}-{end}", start=str(start), end=str(end))


# ── Payroll ─────────────────────────────────────────────────────────────────
_PAY_COLS: Columns = [("name", "Employee", False), ("present_days", "Days present", False),
                      ("gross_minor", "Gross (PKR)", True), ("deductions_minor", "Deductions (PKR)", True),
                      ("tax_minor", "Income tax (PKR)", True), ("net_minor", "Net pay (PKR)", True),
                      ("employer_cost_minor", "Employer cost (PKR)", True)]
_PAY_MONEY = [k for k, _, m in _PAY_COLS if m]


@router.get("/payroll")
async def payroll(run_id: str, fmt: Format = Query("json", alias="format"),
                  auth: AuthContext = Depends(require_key("payroll.report.export", "hrms"))) -> Any:
    """One approved run, a line per employee. Pay is shown only to those who
    may see salaries, and every read is audited like the other exports."""
    async with db.tenant_conn(auth.tenant_id) as conn:
        run = await _final_run(conn, run_id)
        reveal = await payroll_access.sees_pay(conn, auth.role_id)
        rows = [{**dict(r), "employee_id": str(r["employee_id"])} for r in await conn.fetch(
            """select p.employee_id, coalesce(e.name, p.snapshot->>'name', '—') as name, p.present_days::float as present_days,
                      p.gross_minor, p.deductions_minor, p.tax_minor, p.net_minor, p.employer_cost_minor
                 from payslips p left join hrms_employees e on e.id = p.employee_id
                where p.run_id = $1 order by name""", run["id"])]
        await audit.event(conn, "payroll.export", "payroll_runs", str(run["id"]),
                          data={"kind": "payroll-report", "masked": not reveal})
    for r in rows:
        r["present_days"] = _num(r["present_days"])
        if not reveal:
            r.update({k: None for k in _PAY_MONEY})
    total = {"employee_id": None, "name": "Total", "present_days": None,
             **{k: (None if not reveal else sum(r[k] or 0 for r in rows)) for k in _PAY_MONEY}}
    period = f"{run['period_start']:%Y-%m}"
    if fmt == "csv":
        return _respond([*rows, total], _PAY_COLS, fmt, f"payroll-{period}")
    return _respond(rows, _PAY_COLS, fmt, f"payroll-{period}", total=total, masked=not reveal, period=period)
