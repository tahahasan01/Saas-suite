// Shared domain constants + API contract types for the web app.
// Backend is Python/Pydantic; these mirror app/models.py. Keep in sync
// (later: auto-generate from the FastAPI OpenAPI schema).

export const INDUSTRIES = [
  "retail",
  "restaurant",
  "pharmacy",
  "wholesale",
  "education",
  "b2b_software",
  "real_estate",
] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const SECTIONS = ["crm", "pos", "hrms"] as const;
export type Section = (typeof SECTIONS)[number];

export const INDUSTRY_LABELS: Record<Industry, string> = {
  retail: "Retail / E-commerce",
  restaurant: "Restaurant / F&B",
  pharmacy: "Pharmacy",
  wholesale: "Wholesale",
  education: "Education / Institute",
  b2b_software: "Software House / B2B",
  real_estate: "Real Estate",
};

export const SECTION_LABELS: Record<Section, string> = {
  crm: "Sales / CRM",
  pos: "POS & Inventory",
  hrms: "Staff / HRMS",
};

export interface TenantOut {
  id: string;
  name: string;
  industry_type: Industry;
  status: string;
}

export interface UserOut {
  id: string;
  email: string;
  name: string;
  role: string | null;
}

export interface EntitlementOut {
  section_key: Section;
  enabled: boolean;
  limits: Record<string, unknown>;
}

/**
 * Permission keys (D-04, `module.resource.action`), mirroring the registry in
 * services/api/app/rbac.py. tests/core/test_permission_keys_in_sync.py fails
 * when the two lists differ, so a key added there must be added here.
 */
