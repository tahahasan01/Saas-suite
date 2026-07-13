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
