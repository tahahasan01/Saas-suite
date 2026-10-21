"use client";

import { useCallback, useEffect, useState } from "react";
import type { BackfillReport, ContactReviewItem, LeadContact } from "@business-os/types";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { errorText, useAction } from "@/lib/useAction";
import { Badge, Button, Card, EmptyState, ErrorState, LoadingRows } from "@/components/ui";
import { useContactLabels } from "@/components/contacts/labels";

const REASON = {
  shared_phone: "Number shared by many records",
  name_mismatch: "Same number, different name",
} as const;

/** Leads the contacts backfill wouldn't link on its own (docs §7.1): a
 *  number many people share, or the same number under another name. Each is
 *  a person's call: link to one of the candidates, make a new record, or
 *  leave the lead without one. */
export default function ContactReviewPage() {
  const { one, many } = useContactLabels();
  const [items, setItems] = useState<ContactReviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api<ContactReviewItem[]>("/contacts/review")
      .then(setItems)
      .catch((e) => setError(errorText(e, "Couldn't load the review queue.")));
  }, []);
  useEffect(load, [load]);

  const backfill = useAction(() => api<BackfillReport>("/contacts/backfill", { method: "POST" }), {
    success: (r) => {
      const rep = r as BackfillReport;
      return `${rep.contacts_created} created, ${rep.leads_linked} linked, ${rep.queued} to review`;
    },
    failure: "Couldn't run it",
  });
  const qualify = useAction(
    (leadId: string, body: Record<string, unknown>) =>
      api<LeadContact>(`/crm/leads/${leadId}/qualify`, { method: "POST", body: JSON.stringify(body) }),
    { success: "Done", failure: "Couldn't save" },
  );
  const dismiss = useAction((itemId: string) => api(`/contacts/review/${itemId}/dismiss`, { method: "POST" }),
    { success: "Left without a record", failure: "Couldn't dismiss" });
  const busy = qualify.busy || dismiss.busy;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">Leads that need a person to decide which {one.toLowerCase()} they are.</p>
        <Can perm="contacts.contact.merge">
          <Button variant="subtle" disabled={backfill.busy} onClick={async () => { if (await backfill.run()) load(); }}>
            {backfill.busy ? "Working…" : `Create ${many.toLowerCase()} from leads`}
          </Button>
        </Can>
      </div>
      {error ? <ErrorState message={error} onRetry={load} /> : !items ? <LoadingRows rows={3} label="Loading review queue" /> : items.length === 0 ? (
        <EmptyState title="Nothing to review" hint="Every lead with a phone or email is linked, or was set aside." />
      ) : (
        <ul className="space-y-3" data-testid="review-queue">
          {items.map((it) => (
            <li key={it.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{it.lead_name}</p>
                    <p className="text-sm text-fg-muted">{[it.lead_phone, it.lead_email].filter(Boolean).join(" · ")}</p>
                  </div>
                  <Badge tone="warning">{REASON[it.reason]}</Badge>
                </div>
                {it.candidates.length > 0 && (
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {it.candidates.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span>{c.name}{c.company_name && <span className="ms-2 text-fg-muted">{c.company_name}</span>}</span>
                        <Button size="sm" variant="subtle" disabled={busy}
                                onClick={async () => { if (await qualify.run(it.lead_id, { mode: "link", contact_id: c.id })) load(); }}>
                          Link to {c.name}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                  <Button size="sm" disabled={busy}
                          onClick={async () => { if (await qualify.run(it.lead_id, { mode: "create", force: true })) load(); }}>
                    New {one.toLowerCase()}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy}
                          onClick={async () => { if (await dismiss.run(it.id)) load(); }}>
                    Leave unlinked
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
