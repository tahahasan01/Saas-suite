"""The payslip calculator (St03 §6.5–6.6, D-40, D-41, D-45). Pure: no
database, no clock. The preview (`GET /hrms/payroll`), the calculate job and
adjustment runs all call `calculate()`, so they can't disagree (risk 4).

Money is integer paisa, rounded half-up once per line. Formulas work in
rupees (what people type), and their results are rounded to the paisa.

Order of a payslip:
  1. Base: the compensation rows in force across the days employed in the
     period. BASE is the monthly rate (a day-weighted average when a raise
     lands mid-month); earnings marked `prorate` are then scaled by
     employed days / calendar days (joiners and leavers, §6.4).
  2. Components of the employee's structure, in dependency order (none = a
     single BASIC line equal to BASE).
  3. ABSENCE: absent + unpaid-leave days + half of the half days, each costing
     one working day of the month's recurring prorated pay — the rule the
     preview has always used.
  4. One-offs (bonus, fine, arrears) and advance recovery.
  5. EOBI / PESSI / SESSI from the effective-dated statutory rules.
  6. INCOME_TAX: annualised year-to-date projection under the pay date's tax
     table (D-10, D-41). Months of this tax year with no saved payslip are
     assumed to have been paid at the current rate, so a business that
     starts mid-year doesn't under-deduct; a one-off is taxed in full in the
     month it is paid.
"""
from __future__ import annotations

import calendar
from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Literal

from . import payroll
from . import payroll_formula as formula

LineKind = Literal["earning", "deduction", "employer_contribution", "info"]
SYSTEM_CODES = frozenset({"BASIC", "ABSENCE", "INCOME_TAX", "ADVANCE", "EOBI_EE", "EOBI_ER",
                          "PESSI_ER", "PESSI_EE", "SESSI_ER", "SESSI_EE"})
# Names a formula may read besides other components' codes.
INPUTS = ("BASE", "PERIOD_DAYS", "EMPLOYED_DAYS", "WORKING_DAYS", "UNPAID_DAYS")


