/**
 * The module manifest (decision D-50): one typed list drives the sidebar, the
 * module tabs under each page header and the page titles. Adding a screen to
 * a module is a change here, not in the shell.
 *
 * `requires` is the entitlement section a module needs; modules without it are
 * always available. `label` may use the industry terminology engine (`t`).
 */
import {
  Banknote, BarChart3, BookUser, Boxes, CalendarCheck, CalendarDays, ClipboardList, Clock, FileText, Gauge,
  HandCoins, KanbanSquare, LayoutGrid, type LucideIcon, Palmtree, Receipt, RotateCcw,
  Settings, ShoppingCart, Sparkles, Store, Truck, UserRound, Users, Wallet, Workflow,
} from "lucide-react";
import type { MeResponse, Section } from "@business-os/types";

export interface ModuleTab {
  href: string;
  label: string;
  /** Match nested routes too (e.g. /crm/leads/123 under /crm). Default: exact. */
  prefix?: boolean;
  requires?: Section;
}

export interface Module {
  key: string;
  label: (t: (k: string) => string) => string;
  icon: LucideIcon;
  /** CSS variable holding the module colour, e.g. "--color-mod-pos". */
  color: string;
  href: string;
  group: "overview" | "sell" | "people" | "admin";
  requires?: Section;
  tabs?: ModuleTab[];
  /** A live count shown on the nav item (e.g. activities due). */
  badge?: "activities";
}

export const NAV_GROUPS: { key: Module["group"]; label: string | null }[] = [
  { key: "overview", label: null },
  { key: "sell", label: "Sell" },
  { key: "people", label: "People" },
  { key: "admin", label: "Manage" },
];

export const MODULES: Module[] = [
  {
    key: "dashboard", label: () => "Overview", icon: Gauge, color: "--color-brand",
    href: "/dashboard", group: "overview",
  },
  {
    key: "crm", label: (t) => `${t("leads")} & pipeline`, icon: KanbanSquare, color: "--color-mod-crm",
    href: "/crm", group: "sell", requires: "crm",
    tabs: [
      { href: "/crm", label: "Pipeline" },
      { href: "/crm/reports", label: "Reports" },
      { href: "/crm/settings", label: "Settings" },
    ],
  },
  {
    // Contacts (D-30) supports CRM, POS and invoicing; until the module
    // registry lands it shows with CRM. Labels: Customers, Students, Patients…
    key: "contacts",
    label: (t) => (t("contacts") === "contacts" ? "Contacts" : t("contacts")),
    icon: BookUser, color: "--color-mod-crm", href: "/contacts", group: "sell", requires: "crm",
    tabs: [
      { href: "/contacts", label: "All" },
      { href: "/contacts/review", label: "Review" },
    ],
  },
  {
    key: "pos", label: () => "Point of sale", icon: ShoppingCart, color: "--color-mod-pos",
    href: "/pos", group: "sell", requires: "pos",
    tabs: [
      { href: "/pos", label: "Register" },
      { href: "/pos/sales", label: "Sales" },
      { href: "/pos/khata", label: "Khata" },
      { href: "/pos/products", label: "Products" },
      { href: "/pos/purchase-orders", label: "Purchase orders" },
      { href: "/pos/drawer", label: "Registers" },
      { href: "/pos/returns", label: "Returns" },
      { href: "/pos/insights", label: "Insights" },
      { href: "/pos/reports", label: "Reports" },
    ],
  },
  {
    key: "invoices", label: () => "Invoices", icon: FileText, color: "--color-mod-invoices",
    href: "/invoices", group: "sell", requires: "crm",
  },
  {
    key: "hrms", label: () => "Staff", icon: Users, color: "--color-mod-hrms",
    href: "/hrms", group: "people", requires: "hrms",
    tabs: [
      { href: "/hrms", label: "Team" },
      { href: "/hrms/attendance", label: "Attendance" },
      { href: "/hrms/reports", label: "Reports" },
      { href: "/hrms/leave", label: "Leave" },
      { href: "/hrms/holidays", label: "Holidays" },
      // 3F: org setup, documents, sites and kiosks
      { href: "/hrms/employees/setup", label: "Departments" },
      { href: "/hrms/employees/documents", label: "Documents" },
      { href: "/hrms/kiosk", label: "Sites & kiosks" },
    ],
  },
  {
    key: "payroll", label: () => "Payroll", icon: Banknote, color: "--color-mod-payroll",
    href: "/hrms/payroll", group: "people", requires: "hrms",
  },
  {
    key: "automations", label: () => "Automations", icon: Workflow, color: "--color-mod-automations",
    href: "/automations", group: "admin",
  },
  {
    key: "settings", label: () => "Settings", icon: Settings, color: "--color-mod-settings",
    href: "/settings/team", group: "admin",
    tabs: [
      { href: "/settings/team", label: "Team" },
      { href: "/settings/roles", label: "Roles" },
      { href: "/settings/sections", label: "Modules" },
      { href: "/settings/billing", label: "Billing" },
      { href: "/settings/fbr", label: "FBR invoicing", requires: "pos" },
      // org data (3A, p3-orgdata)
      { href: "/settings/company", label: "Company" },
      { href: "/settings/profile", label: "My profile" },
    ],
  },
  // crm v2 (3B): the day's follow-ups, with a due-count badge.
  {
    key: "my-day", label: () => "My day", icon: CalendarCheck, color: "--color-mod-crm",
    href: "/my-day", group: "overview", requires: "crm", badge: "activities",
  },
];

