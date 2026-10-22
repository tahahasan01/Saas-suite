"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/session";

/** The till's own frame: a thin bar with the way back to the back office and
 *  the page, nothing else. Guards the session like the app shell does. */
export function RegisterShell({ children }: { children: React.ReactNode }) {
  const { me, loading } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!me) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (me.employee_portal) router.replace("/me");
  }, [me, loading, pathname, router]);

  if (loading || !me || me.employee_portal) {
    return <main className="grid min-h-dvh place-items-center text-fg-subtle">Loading…</main>;
  }
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <span className="font-display text-sm font-bold">Till</span>
        <Link href="/pos/drawer" className="text-sm text-brand hover:underline">Back office →</Link>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 px-4 py-4 outline-none md:px-8">{children}</main>
    </div>
  );
}
