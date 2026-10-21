// ── HRMS org, attendance v2, kiosks, leave v2, holiday calendars (3F) ─────
import type { Employee, Leave } from "./index";

export const PROVINCES = ["PB", "SD", "KP", "BA", "ICT", "GB", "AJK"] as const;
export type Province = (typeof PROVINCES)[number];
export const PROVINCE_NAMES: Record<Province, string> = {
  PB: "Punjab", SD: "Sindh", KP: "Khyber Pakhtunkhwa", BA: "Balochistan",
  ICT: "Islamabad", GB: "Gilgit-Baltistan", AJK: "Azad Kashmir",
};
export type GeoMode = "off" | "record" | "require";
export const EMPLOYMENT_TYPES = ["permanent", "contract", "probation", "daily_wage", "intern"] as const;
export const DOCUMENT_KINDS = ["cnic", "contract", "certificate", "medical", "license", "passport", "other"] as const;

export interface Department {
  id: string;
  name: string;
  parent_id: string | null;
  head_employee_id: string | null;
  active: boolean;
  headcount: number;
}

export interface JobTitle {
  id: string;
  name: string;
  department_id: string | null;
  active: boolean;
}

export interface WorkLocation {
  id: string;
  name: string;
  kind: "office" | "store" | "warehouse" | "factory" | "remote";
  address: string;
  lat: number | null;
  lng: number | null;
  radius_m: number;
  allowed_cidrs: string[];
  province: Province | null;
  geo_mode: GeoMode;
  ip_mode: GeoMode;
  active: boolean;
  kiosks: number;
}

export interface EmployeeProfile extends Employee {
  code: string | null;
  department_id: string | null;
  job_title_id: string | null;
  location_id: string | null;
  location_name: string | null;
  province: Province | null;
  manager_id: string | null;
  manager_name: string | null;
  employment_type: (typeof EMPLOYMENT_TYPES)[number];
  probation_end: string | null;
  has_kiosk_pin: boolean;
  documents_expiring: number;
}

export interface EmployeeDocument {
  id: string;
  employee_id: string;
  employee_name: string;
  kind: (typeof DOCUMENT_KINDS)[number];
  title: string;
  number: string;
  issued_on: string | null;
  expires_on: string | null;
  /** Upload comes with the files table (integration); null until then. */
  file_id: string | null;
  note: string;
  /** Negative once expired. */
  days_left: number | null;
}

export interface Kiosk {
  id: string;
  location_id: string;
  location_name: string;
  name: string;
  created_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
  /** Only in the create response; the server keeps a hash. */
  token: string | null;
}

export interface KioskBootstrap {
  location: { id: string; name: string };
  kiosk_name: string;
  employees: { id: string; name: string; has_pin: boolean }[];
}

export interface KioskPunch {
  kind: "in" | "out";
  name: string;
  at: string;
  worked_today_min: number;
}

export interface Correction {
  id: string;
  employee_id: string;
  employee_name: string;
  work_date: string;
  requested_in: string | null;
  requested_out: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string;
  created_at: string;
}

export interface Approvals {
  corrections: Correction[];
  leave: Leave[];
}

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  color: string;
  paid: boolean;
  requires_balance: boolean;
  counts_as: "leave" | "wfh";
  allow_half_day: boolean;
  approval: "none" | "manager" | "hr" | "manager_then_hr";
  grant_mode: "annual_upfront" | "monthly_accrual" | "none";
  days_per_year: number;
  accrual_start_after_days: number;
  prorate_joiners: boolean;
  cycle_start_month: number;
  carry_forward: "none" | "all" | "capped";
  carry_cap_days: number;
  carry_expires_after_months: number | null;
  max_balance_days: number | null;
  allow_negative_days: number;
  max_consecutive_days: number | null;
  include_holidays: boolean;
  statutory_note: string;
  active: boolean;
}

export interface LeaveBalanceV2 {
  leave_type: string;
  leave_type_id: string | null;
  name: string;
  quota: number;
  used: number;
  remaining: number;
  pending: number;
  cycle_start: string | null;
  cycle_end: string | null;
}

export interface HolidayCalendar {
  id: string;
  name: string;
  scope: "federal" | "province" | "company";
  province: Province | null;
  holidays: number;
}

export interface Blackout {
  id: string;
  name: string;
  date_from: string;
  date_to: string;
  location_id: string | null;
  department_id: string | null;
}

export interface ImportResult {
  created: number;
  skipped_duplicates: number;
  errors: { row: number; error: string }[];
}
