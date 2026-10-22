"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { errorText } from "@/lib/useAction";
import { EmptyState, ErrorState, Input, LoadingRows } from "@/components/ui";

type Person = Schema<"OrgChartPerson">;

/** The org chart (wave A, H2), drawn from each person's manager: top-level
 *  people first, their reports nested below. Search jumps to a person and
 *  their chain of managers. */
export default function OrgChart() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    api<Person[]>("/hrms/org-chart").then(setPeople).catch((e) => setError(errorText(e)));
  }, []);

  const byManager = useMemo(() => {
    const m = new Map<string | null, Person[]>();
    const ids = new Set((people ?? []).map((p) => p.id));
    for (const p of people ?? []) {
      // A manager who left (or isn't active) puts their reports at the top.
      const key = p.manager_id && ids.has(p.manager_id) ? p.manager_id : null;
      m.set(key, [...(m.get(key) ?? []), p]);
    }
    return m;
  }, [people]);

  // A search shows the matches and everyone above them.
  const visible = useMemo(() => {
    if (!q.trim() || !people) return null;
    const byId = new Map(people.map((p) => [p.id, p]));
    const keep = new Set<string>();
    for (const p of people) {
      if (!p.name.toLowerCase().includes(q.trim().toLowerCase())) continue;
      for (let cur: Person | undefined = p; cur && !keep.has(cur.id); cur = cur.manager_id ? byId.get(cur.manager_id) : undefined) {
        keep.add(cur.id);
      }
    }
    return keep;
  }, [q, people]);

  if (error) return <ErrorState message={error} />;
  if (people === null) return <LoadingRows rows={4} label="Loading the org chart" />;
  if (people.length === 0) return <EmptyState title="No staff yet" />;
  const noManagers = people.every((p) => !p.manager_id);

  return (
    <div className="space-y-4">
      <div className="w-full sm:w-64">
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find someone…" aria-label="Find someone" />
      </div>
      {noManagers && (
        <p className="text-sm text-fg-muted">Nobody has a manager yet. Set each person&apos;s manager on their profile under Job, and the chart builds itself.</p>
      )}
      <Branch parent={null} depth={0} byManager={byManager} visible={visible} />
    </div>
  );
}

function Branch({ parent, depth, byManager, visible }: {
  parent: string | null; depth: number; byManager: Map<string | null, Person[]>; visible: Set<string> | null;
}) {
  const kids = (byManager.get(parent) ?? []).filter((p) => !visible || visible.has(p.id));
  if (kids.length === 0) return null;
  return (
    <ul aria-label={depth === 0 ? "Org chart" : undefined}
        className={depth === 0 ? "space-y-2" : "ms-5 mt-2 space-y-2 border-s border-line ps-4"}>
      {kids.map((p) => (
        <li key={p.id}>
          <Link href={`/hrms/employees/${p.id}`}
                className="inline-flex min-w-56 flex-col rounded-lg border border-line bg-surface px-3 py-2 hover:border-brand/50">
            <span className="text-sm font-medium">{p.name}</span>
            <span className="text-xs text-fg-muted">{[p.job_title, p.department].filter(Boolean).join(" · ") || "—"}
              {p.reports > 0 && ` · ${p.reports} report${p.reports === 1 ? "" : "s"}`}</span>
          </Link>
          <Branch parent={p.id} depth={depth + 1} byManager={byManager} visible={visible} />
        </li>
      ))}
    </ul>
  );
}
