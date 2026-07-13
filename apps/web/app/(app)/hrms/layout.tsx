"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { HrmsSummary } from "@business-os/types";
import { api } from "@/lib/api";
import { Card } from "@/components/ui";

const tabs = [
  { href: "/hrms", label: "Team" },
  { href: "/hrms/attendance", label: "Attendance" },
  { href: "/hrms/leave", label: "Leave" },
  { href: "/hrms/payroll", label: "Payroll" },
];

export default function HrmsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [s, setS] = useState<HrmsSummary | null>(null);

  useEffect(() => {
    api<HrmsSummary>("/hrms/summary").then(setS).catch(() => {});
  }, [pathname]);

  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Staff</h1>
      {s && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Headcount" value={s.headcount} />
          <Tile label="Present today" value={s.present_today} accent />
          <Tile label="On leave" value={s.on_leave_today} />
          <Tile label="Pending leaves" value={s.pending_leaves} />
        </div>
      )}
      <div className="mb-6 flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href}
                className={`px-3 py-2 text-sm ${pathname === t.href ? "border-b-2 border-brand text-fg" : "text-fg-muted hover:text-fg"}`}>
            {t.label}
          </Link>
        ))}
      </div>
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
