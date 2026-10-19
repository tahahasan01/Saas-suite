"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { ModuleHeader } from "@/components/shell/ModuleHeader";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { TrialBanner } from "@/components/TrialBanner";

const COLLAPSE_KEY = "bos.sidebar.collapsed";

/** Shared shell for all authenticated pages: the teal sidebar (an icon rail
 *  when collapsed, a slide-over on mobile), the top bar with Ctrl+K, and the
 *  module header with its tabs. Guards auth once here. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { me, loading } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

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

  useEffect(() => setMenuOpen(false), [pathname]); // close drawer on navigate

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1"); } catch { /* storage unavailable */ }
  }, []);
  function toggleCollapsed() {
    setCollapsed((c) => {
      try { localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1"); } catch { /* storage unavailable */ }
      return !c;
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(true); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (loading || !me) return <main className="grid min-h-screen place-items-center text-fg-subtle">Loading…</main>;

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <div className="sticky top-0 hidden h-screen shrink-0 md:block">
        <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      </div>

      {/* Mobile slide-over sidebar */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="absolute inset-y-0 left-0" onClick={(e) => e.stopPropagation()}>
            <Sidebar />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TrialBanner />
        <Topbar onOpenMenu={() => setMenuOpen(true)} onOpenPalette={() => setPaletteOpen(true)} />
        <ModuleHeader />
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