export const PERMISSION_KEYS = [
  // settings
  "settings.team.read",
  "settings.team.manage",
  "settings.roles.manage",
  "settings.modules.manage",
  "settings.billing.manage",
  "settings.workflows.read",
  "settings.workflows.manage",
  // crm
  "crm.lead.read",
  "crm.lead.create",
  "crm.lead.update",
  "crm.lead.import",
  "crm.lead.export",
  "crm.activity.manage",
  // invoicing
  "invoicing.invoice.read",
  "invoicing.invoice.create",
  "invoicing.invoice.approve",
  // pos
  "pos.sale.read",
  "pos.sale.create",
  "pos.sale.refund",
  "pos.session.read",
  "pos.session.open",
  "pos.session.close",
  "pos.report.sales",
  // products
  "products.product.read",
  "products.product.create",
  "products.product.update",
  "products.product.import",
  "products.product.export",
  "products.cost.read",
  // purchasing
  "purchasing.po.read",
  "purchasing.po.create",
  "purchasing.po.receive",
  "purchasing.po.cancel",
  "purchasing.supplier.read",
  "purchasing.supplier.manage",
  // fbr
  "fbr.settings.read",
  "fbr.settings.manage",
  "fbr.document.read",
  // hrms
  "hrms.employee.read",
  "hrms.employee.create",
  "hrms.employee.update",
  "hrms.employee.invite",
  "hrms.attendance.read",
  "hrms.attendance.write",
  "hrms.leave.read",
  "hrms.leave.request",
  "hrms.leave.approve",
  "hrms.holiday.manage",
  "hrms.shift.read",
  "hrms.shift.manage",
  "hrms.shift.assign",
  "hrms.settings.manage",
  // payroll
  "payroll.run.read",
  "payroll.run.create",
  "payroll.run.calculate",
  "payroll.run.approve",
  "payroll.run.pay",
  "payroll.run.lock",
  "payroll.run.cancel",
  "payroll.run.reopen",
  "payroll.salary.read",
  "payroll.salary.update",
  "payroll.report.export",
  "payroll.settings.manage",
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/** Widest-first: a grant at `all` covers `branch`, `team` and `own`. */
export type PermissionScope = "own" | "team" | "branch" | "all";

export interface LocaleOut {
  locale: "en" | "ur";
  dir: "ltr" | "rtl";
  /** IANA zone the tenant's business day runs in, e.g. "Asia/Karachi". */
  timezone: string;
  currency: string;
}

/** A module and whether it is on for the tenant (D-01). */
export interface MeModule {
  key: string;
  state: "enabled" | "disabled";
  application: boolean;
}

/** A sidebar entry the server says this caller may see (manifests ∩ enabled
 *  modules ∩ held keys). `key` matches a module key in lib/modules.ts. */
export interface MeNavItem {
  key: string;
  module: string;
  href: string;
  label_key: string;
  icon: string;
  group: string;
  children: { href: string; label_key: string }[];
}

export interface MeResponse {
  user: UserOut;
  tenant: TenantOut;
  /** Deprecated: read `modules` / `nav`. Kept for one release. */
  entitlements: EntitlementOut[];
  /** Keys the caller holds -> scope. A missing key is not held. */
  permissions: Partial<Record<PermissionKey, PermissionScope>>;
  modules: MeModule[];
  nav: MeNavItem[];
  flags: Record<string, boolean>;
  /** Refetch /terminology when the ETag changes. */
  terminology: { etag: string; industry_type: string; locale: string } | null;
  locale: LocaleOut;
  /** True when this login is an employee self-service account. */
  employee_portal: boolean;
}

// ── Modules and RBAC v2 (D-01, D-02, D-04) ─────────────────────────────────
export interface ModuleOut {
  key: string;
  label: string;
  description: string;
  application: boolean;
  always_on: boolean;
  state: "enabled" | "disabled";
  reason: "user" | "dependency" | "auto" | null;
  depends: string[];
  auto_enable: string[];
  purgeable: boolean;
  pending_purge_at: string | null;
}

export interface EnablePlanOut {
  module: string;
  to_enable: string[];
  violations: string[];
  applied: boolean;
}

export interface DisablePlanOut {
  module: string;
  to_disable: string[];
  blocked_by: string[];
  applied: boolean;
}

export interface Grant {
  permission_key: string;
  scope: PermissionScope;
}

export interface RoleSummary {
  id: string;
  name: string;
  description: string;
  is_system: boolean;
  template_key: string | null;
  user_count: number;
}

export interface RoleDetail extends RoleSummary {
  grants: Grant[];
  inherits: string[];
}

export interface CatalogKey {
  key: string;
  resource: string;
  action: string;
  /** Own/team/branch narrow it; otherwise only "all" applies. */
  scoped: boolean;
  legacy: [string, string];
}

export interface CatalogModule {
  module: string;
  label: string;
  keys: CatalogKey[];
}

export interface TeamOut {
  id: string;
  name: string;
  lead_user_id: string | null;
  member_ids: string[];
}

export interface TerminologyResponse {
  industry_type: Industry;
  locale: string;
  labels: Record<string, string>;
}

export interface TeamUser {
  id: string;
  email: string;
  name: string;
  /** The primary role. */
  role: string | null;
  status: string;
  /** Every role held (RBAC v2), primary first. */
  roles: { id: string; name: string }[];
}

export interface RoleOut {
  id: string;
  name: string;
  is_system: boolean;
}

// ── CRM ──────────────────────────────────────────────────────────────────
export const LEAD_SOURCES = ["manual", "whatsapp", "facebook", "google", "referral"] as const;
export const INTERACTION_CHANNELS = ["call", "whatsapp", "email", "note", "bot"] as const;
export const INTERACTION_OUTCOMES = ["interested", "not_interested", "callback", "busy"] as const;

export interface Stage {
  id: string;
  name: string;
  position: number;
  kind: "active" | "won" | "lost";
}

export interface Pipeline {
  id: string;
  name: string;
  is_default: boolean;
  stages: Stage[];
}

export interface Lead {
  id: string;
  pipeline_id: string;
  stage_id: string;
  owner_id: string | null;
  name: string;
  company: string;
  phone: string;
  email: string;
  source: string;
  value_minor: number;
  currency: string;
  score: number | null;
  created_at: string;
  stage_kind?: string | null;
}

export interface FulfillmentField {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  options?: string[];
}

export interface FulfillmentSchema {
  label: string;
  fields: FulfillmentField[];
}

export interface Invoice {
  id: string;
  lead_id: string;
  lead_name: string;
  amount_minor: number;
  discount_pct: number;
  total_minor: number;
  notes: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at: string | null;
}

// ── POS ──────────────────────────────────────────────────────────────────
export const PAYMENT_METHODS = ["cash", "card", "jazzcash", "easypaisa", "bank"] as const;

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  unit: string;
  price_minor: number;
  cost_minor: number;
  stock_qty: number;
  low_stock_at: number;
  active: boolean;
  /** Harmonized System code — required on every FBR line item. */
  hs_code: string;
  /** Sales tax percentage applied to this product. */
  tax_rate: number;
  /** Unit of measurement from FBR's reference list (distinct from `unit`). */
  fbr_uom: string;
}

export interface SaleItem {
  name: string;
  qty: number;
  price_minor: number;
  line_total_minor: number;
}

