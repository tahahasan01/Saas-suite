"use client";

import { useEffect, useMemo, useState } from "react";
import type { Contact, MergePreview, MergeResult } from "@business-os/types";
import { api } from "@/lib/api";
import { errorText, useAction } from "@/lib/useAction";
import { Dialog } from "@/components/Dialog";
import { Button, cx, ErrorState, Field, Input, LoadingRows } from "@/components/ui";
import { useContactLabels } from "./labels";

const FIELD_LABELS: Record<string, string> = {
  name: "Name", company_id: "Company", company_name: "Company", job_title: "Job title", phone: "Phone",
  email: "Email", ntn: "NTN", strn: "STRN", city: "City", source: "Source", notes: "Notes", owner_id: "Owner",
};

function show(c: Contact, field: string): string {
  if (field === "company_id") return c.company_name || "—";
  if (field === "owner_id") return c.owner_id ? "Assigned" : "—";
  const v = (c as unknown as Record<string, unknown>)[field];
  return typeof v === "string" && v ? v : "—";
}

/** Side by side: pick the record to keep, a value for each field that
 *  differs, see what moves, and type MERGE to confirm (St02 §6.11). The
 *  others are archived and point at the one kept; nothing is deleted. */
export function MergeDialog({ ids, onClose, onMerged }: {
  ids: string[];
  onClose: () => void;
  onMerged: (winnerId: string) => void;
}) {
  const { many } = useContactLabels();
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [winner, setWinner] = useState(ids[0]);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [typed, setTyped] = useState("");

  useEffect(() => {
    setError(null);
    api<MergePreview>("/contacts/merge/preview", { method: "POST", body: JSON.stringify({ ids }) })
      .then(setPreview)
      .catch((e) => setError(errorText(e, "Couldn't load these records.")));
  }, [ids]);

  const merge = useAction(
    () => api<MergeResult>("/contacts/merge", {
      method: "POST",
      body: JSON.stringify({
        winner_id: winner,
        loser_ids: ids.filter((i) => i !== winner),
        field_choices: Object.fromEntries(Object.entries(choices).filter(([, src]) => src !== winner)),
      }),
    }),
    { success: (r) => `Merged ${(r as MergeResult).merged_ids.length + 1} records`, failure: "Couldn't merge" },
  );

  const fields = useMemo(() => (preview?.differing_fields ?? []).filter((f) => f !== "company_name"), [preview]);
  const moving = useMemo(() => {
    if (!preview) return null;
    const sum = { leads: 0, sales: 0, invoices: 0, people: 0 };
    for (const id of ids) {
      if (id === winner) continue;
      const c = preview.counts[id];
      if (c) { sum.leads += c.leads; sum.sales += c.sales; sum.invoices += c.invoices; sum.people += c.people; }
    }
    return sum;
  }, [preview, ids, winner]);

  async function confirm() {
    const done = await merge.run();
    if (done) onMerged(winner);
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Merge ${ids.length} ${many.toLowerCase()}`}
      description="The record you keep gets everything; the others are archived and point to it."
      size="lg"
      dismissible={false}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={!preview || typed.trim().toUpperCase() !== "MERGE" || merge.busy} onClick={() => void confirm()}>
            {merge.busy ? "Merging…" : "Merge"}
          </Button>
        </>
      }
    >
      {error ? <ErrorState message={error} /> : !preview ? <LoadingRows rows={3} label="Loading records" /> : (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-sm">
              <caption className="sr-only">Records to merge</caption>
              <thead>
                <tr>
                  <th scope="col" className="px-2 py-1.5 text-start text-xs font-medium text-fg-muted">Keep</th>
                  {preview.contacts.map((c) => (
                    <th key={c.id} scope="col" className="px-2 py-1.5 text-start">
                      <label className="inline-flex items-center gap-1.5 font-medium pointer-coarse:min-h-11">
                        <input type="radio" name="winner" checked={winner === c.id} onChange={() => setWinner(c.id)} />
                        {c.name}
                      </label>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fields.map((field) => (
                  <tr key={field} className="border-t border-line">
                    <th scope="row" className="px-2 py-1.5 text-start text-xs font-medium text-fg-muted">{FIELD_LABELS[field] ?? field}</th>
                    {preview.contacts.map((c) => {
                      const chosen = (choices[field] ?? winner) === c.id;
                      return (
                        <td key={c.id} className="px-2 py-1.5">
                          <label className={cx("inline-flex items-center gap-1.5 pointer-coarse:min-h-11", chosen && "font-medium")}>
                            <input type="radio" name={`f-${field}`} checked={chosen} disabled={show(c, field) === "—"}
                                   onChange={() => setChoices({ ...choices, [field]: c.id })} />
                            <span className="max-w-48 truncate" title={show(c, field)}>{show(c, field)}</span>
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {fields.length === 0 && (
                  <tr className="border-t border-line"><td colSpan={preview.contacts.length + 1} className="px-2 py-2 text-fg-muted">
                    No differing fields: the details already agree.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          {moving && (
            <p className="text-sm text-fg-muted" data-testid="merge-moving">
              Moving to the record you keep: {moving.leads} deals, {moving.sales} sales, {moving.invoices} invoices
              {moving.people > 0 && `, ${moving.people} people`}. Tags, roles, addresses and history come along.
            </p>
          )}
          <Field label='Type MERGE to confirm'>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="max-w-40" />
          </Field>
        </div>
      )}
    </Dialog>
  );
}
