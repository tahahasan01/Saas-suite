"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/session";
import { MODULES, PORTAL_MODULES, moduleFor, tabIsActive, tileStyle } from "@/lib/modules";

/** The module's name in its colour, and its screens as tabs — the same on every
 *  page of the module, so nobody hunts for a link buried in a page. */
export function ModuleHeader() {
  const { me, t } = useSession();
  const pathname = usePathname();
  if (!me) return null;

  const enabled = new Set(me.entitlements.filter((e) => e.enabled).map((e) => e.section_key));
  const modules = me.employee_portal ? PORTAL_MODULES : MODULES;
  const m = moduleFor(pathname, modules);
  // The overview pages open with their own greeting; a module title above it
  // would say the same thing twice.
  if (!m || m.key === "dashboard" || m.key === "me") return null;
  const tabs = (m.tabs ?? []).filter((tb) => !tb.requires || enabled.has(tb.requires));
  const Icon = m.icon;

  return (
    <div className="border-b border-line bg-surface px-4 md:px-8">
      <div className="flex items-center gap-3 pt-5">
        <span className="grid h-10 w-10 place-items-center rounded-xl" style={tileStyle(m.color)}>
          <Icon size={21} strokeWidth={2.2} aria-hidden />
        </span>
        <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight">{m.label(t)}</h1>
      </div>
      {tabs.length > 1 ? (
        <nav aria-label={`${m.label(t)} sections`} className="-mb-px mt-4 flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {tabs.map((tb) => {
            const active = tabIsActive(tb, pathname);
            return (
              <Link
                key={tb.href}
                href={tb.href}
                aria-current={active ? "page" : undefined}
                className={`relative whitespace-nowrap rounded-t-lg px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  active ? "text-fg" : "text-fg-muted hover:bg-elevated hover:text-fg"
                }`}
              >
                {tb.label}
                {active && (
                  <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-t" style={{ background: `var(${m.color})` }} />
                )}
              </Link>
            );
          })}
        </nav>
      ) : (
        <div className="h-5" />
      )}
    </div>
  );
}
