"""Loads what the payslip calculator needs from the database (St03 §6.5).

`load_inputs()` is the single loader behind the preview, the calculate job
and adjustment runs. Two seams are deliberately ONE function each so
integration can swap them:

* `absence_counts()` — absence derived from evidence (attendance + leave),
  the rules the payroll preview has always used. INTEGRATION: leave v2 (3F
  hrorg) replaces the leave side of this query.
* `payroll_province.resolve_work_provinces()` — the work province.
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from . import attendance, payroll
from . import payroll_engine as eng
from .payroll_province import resolve_work_provinces

FINAL = ("approved", "paid", "locked")   # run statuses whose payslips count as paid

# Absence is derived from evidence, not a status field: a working day with no
# check-in and no approved leave. (Moved here unchanged from routers/hrms.py.)
# $1 = first day of the month, $2 = the tenant's weekly rest days (ISO dow),
# $3 = employee ids (null = every active employee).
# Paid, unpaid and WFH come from the request's leave type (0068: tenants define
# their own types); only a request without a type falls back to the old codes.
_ABSENCE = """
with leave as (
  select l.employee_id, l.from_date, l.to_date,
         coalesce(lt.counts_as = 'wfh', l.request_type = 'wfh') as is_wfh,
         coalesce(lt.paid, l.leave_type <> 'unpaid') as is_paid
    from hrms_leave_requests l left join hrms_leave_types lt on lt.id = l.leave_type_id
   where l.status = 'approved'
),
emp as (
  select e.* from hrms_employees e
   where e.status = 'active' and ($3::uuid[] is null or e.id = any($3::uuid[]))
),
-- Each employee's own working days: the weekly rest days and the holidays
-- that apply to THEM (federal, company, their work location's province; never
-- another province's or an optional day — hrms_employee_holidays, 0067).
working_days as (
  select e.id as employee_id, d::date as day
    from emp e
   cross join generate_series($1::date,
                              ($1::date + interval '1 month' - interval '1 day')::date,
                              interval '1 day') d
   where not (extract(dow from d)::int = any($2::int[]))
     and not exists (select 1 from hrms_employee_holidays(
                       e.id, $1::date, ($1::date + interval '1 month' - interval '1 day')::date) h
                      where h.holiday_date = d::date)
)
select e.id,
       -- Per-day pay divides by the whole month's working days …
       (select count(*) from working_days w where w.employee_id = e.id) as month_days,
       -- … and only *completed* working days can be judged: `< current_date`,
       -- never `<=`, or everyone is absent until they clock in this morning.
       -- The created_at floor matters too — without it a business that signs up
       -- mid-month sees staff docked for days before the system existed.
       (select count(*) from working_days w
         where w.employee_id = e.id and w.day < current_date
           and w.day >= greatest(coalesce(e.join_date, e.created_at::date), e.created_at::date)
           and (e.exit_date is null or w.day <= e.exit_date)      -- a leaver isn't absent after leaving
       ) as elapsed_days,
       -- A check-in is presence unless the shift's thresholds derived the
       -- day as an absence (worked under absent_below_min, 0045).
       (select count(distinct a.work_date) from hrms_attendance a
         where a.employee_id = e.id and a.check_in is not null and a.status <> 'absent'
           and a.work_date in (select day from working_days w where w.employee_id = e.id)) as present_days,
       -- Half days cost half a day, unless approved leave or WFH covers them.
       (select count(distinct a.work_date) from hrms_attendance a
         where a.employee_id = e.id and a.status = 'half_day'
           and a.work_date in (select day from working_days w where w.employee_id = e.id)
           and not exists (select 1 from leave l
                            where l.employee_id = e.id
                              and a.work_date between l.from_date and l.to_date)) as half_days,
       (select count(*) from working_days w
         where w.employee_id = e.id and w.day < current_date
           and exists (select 1 from leave l
                        where l.employee_id = e.id and not l.is_wfh and l.is_paid
                          and w.day between l.from_date and l.to_date)) as paid_leave_days,
       (select count(*) from working_days w
         where w.employee_id = e.id and w.day < current_date
           and exists (select 1 from leave l
                        where l.employee_id = e.id and not l.is_wfh and not l.is_paid
                          and w.day between l.from_date and l.to_date)) as unpaid_leave_days,
       -- Approved WFH is time worked. It counts toward presence and is never
       -- deducted; the `is_wfh` filters above keep it out of leave.
       (select count(*) from working_days w
         where w.employee_id = e.id and w.day < current_date
           and exists (select 1 from leave l
                        where l.employee_id = e.id and l.is_wfh
                          and w.day between l.from_date and l.to_date)) as wfh_days
  from emp e
"""


async def working_days(conn: Any, first: date) -> int:
    """The month's working days for the page headline: the holidays everyone
    gets (federal and company calendars). Each payslip counts its own, with
    the employee's province on top."""
    off = await conn.fetchval("select weekly_off_days from tenants where id = current_setting('app.tenant_id')::uuid")
    return int(await conn.fetchval(
        """select count(*) from generate_series($1::date, ($1::date + interval '1 month' - interval '1 day')::date,
                                                 interval '1 day') d
            where not (extract(dow from d)::int = any($2::int[]))
              and not exists (select 1 from hrms_holidays h join hrms_holiday_calendars c on c.id = h.calendar_id
                               where h.holiday_date = d::date and h.kind <> 'optional'
                                 and c.scope in ('federal', 'company'))""",
        first, list(off or [0])))


async def absence_counts(conn: Any, first: date, employee_ids: list[uuid.UUID] | None) -> dict[str, eng.Attendance]:
    """employee id → the month's attendance counts. THE absence function:
    leave v2 replaces it at integration."""
    off = await conn.fetchval("select weekly_off_days from tenants where id = current_setting('app.tenant_id')::uuid")
    # A day derived while still open (a check-in, no check-out) must be judged
    # as over before it is counted, or a check-in alone earns a full day.
    await attendance.finalise_open_days(conn)
    out: dict[str, eng.Attendance] = {}
    for r in await conn.fetch(_ABSENCE, first, list(off or [0]), employee_ids):
        unpaid, wfh = r["unpaid_leave_days"], r["wfh_days"]
        # Whatever is left once presence, approved leave and remote days are
        # accounted for. A WFH day someone also clocked in for is counted once.
        accounted = min(r["elapsed_days"], r["present_days"] + r["paid_leave_days"] + unpaid + wfh)
        out[str(r["id"])] = eng.Attendance(
            working_days=r["month_days"], present_days=r["present_days"], paid_leave_days=r["paid_leave_days"],
            unpaid_leave_days=unpaid, wfh_days=wfh, absent_days=max(0, r["elapsed_days"] - accounted),
            half_days=r["half_days"])
    return out


# ── Statutory ───────────────────────────────────────────────────────────────
SS_SCHEME = {"PB": "PESSI", "SD": "SESSI", "KP": "KP_ESSI", "BA": "BESSI"}


@dataclass
class StatutoryContext:
    registrations: dict[str, Any]
    rates: list[Any]
    wages: list[Any]
    schemes: dict[str, Any]

    def rate(self, scheme: str, province: str | None, on: date) -> Any | None:
        rows = [r for r in self.rates if r["scheme_code"] == scheme and r["effective_from"] <= on
                and (r["effective_to"] is None or r["effective_to"] >= on)]
        own = [r for r in rows if province and r["province"] == province]
        anywhere = [r for r in rows if r["province"] is None]
        pick = own or anywhere
        return max(pick, key=lambda r: r["effective_from"]) if pick else None

    def min_wage(self, province: str | None, on: date) -> Any | None:
        rows = [w for w in self.wages if w["province"] == province and w["effective_from"] <= on]
        return max(rows, key=lambda w: w["effective_from"]) if rows else None


async def statutory_context(conn: Any) -> StatutoryContext:
    return StatutoryContext(
        registrations={r["scheme_code"]: r for r in await conn.fetch(
            "select * from tenant_statutory_registrations where enabled")},
        rates=list(await conn.fetch("select * from statutory_rates")),
        wages=list(await conn.fetch("select * from minimum_wages")),
        schemes={r["code"]: r for r in await conn.fetch("select * from statutory_schemes")})


def statutory_rules(ctx: StatutoryContext, emp: Any, province: str | None, on: date
                    ) -> tuple[list[eng.StatutoryRule], Any | None]:
    """The schemes that may apply to one employee, and the minimum wage row."""
    wage = ctx.min_wage(province, on)
    rules: list[eng.StatutoryRule] = []
    wanted = [("EOBI", emp["eobi_applicable"])]
    if province in SS_SCHEME:
        wanted.append((SS_SCHEME[province], emp["ss_applicable"]))
    for scheme, override in wanted:
        reg = ctx.registrations.get(scheme)
        info = ctx.schemes.get(scheme)
        if reg is None or info is None or not info["available"] or reg["effective_from"] > on:
            continue
        rate = ctx.rate(scheme, province, on)
        if rate is None:
            continue
        verified = bool(rate["verified"]) and (rate["base_kind"] != "min_wage" or bool(wage and wage["verified"]))
        rules.append(eng.StatutoryRule(
            scheme=scheme, name=info["name"].split(" (")[0], base_kind=rate["base_kind"],
            base_minor=rate["base_minor"], employee_rate=Decimal(rate["employee_rate"]),
            employer_rate=Decimal(rate["employer_rate"]), verified=verified, source_ref=rate["source_ref"],
            coverage_ceiling_minor=rate["coverage_wage_ceiling_minor"], applies=override,
            reason=emp["statutory_note"]))
    return rules, wage


# ── The loader ──────────────────────────────────────────────────────────────
@dataclass
class Loaded:
    input: eng.EmployeeInput
    snapshot: dict[str, Any]
    min_wage_verified: bool = True
    extra_unverified: list[str] = field(default_factory=list)


def _segments(rows: list[Any], start: date, end: date) -> tuple[list[eng.Segment], Any | None]:
    """Days [start, end] split at each salary change. Before the first row the
    first row applies (it is the joining salary), so a business that adds
    staff mid-month without a join date still pays them for the month."""
    if start > end or not rows:
        return [], None
    first_day = [r for r in rows if r["effective_from"] == rows[0]["effective_from"]]

    def in_force(d: date) -> Any:
        current = [r for r in rows if r["effective_from"] <= d]
        return current[-1] if current else first_day[-1]   # rows are by (effective_from, seq)
    cuts = sorted({start, *(r["effective_from"] for r in rows if start < r["effective_from"] <= end)})
    segs: list[eng.Segment] = []
    for i, s in enumerate(cuts):
        e = cuts[i + 1] - timedelta(days=1) if i + 1 < len(cuts) else end
        base = in_force(s)["base_minor"]
        if segs and segs[-1].base_minor == base:
            segs[-1] = eng.Segment(segs[-1].start, e, base)
        else:
            segs.append(eng.Segment(s, e, base))
    return segs, in_force(end)


def month_starts(first: date, until: date) -> list[date]:
    """First days of the months from `first` up to (not including) the month
    `until` falls in — or through it, when `until` is a month's last day."""
    out, d = [], first.replace(day=1)
    while d < until:
        out.append(d)
        d = date(d.year + (d.month == 12), d.month % 12 + 1, 1)
    return out


async def load_inputs(conn: Any, *, period_start: date, period_end: date, pay_date: date,
                      employee_ids: list[str] | None = None, current_run_id: str | None = None,
                      with_advances: bool = True, include_applied_one_offs: bool = False) -> list[Loaded]:
    """One EmployeeInput per active employee (or per `employee_ids`).
    `current_run_id` is the run being calculated: its own payslips never
    count as history. An adjustment run recomputes the month as it should
    have been, so it sees one-offs earlier runs already paid
    (`include_applied_one_offs`) and leaves advances to the regular run."""
    ids = [uuid.UUID(i) for i in employee_ids] if employee_ids is not None else None
    emps = await conn.fetch(
        """select * from hrms_employees where status = 'active' and ($1::uuid[] is null or id = any($1::uuid[]))
              and (exit_date is null or exit_date >= $2)       -- a leaver is paid to their exit month
            order by name, id""", ids, period_start)
    if not emps:
        return []
    emp_ids = [e["id"] for e in emps]
    att = await absence_counts(conn, period_start, emp_ids)
    run_uuid = uuid.UUID(current_run_id) if current_run_id else None

    comp_rows: dict[str, list[Any]] = defaultdict(list)
    for r in await conn.fetch(
            """select employee_id, effective_from, base_minor, structure_id from hrms_compensation
                where employee_id = any($1::uuid[]) order by employee_id, effective_from, seq""", emp_ids):
        comp_rows[str(r["employee_id"])].append(r)

    components: dict[str, list[eng.Component]] = defaultdict(list)
    for r in await conn.fetch(
            """select sl.structure_id, c.* from pay_structure_lines sl
                 join pay_components c on c.id = sl.component_id
                where c.active order by sl.sort, c.sort, c.code"""):
        components[str(r["structure_id"])].append(eng.Component(
            code=r["code"], name=r["name"], kind=r["kind"], calc=r["calc"], amount_minor=r["amount_minor"],
            percent=r["percent"], percent_of=r["percent_of"], formula=r["formula"], taxable=r["taxable"],
            prorate=r["prorate"], sort=len(components[str(r["structure_id"])])))

    one_offs: dict[str, list[eng.OneOff]] = defaultdict(list)
    for r in await conn.fetch(
            """select * from pay_one_offs where employee_id = any($1::uuid[]) and period = $2
                 and (status = 'pending' or (status = 'applied' and (run_id = $3 or $4))) order by created_at""",
            emp_ids, period_start, run_uuid, include_applied_one_offs):
        one_offs[str(r["employee_id"])].append(eng.OneOff(
            id=str(r["id"]), code=r["code"], name=r["name"], kind=r["kind"], amount_minor=r["amount_minor"],
            taxable=r["taxable"]))

    advances: dict[str, list[eng.Advance]] = defaultdict(list)
    if with_advances:
        for r in await conn.fetch(
                """select a.*, a.principal_minor - coalesce((
                          select sum(l.amount_minor) from payslip_lines l join payroll_runs pr on pr.id = l.run_id
                           where l.ref_id = a.id and l.code = 'ADVANCE' and pr.status = any($3::text[])
                             and pr.id is distinct from $4), 0) as outstanding
                     from pay_advances a
                    where a.employee_id = any($1::uuid[]) and a.status = 'active' and a.start_period <= $2
                    order by a.created_at""", emp_ids, period_start, list(FINAL), run_uuid):
            if r["outstanding"] > 0:
                advances[str(r["employee_id"])].append(eng.Advance(
                    id=str(r["id"]), installment_minor=r["installment_minor"], outstanding_minor=int(r["outstanding"])))

    ty = payroll.tax_year_for(pay_date)
    paid_months: dict[str, dict[date, tuple[int, int]]] = defaultdict(dict)
    for r in await conn.fetch(
            """select p.employee_id, r.period_start, sum(p.taxable_minor) as taxable, sum(p.tax_minor) as tax
                 from payslips p join payroll_runs r on r.id = p.run_id
                where p.employee_id = any($1::uuid[]) and r.status = any($2::text[])
                  and r.purpose <> 'recompute_tax_year' and r.id is distinct from $5
                  and r.period_start >= $3 and r.period_start < $4
                group by p.employee_id, r.period_start""",
            emp_ids, list(FINAL), ty.starts, period_start, run_uuid):
        paid_months[str(r["employee_id"])][r["period_start"]] = (int(r["taxable"]), int(r["tax"]))

    provinces = await resolve_work_provinces(conn, [str(i) for i in emp_ids])
    ctx = await statutory_context(conn)
    months_before = month_starts(ty.starts, period_start)

    out: list[Loaded] = []
    for e in emps:
        eid = str(e["id"])
        start = max(period_start, e["join_date"] or period_start)
        leaves = e["exit_date"] if e["exit_date"] and e["exit_date"] <= period_end else None
        segments, row_at_end = _segments(comp_rows.get(eid, []), start, leaves or period_end)
        structure = str(row_at_end["structure_id"]) if row_at_end and row_at_end["structure_id"] else None
        paid = paid_months.get(eid, {})
        assumed = sum(1 for m in months_before
                      if m not in paid and (e["join_date"] is None or e["join_date"] <= _month_end(m)))
        province, source = provinces[eid]
        rules, wage = statutory_rules(ctx, e, province, period_end)
        inp = eng.EmployeeInput(
            employee_id=eid, name=e["name"], period_start=period_start, period_end=period_end, pay_date=pay_date,
            segments=segments, components=components.get(structure, []) if structure else [],
            attendance=att.get(eid, eng.Attendance()),
            tax_history=eng.TaxHistory(taxable_minor=sum(t for t, _ in paid.values()),
                                       tax_minor=sum(x for _, x in paid.values()), months=len(paid),
                                       assumed_months=assumed),
            one_offs=one_offs.get(eid, []), advances=advances.get(eid, []), statutory=rules,
            min_wage_minor=wage["monthly_minor"] if wage else None, province=province, province_source=source,
            leaves_on=leaves)
        snapshot = {
            "name": e["name"], "cnic": e["cnic"], "ntn": e["ntn"], "iban": e["iban"], "bank_name": e["bank_name"],
            "payment_mode": e["payment_mode"], "designation": e["designation"], "department": e["department"],
            "eobi_number": e["eobi_number"], "ss_number": e["ss_number"],
            "join_date": e["join_date"].isoformat() if e["join_date"] else None,
            "exit_date": leaves.isoformat() if leaves else None,
            "province": province, "province_source": source,
            "base_minor": segments[-1].base_minor if segments else 0}
        out.append(Loaded(inp, snapshot, min_wage_verified=bool(wage["verified"]) if wage else True))
    return out


def _month_end(first: date) -> date:
    nxt = date(first.year + (first.month == 12), first.month % 12 + 1, 1)
    return nxt - timedelta(days=1)


async def next_pay_month(conn: Any) -> date:
    """The month a one-off approved today is paid in (wave C): this month,
    unless its regular payroll is already final; then next month."""
    today: date = await conn.fetchval("select current_date")
    first = today.replace(day=1)
    closed = await conn.fetchval(
        "select 1 from payroll_runs where kind = 'regular' and period_start = $1 and status = any($2::text[])",
        first, list(FINAL))
    if not closed:
        return first
    return date(first.year + (first.month == 12), first.month % 12 + 1, 1)
