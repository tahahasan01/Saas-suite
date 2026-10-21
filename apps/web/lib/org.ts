/* Types and calls for org data (3A): company profile, regions, branding,
 * document numbers, tax rates, uploads and my profile. Mirrors
 * services/api/app/org_models.py. */
import { api } from "@/lib/api";

export type RegionCode = "PB" | "SD" | "KP" | "BA" | "ICT" | "GB" | "AJK";

export interface Region {
  code: RegionCode;
  name: string;
  name_ur: string;
  fbr_name: string;
  kind: "province" | "territory";
  pst_authority: string;
}

export interface Company {
  name: string;
  legal_name: string;
  ntn: string | null;
  strn: string | null;
  address: string;
  city: string;
  phone: string;
  email: string;
  region_code: RegionCode | null;
  timezone: string;
  fy_start_month: number;
  logo_file_id: string | null;
}

export interface Branding {
  logo_file_id: string | null;
  primary_color: string | null;
  accent_color: string | null;
  receipt_header: string;
  receipt_footer: string;
  invoice_header: string;
  invoice_footer: string;
  payslip_header: string;
  receipt_width_mm: 58 | 80;
  layout: "classic" | "compact" | "bold";
  version: number;
  tokens: Record<string, string>;
}

export type BrandingPatch = Partial<Omit<Branding, "version" | "tokens">> & { clear_logo?: boolean };

export interface Sequence {
  id: string;
  code: string;
  name: string;
  branch_id: string | null;
  register_id: string | null;
  pattern: string;
  padding: number;
  reset: "never" | "fiscal_year" | "calendar_year" | "month";
  gapless: boolean;
  period_key: string;
  next_value: number;
  preview: string;
}

export interface TaxRate {
  id: string;
  code: string;
  kind: "gst" | "pst" | "further" | "extra" | "fed" | "wht";
  name: string;
  region_code: RegionCode | null;
  rate_pct: number;
  applies_to: "sale" | "purchase" | "both";
  included_in_price: boolean | null;
  effective_from: string;
  effective_to: string | null;
  verified: boolean;
  source_ref: string;
}

export interface TaxRates {
  on: string;
  rates: TaxRate[];
  unverified_in_use: boolean;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  locale: string;
}

export interface UploadedFile {
  id: string;
  mime: string;
  size_bytes: number;
  sha256: string;
  original_name: string;
}

/** Uploads raw bytes; the API sniffs the type itself (images, PDF, CSV, XLSX). */
export function uploadFile(file: File, purpose: "attachment" | "logo" = "attachment"): Promise<UploadedFile> {
  const qs = new URLSearchParams({ name: file.name || "upload", purpose });
  return api<UploadedFile>(`/files?${qs}`, {
    method: "POST",
    body: file,
    headers: { "Content-Type": "application/octet-stream" },
  });
}

/** Where an <img> or link reaches a stored file (a redirect to a 5-minute URL). */
export function fileUrl(id: string, version?: number): string {
  return `/api/files/${id}${version ? `?v=${version}` : ""}`;
}

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"];

/** Zones Pakistani businesses and their branches abroad actually use. */
export const TIMEZONES = ["Asia/Karachi", "Asia/Dubai", "Asia/Riyadh", "Asia/Qatar", "Asia/Kabul",
  "Europe/London", "America/New_York"];
