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

export interface MeResponse {
  user: UserOut;
  tenant: TenantOut;
  entitlements: EntitlementOut[];
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
  role: string | null;
  status: string;
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
  salary_minor: number;
  status: string;
  present_today: boolean;
}

export interface Attendance {
  id: string;
  employee_id: string;
  employee_name: string;
  work_date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  method: string;
  fraud_flag: string;
}

export interface Leave {
  id: string;
  employee_id: string;
  employee_name: string;
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
  /** A completed working day with no check-in and no approved leave. */
  absent_days: number;
  absence_deduction_minor: number;
  tax_minor: number;
  net_minor: number;
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

export interface DashboardOverview {
  sections: string[];
  kpis: Kpi[];
  revenue_trend: TrendPoint[];
  leads_trend: TrendPoint[];
  alerts: Alert[];
  activity: ActivityItem[];
}