export interface Sale {
  id: string;
  subtotal_minor: number;
  discount_minor: number;
  total_minor: number;
  paid_minor: number;
  change_minor: number;
  payment_method: string;
  item_count: number;
  created_at: string;
  items: SaleItem[];
  tax_minor: number;
  /** Cash rounding: amount_due_minor - total_minor (0 for card/wallet). */
  rounding_minor: number;
  /** What the customer paid against: the total, rounded for cash. */
  amount_due_minor: number;
  /** Issued by FBR; null while a submission is queued for retry. */
  fbr_invoice_number: string | null;
  /** 'submitted' | 'pending', or null when FBR invoicing is off. */
  fbr_status: string | null;
}

export interface ReturnableLine {
  sale_item_id: string;
  product_id: string | null;
  name: string;
  qty_sold: number;
  qty_returned: number;
  qty_returnable: number;
  price_minor: number;
}

export interface SaleDetail extends Sale {
  returnable: ReturnableLine[];
}

/** A returnable line with what a refund of it is worked out from (the server's
 *  pricing.refund_for), so a Returns screen previews the real payout. */
export interface RefundableLine extends ReturnableLine {
  paid_minor: number;     // paid for the line: after discount, with tax
  refunded_minor: number; // already given back on earlier returns
}

/** GET /pos/sales/{id}: the sale, its refundable lines, and the most any
 *  further returns can pay out in total. */
export interface SaleLookup extends Omit<SaleDetail, "returnable"> {
  returnable: RefundableLine[];
  refundable_minor: number;
}

export interface PosReturn {
  id: string;
  sale_id: string;
  reason: string;
  refund_minor: number;
  tax_minor: number;
  created_at: string;
  items: { name: string; qty: number; line_refund_minor: number }[];
  fbr_invoice_number: string | null;
  fbr_status: string | null;
}

// ─── FBR Digital Invoicing ──────────────────────────────────────────────────
export interface FbrSettings {
  enabled: boolean;
  environment: "sandbox" | "production";
  seller_ntn_cnic: string;
  seller_business_name: string;
  seller_province: string;
  seller_address: string;
  prices_include_tax: boolean;
  /** The token itself is write-only and never returned. */
  token_set: boolean;
}

export interface FbrInvoice {
  /** Filing record id; POST /fbr/invoices/{id}/resolve settles an `unknown` one. */
  id: string | null;
  sale_id: string;
  /** Set for a return's Debit Note. */
  return_id: string | null;
  /** pending | submitted | unknown (sent, no answer: check IRIS) | failed */
  status: string;
  fbr_invoice_number: string | null;
  error_code: string;
  error: string;
  attempts: number;
  created_at: string;
}

export interface PosSummary {
  products_count: number;
  low_stock_count: number;
  sales_today_count: number;
  sales_today_total_minor: number;
}

export interface RestockItem {
  product_id: string;
  name: string;
  unit: string;
  stock_qty: number;
  daily_velocity: number;
  days_left: number | null;
  recommend_qty: number;
  reason: string;
}

export interface ForecastItem {
  product_id: string;
  name: string;
  current_stock: number;
  projected_units: number;
  recommend_qty: number;
}

export interface OccasionForecast {
  occasion: string;
  event_date: string;
  days_until: number;
  uplift_pct: number;
  items: ForecastItem[];
}

// ── HRMS ─────────────────────────────────────────────────────────────────
export const LEAVE_TYPES = ["annual", "sick", "casual", "unpaid"] as const;

export interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  cnic: string;
  designation: string;
  department: string;
  join_date: string | null;
  /** null when the caller lacks payroll access (D-42); CNIC is masked then too. */
  salary_minor: number | null;
  status: string;
  present_today: boolean;
  has_login: boolean;
  pay_masked: boolean;
}

export interface Attendance {
  id: string;
  employee_id: string;
  employee_name: string;
  work_date: string;
  check_in: string | null;
  check_out: string | null;
  /** present | late | half_day | absent — derived from the punches and the shift. */
  status: string;
  method: string;
  fraud_flag: string;
  /** Minutes past start + grace (or past tenants.late_after without a shift). */
  late_min: number;
  /** Minutes before end − grace, once checked out. */
  early_min: number;
  worked_min: number;
  shift_id: string | null;
  /** Frozen by a payroll run; never re-derived. */
  locked: boolean;
  /** The day is over with a check-in still open (counted as 0 minutes). */
  missing_checkout: boolean;
}

export interface Shift {
  id: string;
  name: string;
  /** Local "HH:MM:SS" in the tenant's timezone; end ≤ start means overnight. */
  start_time: string;
  end_time: string;
  grace_in_min: number;
  grace_out_min: number;
  half_day_below_min: number;
  absent_below_min: number;
  overnight: boolean;
  active: boolean;
}

export interface ShiftAssignment {
  id: string;
  employee_id: string;
  employee_name: string;
  shift_id: string;
  shift_name: string;
  date_from: string;
  date_to: string | null;
}

