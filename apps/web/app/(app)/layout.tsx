"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { Sidebar } from "@/components/Sidebar";

/** Shared shell for all authenticated pages. Guards auth once here. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { me, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [me, loading, router]);

  if (loading || !me) return <main className="grid min-h-screen place-items-center text-fg-subtle">Loading…</main>;

  return (
    <div className="grid min-h-screen grid-cols-[220px_1fr]">
      <Sidebar />
      <main className="p-6">{children}</main>
    </div>
  );
}