def to_minor(rupees: Decimal) -> int:
    return int((rupees * 100).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def _round(value: Decimal) -> int:
    return int(value.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def _rs(minor: int) -> str:
    return str((Decimal(minor) / 100).quantize(Decimal("0.01")))


# ── Inputs ──────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class Segment:
    """Days [start, end] (inclusive) paid at `base_minor` a month."""
    start: date
    end: date
    base_minor: int

    @property
    def days(self) -> int:
        return (self.end - self.start).days + 1


@dataclass(frozen=True)
class Component:
    code: str
    name: str
    kind: Literal["earning", "deduction"]
    calc: Literal["fixed", "percent", "formula"]
    amount_minor: int = 0
    percent: Decimal | None = None
    percent_of: str = "BASE"
    formula: str = ""
    taxable: bool = True
    prorate: bool = True
    sort: int = 0

    def expression(self) -> str:
        if self.calc == "formula":
            return self.formula
        if self.calc == "percent":
            return f"{self.percent_of} * {self.percent} / 100"
        return str(Decimal(self.amount_minor) / 100)


@dataclass(frozen=True)
class Attendance:
    working_days: int = 0          # working days in the whole month
    present_days: int = 0
    paid_leave_days: int = 0
    unpaid_leave_days: int = 0
    wfh_days: int = 0
    absent_days: int = 0
    half_days: int = 0


@dataclass(frozen=True)
class OneOff:
    id: str
    code: str
    name: str
    kind: Literal["earning", "deduction"]
    amount_minor: int
    taxable: bool


@dataclass(frozen=True)
class Advance:
    id: str
    installment_minor: int
    outstanding_minor: int


@dataclass(frozen=True)
class StatutoryRule:
    scheme: str                    # EOBI | PESSI | SESSI …
    name: str
    base_kind: Literal["fixed_base", "min_wage", "actual_wage", "actual_wage_capped"]
    base_minor: int | None         # the fixed base, or the cap for actual_wage_capped
    employee_rate: Decimal
    employer_rate: Decimal
    verified: bool
    source_ref: str
    coverage_ceiling_minor: int | None = None   # earning more than this = not covered
    applies: bool | None = None    # None = automatic; True/False = the employee's override
    reason: str = ""               # why the override was set


@dataclass(frozen=True)
class TaxHistory:
    """This tax year before the period: finalised payslips, and months the
    employee was employed for that have none (paid outside the system)."""
    taxable_minor: int = 0
    tax_minor: int = 0
    months: int = 0
    assumed_months: int = 0


@dataclass(frozen=True)
class EmployeeInput:
    employee_id: str
    name: str
    period_start: date
    period_end: date
    pay_date: date
    segments: list[Segment]
    components: list[Component]
    attendance: Attendance
    tax_history: TaxHistory
    one_offs: list[OneOff] = field(default_factory=list)
    advances: list[Advance] = field(default_factory=list)
    statutory: list[StatutoryRule] = field(default_factory=list)
    min_wage_minor: int | None = None
    province: str | None = None
    province_source: str = ""


# ── Output ──────────────────────────────────────────────────────────────────
@dataclass
class Line:
    code: str
    name: str
    kind: LineKind
    amount_minor: int
    taxable: bool = False
    recurring: bool = True
    explain: dict[str, Any] = field(default_factory=dict)


@dataclass
class PayslipResult:
    employee_id: str
    name: str
    lines: list[Line]
    period_days: int
    employed_days: int
    attendance: Attendance
    gross_minor: int = 0
    deductions_minor: int = 0
    employer_cost_minor: int = 0
    net_minor: int = 0
    taxable_minor: int = 0
    tax_minor: int = 0
    tax_year: str = ""
    tax_verified: bool = True
    statutory_verified: bool = True
    projected_annual_taxable_minor: int = 0
    annual_tax_minor: int = 0
    taxable_ytd_minor: int = 0
    tax_ytd_minor: int = 0
    warnings: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    error: str | None = None

    def total(self, kind: LineKind) -> int:
        return sum(ln.amount_minor for ln in self.lines if ln.kind == kind)


def months_left(period_start: date, ty: payroll.TaxYear) -> int:
    return (ty.ends.year - period_start.year) * 12 + ty.ends.month - period_start.month + 1


def period_days(period_start: date, period_end: date) -> int:
    return (period_end - period_start).days + 1


# ── The calculator ──────────────────────────────────────────────────────────
class _Fail(Exception):
    pass


def calculate(inp: EmployeeInput) -> PayslipResult:
    pdays = period_days(inp.period_start, inp.period_end)
    employed = sum(s.days for s in inp.segments)
    ty = payroll.tax_year_for(inp.pay_date)
    res = PayslipResult(employee_id=inp.employee_id, name=inp.name, lines=[], period_days=pdays,
                        employed_days=employed, attendance=inp.attendance, tax_year=ty.label,
                        tax_verified=ty.verified)
    if employed == 0:
        return res
    try:
        _calculate(inp, res, ty)
    except _Fail as e:
        res.error = str(e)
    return res


def _calculate(inp: EmployeeInput, res: PayslipResult, ty: payroll.TaxYear) -> None:
    att = inp.attendance
    pdays, employed = res.period_days, res.employed_days
    base_full = Decimal(sum(s.base_minor * s.days for s in inp.segments)) / employed / 100   # rupees a month
    share = Decimal(employed) / pdays
    prorated = f"{employed}/{pdays} days" if employed != pdays else ""
    unpaid_units = Decimal(att.absent_days + att.unpaid_leave_days) + Decimal(att.half_days) / 2
    env: dict[str, Decimal] = {
        "BASE": base_full.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP), "PERIOD_DAYS": Decimal(pdays),
        "EMPLOYED_DAYS": Decimal(employed), "WORKING_DAYS": Decimal(att.working_days),
        "UNPAID_DAYS": unpaid_units}

    # 1–2. Components, evaluated at the full monthly rate in dependency order.
    comps = inp.components or [Component(code="BASIC", name="Basic pay", kind="earning", calc="formula",
                                         formula="BASE")]
    trees: dict[str, formula.Node] = {}
    for c in comps:
        try:
            trees[c.code] = formula.parse(c.expression())
        except formula.FormulaError as e:
            raise _Fail(f"{c.code}: {e}")
    try:
        order = formula.topo_order({c.code: formula.references(trees[c.code]) for c in comps})
    except formula.CycleError as e:
        raise _Fail(str(e))
    by_code = {c.code: c for c in comps}
    full: dict[str, int] = {}
    built: dict[str, Line] = {}
    for code in order:
        c = by_code[code]
        try:
            value = formula.evaluate(trees[code], env)
        except formula.FormulaError as e:
            raise _Fail(f"{code}: {e}")
        if value < 0:
            raise _Fail(f"{code} came out negative ({value})")
        full[code] = to_minor(value)
        env[code] = (Decimal(full[code]) / 100).quantize(Decimal("0.01"))
        amount = _round(Decimal(full[code]) * share) if c.prorate else full[code]
        explain: dict[str, Any] = {"calc": c.calc, "formula": c.expression(),
                                   "inputs": {k: str(env[k]) for k in sorted(formula.references(trees[code]))}}
        if c.prorate and prorated:
            explain.update(prorated=prorated, full_rate_minor=full[code])
        built[code] = Line(code, c.name, c.kind, amount, taxable=c.taxable and c.kind == "earning",
                           explain=explain)
    for c in sorted(comps, key=lambda c: (c.sort, c.code)):
        res.lines.append(built[c.code])

    # 3. Absence: one working day of recurring pay for each unpaid day.
    recurring_full = sum(full[c.code] for c in comps if c.kind == "earning" and c.prorate)
    recurring_paid = sum(built[c.code].amount_minor for c in comps if c.kind == "earning" and c.prorate)
    absence = 0
    if unpaid_units and att.working_days:
        absence = min(recurring_paid, _round(unpaid_units * Decimal(recurring_full) / att.working_days))
        res.lines.append(Line("ABSENCE", "Absence and unpaid leave", "deduction", absence, explain={
            "absent_days": att.absent_days, "unpaid_leave_days": att.unpaid_leave_days,
            "half_days": att.half_days, "unpaid_units": str(unpaid_units),
            "working_days": att.working_days, "per_day_minor": _round(Decimal(recurring_full) / att.working_days)}))

    # 4. One-offs and advances.
    one_off_taxable = 0
    for o in inp.one_offs:
        res.lines.append(Line(o.code, o.name, o.kind, o.amount_minor, taxable=o.taxable and o.kind == "earning",
                              recurring=False, explain={"one_off_id": o.id}))
        if o.taxable:
            one_off_taxable += o.amount_minor if o.kind == "earning" else -o.amount_minor
    for a in inp.advances:
        take = min(a.installment_minor, a.outstanding_minor)
        if take > 0:
            res.lines.append(Line("ADVANCE", "Advance recovery", "deduction", take, recurring=False, explain={
                "advance_id": a.id, "installment_minor": a.installment_minor,
                "outstanding_before_minor": a.outstanding_minor,
                "outstanding_after_minor": a.outstanding_minor - take}))

    gross = res.total("earning")
    gross_full = sum(full[c.code] for c in comps if c.kind == "earning")

    # 5. Statutory contributions.
    for rule in inp.statutory:
        _statutory(inp, res, rule, gross, gross_full, share, prorated)
    if inp.min_wage_minor is not None and gross_full < inp.min_wage_minor:
        res.warnings.append(f"Pay is below the minimum wage for {inp.province or 'this province'} "
                            f"(Rs {_rs(inp.min_wage_minor)} a month)")

    # 6. Income tax on what is actually paid.
    taxable = sum(ln.amount_minor for ln in res.lines if ln.taxable) - absence
    if one_off_taxable < 0:
        taxable += one_off_taxable          # a taxable one-off deduction lowers taxable pay
    taxable = max(0, taxable)
    recurring_taxable = sum(full[c.code] for c in comps if c.kind == "earning" and c.taxable)
    tax, ex = withholding(inp, ty, taxable_this=taxable, one_off_taxable=max(0, one_off_taxable),
                          recurring_taxable=recurring_taxable)
    res.lines.append(Line("INCOME_TAX", "Income tax (FBR)", "deduction", tax, explain=ex))
    res.taxable_minor, res.tax_minor = taxable, tax
    res.projected_annual_taxable_minor = ex["projected_annual_taxable_minor"]
    res.annual_tax_minor = ex["annual_tax_minor"]
    res.taxable_ytd_minor = inp.tax_history.taxable_minor + taxable
    res.tax_ytd_minor = inp.tax_history.tax_minor + tax
    _totals(res)
    if res.net_minor < 0:
        raise _Fail(f"Deductions are more than pay (net Rs {_rs(res.net_minor)})")


def _statutory(inp: EmployeeInput, res: PayslipResult, rule: StatutoryRule, gross: int, gross_full: int,
               share: Decimal, prorated: str) -> None:
    if not rule.verified:
        res.statutory_verified = False
    if rule.applies is False:
        res.notes.append(f"{rule.name} not applied: {rule.reason or 'switched off for this employee'}")
        return
    if (rule.applies is None and rule.coverage_ceiling_minor is not None
            and gross_full > rule.coverage_ceiling_minor):
        res.notes.append(f"{rule.name} not applied: pay is above the coverage ceiling "
                         f"(Rs {_rs(rule.coverage_ceiling_minor)})")
        return
    if rule.base_kind == "fixed_base":
        base, base_note = rule.base_minor or 0, "fixed base"
    elif rule.base_kind == "min_wage":
        if inp.min_wage_minor is None:
            res.notes.append(f"{rule.name} not applied: no minimum wage known for the work province")
            return
        base, base_note = inp.min_wage_minor, f"minimum wage ({inp.province})"
    elif rule.base_kind == "actual_wage":
        base, base_note = gross_full, "actual wage"
    else:
        base, base_note = min(gross_full, rule.base_minor or gross_full), "actual wage, capped"
    if prorated:
        base = _round(Decimal(base) * share)
    explain = {"scheme": rule.scheme, "base_kind": rule.base_kind, "base_note": base_note, "base_minor": base,
               "province": inp.province, "province_source": inp.province_source,
               "verified": rule.verified, "source_ref": rule.source_ref,
               "applicability": "override: " + rule.reason if rule.applies else "automatic"}
    if prorated:
        explain["prorated"] = prorated
    if rule.employee_rate:
        res.lines.append(Line(f"{rule.scheme}_EE", f"{rule.name} (employee)", "deduction",
                              _round(Decimal(base) * rule.employee_rate),
                              explain={**explain, "rate": str(rule.employee_rate)}))
    if rule.employer_rate:
        res.lines.append(Line(f"{rule.scheme}_ER", f"{rule.name} (employer)", "employer_contribution",
                              _round(Decimal(base) * rule.employer_rate),
                              explain={**explain, "rate": str(rule.employer_rate)}))


def withholding(inp: EmployeeInput, ty: payroll.TaxYear, *, taxable_this: int, one_off_taxable: int,
                recurring_taxable: int) -> tuple[int, dict[str, Any]]:
    """Monthly income tax by annualised YTD projection (D-41, St03 §6.6)."""
    hist = inp.tax_history
    left = months_left(inp.period_start, ty)
    without = (hist.taxable_minor + hist.assumed_months * recurring_taxable
               + (taxable_this - one_off_taxable) + recurring_taxable * (left - 1))
    with_one_off = without + one_off_taxable
    tax_without = payroll.annual_tax(Decimal(without) / 100, ty) * 100
    tax_with = payroll.annual_tax(Decimal(with_one_off) / 100, ty) * 100
    spread = hist.assumed_months + left
    regular = max(Decimal(0), Decimal(tax_without - hist.tax_minor) / spread)
    due = _round(regular + (tax_with - tax_without))
    return max(0, due), {
        "tax_year": ty.label, "verified": ty.verified, "source": ty.source,
        "months_left": left, "assumed_months": hist.assumed_months,
        "ytd_taxable_minor": hist.taxable_minor, "ytd_tax_minor": hist.tax_minor,
        "this_month_taxable_minor": taxable_this, "one_off_taxable_minor": one_off_taxable,
        "recurring_taxable_minor": recurring_taxable,
        "projected_annual_taxable_minor": with_one_off, "annual_tax_minor": tax_with,
        "one_off_tax_minor": tax_with - tax_without}


def _totals(res: PayslipResult) -> None:
    res.gross_minor = res.total("earning")
    res.deductions_minor = res.total("deduction")
    res.employer_cost_minor = res.gross_minor + res.total("employer_contribution")
    res.net_minor = res.gross_minor - res.deductions_minor


# ── Adjustments (D-40) ──────────────────────────────────────────────────────
PaidLine = tuple[str, str, str, int, bool]   # code, name, kind, amount_minor, taxable


def difference(recomputed: PayslipResult, paid: list[PaidLine]) -> PayslipResult:
    """What an adjustment run pays: the recomputed payslip minus what was
    already paid, line by line (code). Positive earnings are arrears; a
    negative net is a recovery. The original payslips are never touched."""
    before: dict[str, list[Any]] = {}
    for code, name, kind, amount, taxable in paid:
        slot = before.setdefault(code, [name, kind, 0, taxable])
        slot[2] += amount
    out = PayslipResult(employee_id=recomputed.employee_id, name=recomputed.name, lines=[],
                        period_days=recomputed.period_days, employed_days=recomputed.employed_days,
                        attendance=recomputed.attendance, tax_year=recomputed.tax_year,
                        tax_verified=recomputed.tax_verified, statutory_verified=recomputed.statutory_verified,
                        warnings=list(recomputed.warnings), notes=list(recomputed.notes), error=recomputed.error)
    now: dict[str, Line] = {}
    for ln in recomputed.lines:
        if ln.code in now:
            now[ln.code].amount_minor += ln.amount_minor
        else:
            now[ln.code] = Line(ln.code, ln.name, ln.kind, ln.amount_minor, ln.taxable, ln.recurring,
                                dict(ln.explain))
    for code in [*now, *(c for c in before if c not in now)]:
        new = now[code].amount_minor if code in now else 0
        old = before[code][2] if code in before else 0
        if new == old:
            continue
        ref = now.get(code)
        name, kind, taxable = (ref.name, ref.kind, ref.taxable) if ref else (before[code][0], before[code][1],
                                                                             before[code][3])
        out.lines.append(Line(code, name, kind, new - old, taxable, recurring=False, explain={
            "adjustment": True, "recomputed_minor": new, "previously_minor": old,
            "recomputed": ref.explain if ref else None}))
    _totals(out)
    out.taxable_minor = sum(ln.amount_minor for ln in out.lines if ln.taxable) - next(
        (ln.amount_minor for ln in out.lines if ln.code == "ABSENCE"), 0)
    out.tax_minor = next((ln.amount_minor for ln in out.lines if ln.code == "INCOME_TAX"), 0)
    return out


def month_bounds(month: str) -> tuple[date, date]:
    """'2026-10' → (1 Oct, 31 Oct). ValueError on anything else."""
    first = date.fromisoformat(f"{month}-01")
    return first, first.replace(day=calendar.monthrange(first.year, first.month)[1])
