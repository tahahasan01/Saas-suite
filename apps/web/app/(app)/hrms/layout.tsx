"use client";

import { usePathname } from "next/navigation";
import { Card } from "@/components/ui";
import { HrmsSummaryProvider, useHrmsSummary } from "./summary";

export default function HrmsLayout({ children }: { children: React.ReactNode }) {
  return (
    <HrmsSummaryProvider>
      <Tiles />
      {children}
    </HrmsSummaryProvider>
  );
}

function Tiles() {
  const pathname = usePathname();
  const { summary: s, error, refresh } = useHrmsSummary();
  // Payroll lives under /hrms but is its own module; staff tiles don't belong there.
  if (pathname.startsWith("/hrms/payroll")) return null;
  if (!s && error) {
    return (
      <p role="status" className="mb-6 text-sm text-fg-muted">
        {error}{" "}
        <button type="button" onClick={refresh} className="text-brand hover:underline">Try again</button>
      </p>
    );
  }
  if (!s) return null;
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile label="Headcount" value={s.headcount} />
      <Tile label="Present today" value={s.present_today} accent />
      <Tile label="On leave" value={s.on_leave_today} />
      <Tile label="Pending leaves" value={s.pending_leaves} />
    </div>
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
