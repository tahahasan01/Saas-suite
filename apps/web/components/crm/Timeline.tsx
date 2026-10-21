"use client";

import { useState } from "react";
import type { TimelineChange, TimelineEvent, TimelinePage } from "@business-os/types";
import { api } from "@/lib/api";
import { formatDay, money, timeAgo, formatDateTime } from "@/lib/format";
import { useAction } from "@/lib/useAction";
import { Button, Textarea } from "@/components/ui";

function show(c: TimelineChange, side: "old" | "new"): string {
  const label = side === "old" ? c.old_label : c.new_label;
  const v = side === "old" ? c.old : c.new;
  if (label) return label;
  if (v === null || v === undefined || v === "") return "nothing";
  if (c.field === "value_minor" && typeof v === "number") return money(v);
  if (c.field === "probability") return `${v}%`;
  if (c.field === "expected_close_date" && typeof v === "string") return formatDay(v);
  if (c.field === "priority") return `${v} star${v === 1 ? "" : "s"}`;
  return String(v);
}

function changeLine(c: TimelineChange): string {
  if (c.masked) return `${c.label} changed`;
  return `${c.label}: ${show(c, "old")} → ${show(c, "new")}`;
}

const OUTCOME: Record<string, string> = {
  interested: "interested", not_interested: "not interested", callback: "call back", busy: "busy",
};

function headline(e: TimelineEvent): string {
  const p = e.payload ?? {};
  switch (e.kind) {
    case "note": return "Note";
    case "call": {
      const ch = typeof p.channel === "string" ? p.channel : "contact";
      const out = typeof p.outcome === "string" ? ` · ${OUTCOME[p.outcome] ?? p.outcome}` : "";
      return `Logged ${ch}${out}`;
    }
    case "stage_change": {
      const c = e.changes.find((x) => x.field === "stage_id");
      return c ? `Moved from ${show(c, "old")} to ${show(c, "new")}` : "Moved";
    }
    case "won": return "Marked won";
    case "lost": {
      const r = e.changes.find((x) => x.field === "lost_reason_id")?.new_label;
      return r ? `Marked lost · ${r}` : "Marked lost";
    }
    case "restored": return "Restored";
    case "activity_done": {
      const out = typeof p.outcome === "string" ? ` · ${OUTCOME[p.outcome] ?? p.outcome}` : "";
      return `Done: ${String(p.summary ?? p.type_name ?? "activity")}${out}`;
    }
    case "system": return p.event === "created" ? "Created" : "Update";
    default: return "Updated";
  }
}

/** The changes worth listing under the headline (the headline already says
 *  the stage or the loss). */
function detailChanges(e: TimelineEvent): TimelineChange[] {
  if (e.kind === "field_change") return e.changes;
  if (e.kind === "stage_change") return e.changes.filter((c) => !["stage_id", "pipeline_id", "status", "probability"].includes(c.field));
  return [];
}

export function TimelineList({ leadId, first, onNoted }: {
  leadId: string; first: TimelineEvent[]; onNoted: () => void;
}) {
  const [more, setMore] = useState<TimelineEvent[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [note, setNote] = useState("");
  const items = [...first, ...more.filter((m) => !first.some((f) => f.id === m.id))];

  const addNote = useAction(
    () => api(`/crm/leads/${leadId}/notes`, { method: "POST", body: JSON.stringify({ body: note }) }),
    { success: "Note added", failure: "Couldn't add the note" },
  );
  const loadMore = useAction(async () => {
    const last = items[items.length - 1];
    if (!last) return;
    // The drawer's first page carries no cursor: fetch it again to get one.
    const start = cursor ?? (await api<TimelinePage>(`/crm/leads/${leadId}/timeline?limit=${first.length || 50}`)).next_cursor;
    if (!start) { setCursor(null); return; }
    const page = await api<TimelinePage>(`/crm/leads/${leadId}/timeline?cursor=${encodeURIComponent(start)}`);
    setMore((cur) => [...cur, ...page.items]);
    setCursor(page.next_cursor);
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    if ((await addNote.run()) !== undefined) { setNote(""); onNoted(); }
  }

  return (
    <section aria-labelledby={`tl-${leadId}`}>
      <h3 id={`tl-${leadId}`} className="mb-2 text-xs font-semibold text-fg-muted">Timeline</h3>
      <form onSubmit={submit} className="mb-4 space-y-2">
        <Textarea
          rows={2}
          aria-label="Add a note"
          placeholder="Add a note…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={4000}
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={addNote.busy || !note.trim()}>{addNote.busy ? "Saving…" : "Add note"}</Button>
        </div>
      </form>
      <ul className="space-y-3">
        {items.length === 0 && <li className="text-sm text-fg-subtle">Nothing here yet.</li>}
        {items.map((e) => (
          <li key={e.id} className="border-s-2 border-line ps-3 text-sm" data-kind={e.kind}>
            <p className="font-medium text-fg">{headline(e)}</p>
            {detailChanges(e).map((c) => (
              <p key={c.field} className="break-words text-xs text-fg-muted">{changeLine(c)}</p>
            ))}
            {e.body && <p className="whitespace-pre-line break-words text-fg-muted">{e.body}</p>}
            <p className="text-xs text-fg-subtle" title={formatDateTime(e.occurred_at)}>
              {timeAgo(e.occurred_at)}{e.actor_name && ` · ${e.actor_name}`}
            </p>
          </li>
        ))}
      </ul>
      {cursor !== null && items.length >= 50 && (
        <Button size="sm" variant="ghost" className="mt-3" disabled={loadMore.busy} onClick={() => loadMore.run()}>
          {loadMore.busy ? "Loading…" : "Show older"}
        </Button>
      )}
    </section>
  );
}
