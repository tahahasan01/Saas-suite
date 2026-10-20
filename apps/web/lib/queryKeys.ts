/* TanStack Query keys, one factory per module (F10).
 *
 * Every key starts with its module, so `invalidateQueries({ queryKey: qk.pos.all })`
 * refreshes everything the till shows after a sale, and one module's keys can't
 * collide with another's. Add a module's keys here when its pages move onto
 * useQuery; build keys only through these functions, never by hand.
 *
 * Migrated so far: dashboard. The rest still load with useEffect + api(). */

const dashboard = ["dashboard"] as const;
const crm = ["crm"] as const;
const invoices = ["invoices"] as const;
const pos = ["pos"] as const;
const hrms = ["hrms"] as const;
const me = ["me"] as const;
const settings = ["settings"] as const;
const notifications = ["notifications"] as const;

export const qk = {
  dashboard: {
    all: dashboard,
    overview: () => [...dashboard, "overview"] as const,
  },
  crm: {
    all: crm,
    leads: (params: Record<string, string> = {}) => [...crm, "leads", params] as const,
    lead: (id: string) => [...crm, "lead", id] as const,
    pipelines: () => [...crm, "pipelines"] as const,
  },
  invoices: {
    all: invoices,
    list: () => [...invoices, "list"] as const,
  },
  pos: {
    all: pos,
    products: (params: { q?: string; page?: number; archived?: boolean } = {}) => [...pos, "products", params] as const,
    summary: () => [...pos, "summary"] as const,
    drawer: () => [...pos, "drawer"] as const,
  },
  hrms: {
    all: hrms,
    employees: () => [...hrms, "employees"] as const,
    payroll: (month: string) => [...hrms, "payroll", month] as const,
    summary: () => [...hrms, "summary"] as const,
  },
  me: {
    all: me,
    profile: () => [...me, "profile"] as const,
  },
  settings: {
    all: settings,
    billing: () => [...settings, "billing"] as const,
  },
  notifications: {
    all: notifications,
    feed: () => [...notifications, "feed"] as const,
  },
};