/** The employee self-service portal: its own small navigation. */
export const PORTAL_MODULES: Module[] = [
  { key: "me", label: () => "My space", icon: UserRound, color: "--color-brand", href: "/me", group: "overview" },
  { key: "me-attendance", label: () => "Attendance", icon: Clock, color: "--color-mod-hrms",
    href: "/me/attendance", group: "people" },
  { key: "me-leave", label: () => "Leave", icon: Palmtree, color: "--color-mod-hrms", href: "/me/leave", group: "people" },
  { key: "me-payslips", label: () => "Payslips", icon: Wallet, color: "--color-mod-payroll",
    href: "/me/payslips", group: "people" },
];

/**
 * What this caller may see, decided by the server (D-04, D-50): /auth/me's
 * `nav` lists the modules and tabs from the manifests ∩ enabled modules ∩ the
 * caller's keys. This file only says how they look. An older API without
 * `nav` falls back to the entitlement sections.
 */
export function visibleModules(me: MeResponse, list: Module[] = MODULES): Module[] {
  if (me.nav?.length) {
    const keys = new Set(me.nav.map((n) => n.key));
    return list.filter((m) => keys.has(m.key));
  }
  const enabled = new Set(me.entitlements.filter((e) => e.enabled).map((e) => e.section_key));
  return list.filter((m) => !m.requires || enabled.has(m.requires));
}

export function visibleTabs(m: Module, me: MeResponse): ModuleTab[] {
  const tabs = m.tabs ?? [];
  const item = me.nav?.find((n) => n.key === m.key);
  if (item) {
    // No children listed: the server didn't split this entry, show its tabs.
    if (!item.children.length) return tabs;
    const hrefs = new Set(item.children.map((c) => c.href));
    return tabs.filter((t) => hrefs.has(t.href));
  }
  const enabled = new Set(me.entitlements.filter((e) => e.enabled).map((e) => e.section_key));
  return tabs.filter((t) => !t.requires || enabled.has(t.requires));
}

/** Labels for module keys on the settings screens. */
export function moduleLabel(key: string, fallback?: string): string {
  return MODULE_LABELS[key] ?? fallback ?? key;
}

const MODULE_LABELS: Record<string, string> = {
  core: "Workspace",
  contacts: "Customers",
  products: "Products",
  crm: "Sales / CRM",
  pos: "POS & inventory",
  purchasing: "Purchasing",
  fbr: "FBR invoicing",
  invoicing: "Invoices",
  hrms: "Staff / HRMS",
  payroll: "Payroll",
  pos_hrms: "Cashiers are staff",
};

/** Which module a path belongs to: the longest matching module or tab href wins. */
export function moduleFor(pathname: string, modules: Module[]): Module | undefined {
  let best: { m: Module; len: number } | undefined;
  for (const m of modules) {
    const hrefs = [m.href, ...(m.tabs ?? []).map((t) => t.href)];
    for (const h of hrefs) {
      if ((pathname === h || pathname.startsWith(`${h}/`)) && (!best || h.length > best.len)) {
        best = { m, len: h.length };
      }
    }
  }
  return best?.m;
}

export function tabIsActive(tab: ModuleTab, pathname: string): boolean {
  return pathname === tab.href || (!!tab.prefix && pathname.startsWith(`${tab.href}/`));
}

// Re-exported so pages can use the same icon set without importing lucide directly.
export const Icons = {
  BarChart3, Boxes, CalendarDays, ClipboardList, HandCoins, LayoutGrid, Receipt, RotateCcw,
  Sparkles, Store, Truck,
};

/** Fill and ink for a module's icon tile; the pairing keeps icons legible on
 *  light fills such as POS saffron. */
export function tileStyle(color: string): React.CSSProperties {
  return { background: `var(${color})`, color: `var(${color}-ink)` };
}
