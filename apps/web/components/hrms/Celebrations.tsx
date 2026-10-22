"use client";

import { useEffect, useState } from "react";
import { Cake, PartyPopper } from "lucide-react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { dayPKT } from "@/lib/dates";
import { formatDay } from "@/lib/format";
import { Card } from "@/components/ui";

type C = Schema<"Celebration">;

/** Birthdays and work anniversaries coming up (wave A, H20). Birthdays never
 *  show a year. Renders nothing when there's nothing to celebrate. */
export function Celebrations({ path }: { path: string }) {
  const [rows, setRows] = useState<C[]>([]);
  useEffect(() => {
    api<C[]>(`${path}?days=30`, { notify: false }).then(setRows).catch(() => setRows([]));
  }, [path]);
  if (rows.length === 0) return null;
  const today = dayPKT();
  return (
    <Card className="space-y-2">
      <h2 className="text-sm font-semibold">Coming up</h2>
      <ul className="space-y-1.5 text-sm" aria-label="Celebrations">
        {rows.slice(0, 8).map((c) => (
          <li key={`${c.kind}-${c.employee_id}`} className="flex items-center gap-2">
            {c.kind === "birthday" ? <Cake size={14} className="text-brand" aria-hidden /> : <PartyPopper size={14} className="text-warning" aria-hidden />}
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{c.name}</span>{" "}
              {c.kind === "birthday" ? "birthday" : `${c.years} year${c.years === 1 ? "" : "s"} with the team`}
            </span>
            <span className={c.date === today ? "text-xs font-semibold text-brand" : "text-xs text-fg-muted"}>
              {c.date === today ? "Today" : formatDay(c.date)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