export interface Leave {
  id: string;
  employee_id: string;
  employee_name: string;
  /** 'wfh' is not leave — the employee is working, so it is never deducted. */
  request_type: "leave" | "wfh";
  leave_type: string;
  from_date: string;
  to_date: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
}

export interface HrmsSummary {
  headcount: number;
  present_today: number;
  on_leave_today: number;
  pending_leaves: number;
}

export interface Payslip {
  employee_id: string;
  name: string;
  gross_minor: number;
  present_days: number;
  /** Approved annual/sick/casual leave — not deducted. */
  paid_leave_days: number;
  /** Approved 'unpaid' leave — deducted. */
  unpaid_leave_days: number;
  /** Approved work-from-home — time worked, never deducted. */
  wfh_days: number;
  /** A completed working day with no check-in, leave or WFH. */
  absent_days: number;
  /** Derived half days (shift thresholds) — half a day each is deducted. */
  half_days: number;
  absence_deduction_minor: number;
  tax_minor: number;
  net_minor: number;
  /** The tax table this slip was computed under, e.g. "TY2027". */
  tax_year: string;
  /** false -> show "Tax rates pending verification". */
  tax_rates_verified: boolean;
}

export interface Holiday {
  id: string;
  holiday_date: string;
  name: string;
}

export interface Payroll {
  month: string;
  working_days: number;
  payslips: Payslip[];
  tax_year: string;
  /** false -> show "Tax rates pending verification". */
  tax_rates_verified: boolean;
}

// ── Billing ──────────────────────────────────────────────────────────────
export interface Billing {
  plan: string;
  /** `expired` is computed at read time from a lapsed trial_ends_at — it is not
   *  a value the subscriptions row ever stores. */
  status: "trialing" | "active" | "expired" | "past_due" | "canceled";
  days_left: number | null;
  current_period_end: string | null;
  max_sections: number;
  max_seats: number;
  ai_monthly: number;
  seats_used: number;
  sections_used: number;
}

export interface Plan {
  key: string;
  name: string;
  price_minor: number;
  max_sections: number;
  max_seats: number;
  ai_monthly: number;
}

export interface PaymentInstructions {
  payment_request_id: string;
  plan: string;
  amount_minor: number;
  reference: string;
  bank: { bank: string; title: string; account: string; note: string };
}

export interface Interaction {
  id: string;
  user_id: string | null;
  channel: string;
  outcome: string | null;
  note: string;
  next_follow_up_at: string | null;
  created_at: string;
}

export interface LeadDetail {
  lead: Lead;
  interactions: Interaction[];
}

export interface DuplicateMatch {
  id: string;
  name: string;
  company: string;
  reason: string;
}

export interface CrmSummary {
  total_leads: number;
  open_leads: number;
  won_value_minor: number;
  added_this_week: number;
}

export const WORKFLOW_TRIGGERS = ["lead.created", "lead.stage_changed", "interaction.logged"] as const;

export interface Workflow {
  id: string;
  name: string;
  trigger: string;
  conditions: { field: string; op: string; value: unknown }[];
  actions: Record<string, unknown>[];
  enabled: boolean;
  is_system: boolean;
}

// ─── Dashboard overview (cross-module) ──────────────────────────────────────
export interface TrendPoint {
  day: string;
  value: number;
}

export interface Kpi {
  key: string;
  label: string;
  value: number;
  kind: "count" | "money";
  delta_pct: number | null;
  href: string;
}

export interface Alert {
  text: string;
  href: string;
  tone: "warning" | "danger";
}

export interface ActivityItem {
  action: string;
  entity: string;
  actor: string | null;
  created_at: string;
}

/** One pipeline stage's standing total. Value and count both: a stage holding
 *  one large deal and a stage holding twenty small ones are different
 *  situations, and a single number hides which you're in. */
export interface StageSlice {
  name: string;
  kind: "active" | "won"; // 'lost' is excluded from pipeline
  count: number;
  value: number; // minor units (paisa)
}

export interface DashboardOverview {
  sections: string[];
  kpis: Kpi[];
  revenue_trend: TrendPoint[];
  leads_trend: TrendPoint[];
  pipeline: StageSlice[];
  alerts: Alert[];
  activity: ActivityItem[];
}

// ─── Attendance week matrix ──────────────────────────────────────────────────
export interface AttendanceWeekRow {
  id: string;
  name: string;
  /** One per day: present | late | half_day | leave | wfh | holiday | off | pending | absent | none */
  cells: string[];
}

export interface AttendanceWeek {
  days: string[];
  employees: AttendanceWeekRow[];
}
