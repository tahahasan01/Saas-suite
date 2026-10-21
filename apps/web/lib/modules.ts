/**
 * The module manifest (decision D-50): one typed list drives the sidebar, the
 * module tabs under each page header and the page titles. Adding a screen to
 * a module is a change here, not in the shell.
 *
 * `requires` is the entitlement section a module needs; modules without it are
 * always available. `label` may use the industry terminology engine (`t`).
 */
import {
  Banknote, BarChart3, Boxes, CalendarDays, ClipboardList, Clock, FileText, Gauge,
  HandCoins, KanbanSquare, LayoutGrid, type LucideIcon, Palmtree, Receipt, RotateCcw,
  Settings, ShoppingCart, Sparkles, Store, Truck, UserRound, Users, Wallet, Workflow,
} from "lucide-react";
import type { Section } from "@business-os/types";

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
    tabs: [{ href: "/crm", label: "Pipeline", prefix: true }],
  },
  {
    key: "pos", label: () => "Point of sale", icon: ShoppingCart, color: "--color-mod-pos",
    href: "/pos", group: "sell", requires: "pos",
    tabs: [
      { href: "/pos", label: "Register" },
      { href: "/pos/products", label: "Products" },
      { href: "/pos/purchase-orders", label: "Purchase orders" },
      { href: "/pos/drawer", label: "Cash drawer" },
      { href: "/pos/returns", label: "Returns" },
      { href: "/pos/insights", label: "Insights" },
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
      { href: "/hrms/leave", label: "Leave" },
      { href: "/hrms/holidays", label: "Holidays" },
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
      { href: "/settings/sections", label: "Modules" },
      { href: "/settings/billing", label: "Billing" },
      { href: "/settings/fbr", label: "FBR invoicing", requires: "pos" },
      // org data (3A, p3-orgdata)
      { href: "/settings/company", label: "Company" },
      { href: "/settings/profile", label: "My profile" },
    ],
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
