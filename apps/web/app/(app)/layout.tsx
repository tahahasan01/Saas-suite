"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { Sidebar } from "@/components/Sidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { TrialBanner } from "@/components/TrialBanner";

/** Shared shell for all authenticated pages. Sidebar is static on desktop and
 * a hamburger slide-over on mobile. Guards auth once here. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { me, loading } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [me, loading, router]);

  useEffect(() => setMenuOpen(false), [pathname]); // close drawer on navigate

  if (loading || !me) return <main className="grid min-h-screen place-items-center text-fg-subtle">Loading…</main>;

  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile slide-over sidebar */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="absolute inset-y-0 left-0 w-64" onClick={(e) => e.stopPropagation()}>
            <Sidebar />
          </div>
        </div>
      )}

      <div className="flex min-h-screen flex-col">
        <TrialBanner />
        <header className="flex items-center justify-between border-b border-line px-4 py-2.5 md:justify-end md:px-6">
          <button
            onClick={() => setMenuOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-lg text-fg-muted hover:bg-elevated md:hidden"
            aria-label="Open menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <NotificationBell />
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
