"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { ModuleHeader } from "@/components/shell/ModuleHeader";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { useMediaQuery } from "@/components/shell/useMediaQuery";
import { TrialBanner } from "@/components/TrialBanner";
import { Sheet } from "@/components/Dialog";

// Two remembered choices, because they answer different questions: on a wide
// screen "do I want the full sidebar?", on a tablet or small laptop "did I
// deliberately expand the rail?". Sharing one key meant a desktop preference
// put the 248px sidebar back on a 1024px screen, where it squeezed the page.
const COLLAPSE_KEY = "bos.sidebar.collapsed";
const NARROW_EXPAND_KEY = "bos.sidebar.narrowExpanded";

function stored(key: string): boolean {
  try { return typeof window !== "undefined" && localStorage.getItem(key) === "1"; } catch { return false; }
}
function store(key: string, on: boolean) {
  try { localStorage.setItem(key, on ? "1" : "0"); } catch { /* storage unavailable */ }
}

/** Shared shell for all authenticated pages: the teal sidebar (a full sidebar
 *  from 1280, an icon rail from 768, a slide-over sheet on phones), the top bar
 *  with Ctrl+K, and the module header with its tabs. Guards auth once here. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { me, loading } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [wideCollapsed, setWideCollapsed] = useState(() => stored(COLLAPSE_KEY));
  const [narrowExpanded, setNarrowExpanded] = useState(() => stored(NARROW_EXPAND_KEY));
  const wide = useMediaQuery("(min-width: 1280px)", true);
  const collapsed = wide ? wideCollapsed : !narrowExpanded;
  const desktop = useMediaQuery("(min-width: 768px)");

  useEffect(() => {
    if (loading) return;
    if (!me) { router.replace("/login"); return; }
    // Keep the two worlds apart: an employee login only ever sees /me/*, and an
    // admin has no self-service pages to land on. The backend enforces this too;
    // this just avoids showing a screen that would only 403.
    const inPortal = pathname === "/me" || pathname.startsWith("/me/");
    if (me.employee_portal && !inPortal) router.replace("/me");
    else if (!me.employee_portal && inPortal) router.replace("/dashboard");
  }, [me, loading, pathname, router]);

  // Close the phone menu on navigate, and if the window grows into the
  // sidebar's range (the sheet hides at md, its overlay wouldn't).
  useEffect(() => setMenuOpen(false), [pathname, desktop]);

  function toggleCollapsed() {
    if (wide) { store(COLLAPSE_KEY, !wideCollapsed); setWideCollapsed(!wideCollapsed); }
    else { store(NARROW_EXPAND_KEY, !narrowExpanded); setNarrowExpanded(!narrowExpanded); }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(true); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (loading || !me) return <main className="grid min-h-dvh place-items-center text-fg-subtle">Loading…</main>;

  return (
    <div className="flex min-h-dvh">
      {/* First Tab stop: past the sidebar and top bar straight to the page. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[90] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-fg focus:shadow-lg"
      >
        Skip to content
      </a>

      {/* Desktop sidebar. dvh, not vh: on mobile browsers 100vh is the height
          with the address bar hidden, which pushed the collapse toggle off-screen. */}
      <div className="sticky top-0 hidden h-dvh shrink-0 md:block">
        <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      </div>

      {/* Phone navigation: a real dialog, so Escape, the ✕, focus trap and
          focus return all come with it. */}
      <Sheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        side="left"
        title="Menu"
        hideTitle
        // The sidebar fills the sheet, so its ✕ takes the teal frame's ink.
        className="md:hidden [&_[aria-label=Close]]:text-frame-muted [&_[aria-label=Close]:hover]:bg-frame-raised [&_[aria-label=Close]:hover]:text-frame-fg"
      >
        <Sidebar id="mobile-nav" fill onNavigate={() => setMenuOpen(false)} />
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar menuOpen={menuOpen} onOpenMenu={() => setMenuOpen(true)} onOpenPalette={() => setPaletteOpen(true)} />
        {/* Below the sticky bar rather than above it: above, it sat under the
            iPhone notch and pushed the bar's safe-area padding down with it. */}
        <TrialBanner />
        <ModuleHeader />
        <main id="main" tabIndex={-1} className="flex-1 px-4 py-6 outline-none md:px-8">
          {/* Capped so a 2560px screen doesn't stretch charts and tables into
              unreadable lines; ModuleHeader uses the same cap so they align. */}
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
