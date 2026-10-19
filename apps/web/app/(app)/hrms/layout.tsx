"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { HrmsSummary } from "@business-os/types";
import { api } from "@/lib/api";
import { Card } from "@/components/ui";

export default function HrmsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [s, setS] = useState<HrmsSummary | null>(null);
  // Payroll lives under /hrms but is its own module; staff tiles don't belong there.
  const onPayroll = pathname.startsWith("/hrms/payroll");

  useEffect(() => {
    api<HrmsSummary>("/hrms/summary").then(setS).catch(() => {});
  }, [pathname]);

  return (
    <>
      {s && !onPayroll && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Headcount" value={s.headcount} />
          <Tile label="Present today" value={s.present_today} accent />
          <Tile label="On leave" value={s.on_leave_today} />
          <Tile label="Pending leaves" value={s.pending_leaves} />
        </div>
      )}
      {children}
    </>
  );
}

function Tile({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <Card>
      <p className="text-xs text-fg-subtle">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent ? "text-brand" : ""}`}>{value}</p>
    </Card>
  );
}
