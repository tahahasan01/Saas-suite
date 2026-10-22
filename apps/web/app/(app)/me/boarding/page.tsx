"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { Button, EmptyState, ErrorState, LoadingRows } from "@/components/ui";

type Task = Schema<"MyBoardingTask">;

/** The tasks HR left for me while I join or leave (wave C, H23/H24). */
export default function MyChecklist() {
  const [rows, setRows] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api<Task[]>("/me/boarding").then(setRows).catch((e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);
  const done = useAction((t: Task) => api(`/me/boarding-tasks/${t.id}/done`, { method: "POST" }),
                         { success: "Marked done", failure: "Couldn't mark it" });
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (rows === null) return <LoadingRows rows={2} label="Loading your checklist" />;
  if (rows.length === 0) return <EmptyState title="Nothing to do" hint="When you join or leave, HR's tasks for you show here." />;
  return (
    <ul className="mx-auto max-w-2xl divide-y divide-line rounded-xl border border-line bg-surface text-sm" aria-label="My checklist">
      {rows.map((t) => (
        <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
          <span className="min-w-0">
            <span className={t.status === "open" ? "font-medium" : "text-fg-muted line-through"}>{t.title}</span>
            <span className="block text-xs text-fg-muted">
              {t.kind === "onboarding" ? "Joining" : "Leaving"}{t.due_on ? ` · by ${formatDay(t.due_on)}` : ""}
            </span>
          </span>
          {t.status === "open" && (
            <Button size="sm" variant="subtle" disabled={done.busy}
                    onClick={async () => { if ((await done.run(t)) !== undefined) load(); }} aria-label={`Done: ${t.title}`}>Done</Button>
          )}
        </li>
      ))}
    </ul>
  );
}
