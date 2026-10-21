import { describe, expect, it } from "vitest";
import type { MeResponse } from "@business-os/types";
import { MODULES, visibleModules, visibleTabs } from "./modules";

function me(partial: Partial<MeResponse>): MeResponse {
  return {
    user: { id: "u", email: "a@b.pk", name: "A", role: null },
    tenant: { id: "t", name: "T", industry_type: "retail", status: "active" },
    entitlements: [], permissions: {}, modules: [], nav: [], flags: {}, terminology: null,
    locale: { locale: "en", dir: "ltr", timezone: "Asia/Karachi", currency: "PKR" },
    employee_portal: false,
    ...partial,
  };
}

const settings = MODULES.find((m) => m.key === "settings")!;
const pos = MODULES.find((m) => m.key === "pos")!;

describe("server-computed nav (D-04)", () => {
  it("shows exactly the modules the server lists", () => {
    const m = me({ nav: [
      { key: "dashboard", module: "core", href: "/dashboard", label_key: "", icon: "", group: "overview", children: [] },
      { key: "crm", module: "crm", href: "/crm", label_key: "", icon: "", group: "sell", children: [] },
    ] });
    expect(visibleModules(m).map((x) => x.key)).toEqual(["dashboard", "crm"]);
  });

  it("filters tabs to the children the server lists", () => {
    const m = me({ nav: [{ key: "settings", module: "core", href: "/settings/team", label_key: "", icon: "", group: "admin",
      children: [{ href: "/settings/team", label_key: "" }, { href: "/settings/billing", label_key: "" }] }] });
    expect(visibleTabs(settings, m).map((t) => t.href)).toEqual(["/settings/team", "/settings/billing"]);
  });

  it("falls back to entitlements for an API without nav", () => {
    const m = me({ entitlements: [{ section_key: "pos", enabled: true, limits: {} }] });
    expect(visibleModules(m).some((x) => x.key === "pos")).toBe(true);
    expect(visibleModules(m).some((x) => x.key === "crm")).toBe(false);
    expect(visibleTabs(pos, m).length).toBe(pos.tabs!.length);
  });
});
