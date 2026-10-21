"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Activity } from "@business-os/types";
import { api } from "@/lib/api";
import { dayPKT } from "@/lib/dates";
import { formatDay } from "@/lib/format";
import { useCan } from "@/lib/can";
import { errorText } from "@/lib/useAction";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui";
import { ActivityActions, addDays, TypeIcon } from "@/components/crm/bits";

type Who = "me" | "all";

/** My Day (D-32): overdue, today, and the next seven days — each row one tap
 *  from done or snoozed. */
export default function MyDayPage() {
  const can = useCan();
  const [who, setWho] = useState<Who>("me");
  const [items, setItems] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api<Activity[]>(`/activities?assigned=${who}`)
      .then(setItems)
      .catch((e) => setError(errorText(e, "Couldn't load your activities.")));
  }, [who]);
  useEffect(load, [load]);

  const groups = useMemo(() => {
    const today = dayPKT();
    const weekOut = addDays(today, 7);
    const list = items ?? [];
    return [
      { key: "overdue", title: "Overdue", rows: list.filter((a) => a.state === "overdue") },
      { key: "today", title: "Today", rows: list.filter((a) => a.state === "today") },
      { key: "upcoming", title: "Next 7 days", rows: list.filter((a) => a.state === "planned" && a.due_date <= weekOut) },
    ];
  }, [items]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (items === null) return <LoadingRows label="Loading your day" />;

  const nothing = groups.every((g) => g.rows.length === 0);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">Follow-ups planned on your leads. Finish them here or snooze them.</p>
        <div className="flex rounded-lg border border-line p-0.5" role="tablist" aria-label="Whose activities">
          {(["me", "all"] as Who[]).map((w) => (
            <button
              key={w}
              type="button"
              role="tab"
              aria-selected={who === w}
              onClick={() => setWho(w)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors pointer-coarse:min-h-10 pointer-coarse:px-4 ${
                who === w ? "bg-elevated text-fg" : "text-fg-muted hover:text-fg"
              }`}
            >
              {w === "me" ? "Mine" : "Team"}
            </button>
          ))}
        </div>
      </div>

      {nothing ? (
        <EmptyState
          title="Nothing due"
          hint="Plan the next step from a lead's drawer (Activities → Schedule) and it shows up here."
        />
      ) : (
        groups.map((g) => g.rows.length > 0 && (
          <section key={g.key} aria-labelledby={`grp-${g.key}`}>
            <h2 id={`grp-${g.key}`} className={`mb-2 text-sm font-semibold ${g.key === "overdue" ? "text-danger" : "text-fg"}`}>
              {g.title} <span className="font-normal text-fg-subtle">({g.rows.length})</span>
            </h2>
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {g.rows.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-elevated text-fg-muted">
                      <TypeIcon icon={a.type_icon} size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium" title={a.summary}>{a.summary}</span>
                      <span className="block truncate text-xs text-fg-subtle">
                        {a.type_name}
                        {a.entity_name && ` · ${a.entity_name}`}
                        {` · ${formatDay(a.due_date)}`}
                        {who === "all" && a.assigned_name && ` · ${a.assigned_name}`}
                      </span>
                    </span>
                  </span>
                  {can("crm.activity.manage") && <ActivityActions activity={a} onChanged={load} />}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
