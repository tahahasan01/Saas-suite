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
