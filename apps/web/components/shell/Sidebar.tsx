"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { useSession } from "@/lib/session";
import { MODULES, NAV_GROUPS, PORTAL_MODULES, moduleFor, tileStyle, type Module } from "@/lib/modules";

/** The bold frame (D-90): deep teal, one colour tile per module, a saffron
 *  marker on the active one. Collapses to an icon rail on desktop. */
export function Sidebar({ collapsed = false, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  const { me, t } = useSession();
  const pathname = usePathname();
  if (!me) return null;

  const enabled = new Set(me.entitlements.filter((e) => e.enabled).map((e) => e.section_key));
  const modules = (me.employee_portal ? PORTAL_MODULES : MODULES)
    .filter((m) => !m.requires || enabled.has(m.requires));
  const active = moduleFor(pathname, modules);

  return (
    <aside
      className={`flex h-full min-h-screen flex-col bg-frame text-frame-fg ${collapsed ? "w-[72px]" : "w-[248px]"}`}
      aria-label="Main navigation"
    >
      <div className={`flex items-center gap-2.5 px-4 pb-4 pt-5 ${collapsed ? "justify-center px-0" : ""}`}>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-saffron font-display text-lg font-bold text-frame">
          B
        </div>
        {!collapsed && <span className="font-display text-[17px] font-bold tracking-tight">Business OS</span>}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((g) => {
          const items = modules.filter((m) => m.group === g.key);
          if (items.length === 0) return null;
          return (
            <div key={g.key} className="mt-3 first:mt-0">
              {g.label && !collapsed && (
                <p className="px-3 pb-1 pt-2 text-xs font-medium text-frame-muted">{g.label}</p>
              )}
              <ul className="space-y-0.5">
                {items.map((m) => (
                  <li key={m.key}>
                    <NavItem module={m} label={m.label(t)} active={active?.key === m.key} collapsed={collapsed} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      {onToggle && (
        <button
          onClick={onToggle}
          className="mx-3 mb-4 hidden items-center gap-2 rounded-lg px-3 py-2 text-sm text-frame-muted hover:bg-frame-raised hover:text-frame-fg md:flex"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRight size={18} /> : <><ChevronsLeft size={18} /> Collapse</>}
        </button>
      )}
    </aside>
  );
}

function NavItem({ module: m, label, active, collapsed }:
                 { module: Module; label: string; active: boolean; collapsed: boolean }) {
  const Icon = m.icon;
  return (
    <Link
      href={m.href}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-3 rounded-xl py-2 text-[14.5px] font-medium transition-colors ${
        collapsed ? "justify-center px-0" : "px-2.5"
      } ${active ? "bg-frame-raised text-frame-fg" : "text-frame-muted hover:bg-frame-raised/60 hover:text-frame-fg"}`}
    >
      {active && <span className="absolute -left-3 top-1.5 bottom-1.5 w-1 rounded-r bg-saffron" aria-hidden />}
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
        style={tileStyle(m.color)}
      >
        <Icon size={17} strokeWidth={2.2} aria-hidden />
      </span>
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}
