"use client";

import { useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";

type Appraisal = Schema<"AppraisalOut">;

export const APPRAISAL_STATUS: Record<string, string> = {
  self_review: "Self review", manager_review: "Manager review", done: "Done", cancelled: "Cancelled",
};
const SCALE = ["1 · Poor", "2 · Below", "3 · Meets", "4 · Good", "5 · Excellent"];

/** Rate each KRA 1–5 with a note (wave C, H26). `side` says whose ratings
 *  are being written; the other side's show read-only beside them. Save
 *  keeps a draft; Send needs every KRA rated. */
export function AppraisalForm({ appraisal, side, url, onSaved }: {
  appraisal: Appraisal; side: "self" | "manager"; url: string; onSaved: (a: Appraisal) => void;
}) {
  const ratings = appraisal.ratings ?? [];
  const [vals, setVals] = useState(() => Object.fromEntries(ratings.map((r) => [r.id, {
    rating: (side === "self" ? r.self_rating : r.manager_rating) ?? null, note: side === "self" ? r.self_note : r.manager_note,
  }])));
  const [comment, setComment] = useState(side === "self" ? appraisal.self_comment : appraisal.manager_comment);
  const save = useAction(
    (submit: boolean) => api<Appraisal>(url, { method: "PUT", body: JSON.stringify({
      ratings: ratings.map((r) => ({ id: r.id, rating: vals[r.id].rating, note: vals[r.id].note })), comment, submit,
    }) }),
    { success: "Saved", failure: "Couldn't save" },
  );
  const all = ratings.every((r) => vals[r.id].rating != null);
  async function go(submit: boolean) {
    const a = await save.run(submit);
    if (a) onSaved(a);
  }
  return (
    <form aria-label={side === "self" ? "My ratings" : "Manager ratings"} className="space-y-3 text-sm"
          onSubmit={(e) => { e.preventDefault(); void go(true); }}>
      <ul className="space-y-3">
        {ratings.map((r) => (
          <li key={r.id} className="rounded-lg border border-line p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{r.title}</span><span className="text-xs text-fg-muted">weight {r.weight}%</span>
            </div>
            {r.description && <p className="text-xs text-fg-muted">{r.description}</p>}
            {side === "manager" && r.self_rating != null && (
              <p className="mt-1 text-xs text-fg-muted">Their own rating: {r.self_rating}{r.self_note ? ` · “${r.self_note}”` : ""}</p>
            )}
            <div className="mt-2 grid gap-2 sm:grid-cols-[12rem_1fr]">
              <Field label={`Rating for ${r.title}`}>
                <Select value={vals[r.id].rating ?? ""} onChange={(e) => setVals({ ...vals, [r.id]: { ...vals[r.id], rating: e.target.value ? Number(e.target.value) : null } })}>
                  <option value="">Not rated</option>
                  {SCALE.map((s, i) => <option key={s} value={i + 1}>{s}</option>)}
                </Select>
              </Field>
              <Field label="Note"><Input value={vals[r.id].note} maxLength={1000} onChange={(e) => setVals({ ...vals, [r.id]: { ...vals[r.id], note: e.target.value } })} /></Field>
            </div>
          </li>
        ))}
      </ul>
      <Field label={side === "self" ? "Anything to add" : "Overall comment"}>
        <Textarea rows={3} maxLength={4000} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" disabled={save.busy} onClick={() => void go(false)}>Save draft</Button>
        <Button type="submit" disabled={save.busy || !all}>{side === "self" ? "Send to my manager" : "Finish review"}</Button>
      </div>
    </form>
  );
}
