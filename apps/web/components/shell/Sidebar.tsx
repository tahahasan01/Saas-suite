"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { useSession } from "@/lib/session";
import { MODULES, NAV_GROUPS, PORTAL_MODULES, moduleFor, tileStyle, type Module } from "@/lib/modules";

/** The bold frame (D-90): deep teal, one colour tile per module, a saffron
 *  marker on the active one. Collapses to an icon rail on desktop.
 *  `fill` makes it take its container's width (the phone menu sheet);
 *  `onNavigate` lets that sheet close even when the link is the current page. */
export function Sidebar({ collapsed = false, onToggle, id, fill = false, onNavigate }: {
  collapsed?: boolean; onToggle?: () => void; id?: string; fill?: boolean; onNavigate?: () => void;
}) {
  const { me, t } = useSession();
  const pathname = usePathname();
  if (!me) return null;

  const enabled = new Set(me.entitlements.filter((e) => e.enabled).map((e) => e.section_key));
  const modules = (me.employee_portal ? PORTAL_MODULES : MODULES)
    .filter((m) => !m.requires || enabled.has(m.requires));
  const active = moduleFor(pathname, modules);

  return (
    <aside
      id={id}
      // Safe-area padding: with viewport-fit=cover the frame runs under the
      // notch and the status bar in landscape.
      className={`flex h-full min-h-full flex-col bg-frame pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] text-frame-fg transition-[width] duration-150 ${
        fill ? "w-full" : collapsed ? "w-[72px]" : "w-[248px]"
      }`}
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
                    <NavItem module={m} label={m.label(t)} active={active?.key === m.key} collapsed={collapsed} onNavigate={onNavigate} />
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
          className={`mx-3 mb-4 hidden min-h-9 items-center gap-2 rounded-lg py-2 text-sm text-frame-muted hover:bg-frame-raised hover:text-frame-fg md:flex pointer-coarse:min-h-11 ${
            collapsed ? "justify-center px-0" : "px-3"
          }`}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand sidebar" : undefined}
        >
          {collapsed ? <ChevronsRight size={18} aria-hidden /> : <><ChevronsLeft size={18} aria-hidden /> Collapse</>}
        </button>
      )}
    </aside>
  );
}

function NavItem({ module: m, label, active, collapsed, onNavigate }:
                 { module: Module; label: string; active: boolean; collapsed: boolean; onNavigate?: () => void }) {
  const Icon = m.icon;
  return (
    <Link
      href={m.href}
      onClick={onNavigate}
      // Collapsed, the label is gone from view: the title is the tooltip and
      // aria-label keeps the link's name for screen readers.
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-3 rounded-xl py-2 text-[14.5px] pointer-coarse:min-h-11 font-medium transition-colors ${
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
