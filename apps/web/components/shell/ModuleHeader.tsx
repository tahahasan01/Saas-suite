"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSession } from "@/lib/session";
import { MODULES, PORTAL_MODULES, moduleFor, tabIsActive, tileStyle, visibleTabs, type Module, type ModuleTab } from "@/lib/modules";

/** The module's name in its colour, and its screens as tabs — the same on every
 *  page of the module, so nobody hunts for a link buried in a page. */
export function ModuleHeader() {
  const { me, t } = useSession();
  const pathname = usePathname();
  if (!me) return null;

  const modules = me.employee_portal ? PORTAL_MODULES : MODULES;
  const m = moduleFor(pathname, modules);
  // The overview pages open with their own greeting; a module title above it
  // would say the same thing twice.
  if (!m || m.key === "dashboard" || m.key === "me") return null;
  // Which tabs this caller may open comes from the server (/auth/me `nav`).
  const tabs = me.employee_portal ? (m.tabs ?? []) : visibleTabs(m, me);
  const Icon = m.icon;

  return (
    <div className="border-b border-line bg-surface px-4 md:px-8">
      {/* Same cap as the page content in the app layout, so title, tabs and
          page line up on a wide screen. */}
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="flex items-center gap-3 pt-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={tileStyle(m.color)}>
            <Icon size={21} strokeWidth={2.2} aria-hidden />
          </span>
          <h1 className="min-w-0 font-display text-[26px] font-bold leading-tight tracking-tight">{m.label(t)}</h1>
        </div>
        {tabs.length > 1 ? <Tabs module={m} label={m.label(t)} tabs={tabs} pathname={pathname} /> : <div className="h-5" />}
      </div>
    </div>
  );
}

/** A tab strip that says when it scrolls. On a phone POS has six tabs and the
 *  last two sat off-screen behind a hidden scrollbar with no hint they existed;
 *  now the cut-off edge fades, a chevron appears, and the current tab is
 *  scrolled into view on arrival. */
function Tabs({ module: m, label, tabs, pathname }: { module: Module; label: string; tabs: ModuleTab[]; pathname: string }) {
  const navRef = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  }, []);

  // Centre the active tab without scrolling the page itself (scrollIntoView
  // would). Only when it isn't already fully in view, so it never fights a
  // strip the user has scrolled with the tab still showing.
  const centreActive = useCallback(() => {
    const el = navRef.current;
    const active = el?.querySelector<HTMLElement>("[aria-current=page]");
    if (!el || !active) return;
    const strip = el.getBoundingClientRect();
    const tab = active.getBoundingClientRect();
    if (tab.left < strip.left - 0.5 || tab.right > strip.right + 0.5) {
      el.scrollLeft += tab.left - strip.left - (strip.width - tab.width) / 2;
    }
    measure();
  }, [measure]);

  // Tab widths change after first paint: web fonts swap in (Firefox lays out
  // with the fallback font first, so a tab centred then ended up half
  // off-screen), and the strip resizes with the window. Re-centre on both —
  // the observer watches each link as well as the strip, since a font swap
  // widens the links without resizing the strip.
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    let live = true;
    centreActive();
    const ro = new ResizeObserver(() => centreActive());
    ro.observe(el);
    el.querySelectorAll("a").forEach((a) => ro.observe(a));
    document.fonts?.ready.then(() => { if (live) centreActive(); });
    return () => { live = false; ro.disconnect(); };
  }, [pathname, tabs.length, centreActive]);

  function nudge(dir: 1 | -1) {
    const el = navRef.current;
    el?.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
  }

  // Fade only the edges that hide something.
  const fade = 32;
  const mask = edges.left || edges.right
    ? `linear-gradient(to right, ${edges.left ? `transparent, #000 ${fade}px` : "#000"}, ${edges.right ? `#000 calc(100% - ${fade}px), transparent` : "#000"})`
    : undefined;

  return (
    <div className="relative -mb-px mt-4">
      <nav
        ref={navRef}
        aria-label={`${label} sections`}
        onScroll={measure}
        className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
      >
        {tabs.map((tb) => {
          const active = tabIsActive(tb, pathname);
          return (
            <Link
              key={tb.href}
              href={tb.href}
              aria-current={active ? "page" : undefined}
              className={`relative shrink-0 whitespace-nowrap rounded-t-lg px-3.5 py-2.5 text-sm font-medium transition-colors pointer-coarse:py-3 ${
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
      {/* Pointer conveniences: keyboard users Tab through the links (which
          scroll themselves into view) and touch users swipe, so these are
          hidden from assistive tech and the Tab order. */}
      {edges.left && (
        <button type="button" tabIndex={-1} aria-hidden onClick={() => nudge(-1)}
                className="absolute inset-y-0 left-0 grid w-7 place-items-center bg-surface/80 text-fg-muted hover:text-fg">
          <ChevronLeft size={16} />
        </button>
      )}
      {edges.right && (
        <button type="button" tabIndex={-1} aria-hidden onClick={() => nudge(1)}
                className="absolute inset-y-0 right-0 grid w-7 place-items-center bg-surface/80 text-fg-muted hover:text-fg">
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}
