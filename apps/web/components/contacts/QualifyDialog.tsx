"use client";

import { useEffect, useState } from "react";
import type { Contact, ContactDuplicate, LeadContact } from "@business-os/types";
import { api, ApiError } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import { Dialog } from "@/components/Dialog";
import { Button, cx, Field, Input } from "@/components/ui";
import { useContactLabels } from "./labels";

type LeadLite = { id: string; name: string; phone: string; email: string; company: string };

/** Qualify a lead (D-31): link it to an existing contact, or create the
 *  contact from the lead's details. A create that matches someone on phone
 *  or email offers them first, so the contact book doesn't fill with
 *  duplicates. */
export function QualifyDialog({ lead, onClose, onQualified }: {
  lead: LeadLite;
  onClose: () => void;
  onQualified: (contact: Contact) => void;
}) {
  const { one } = useContactLabels();
  const [mode, setMode] = useState<"create" | "link">("create");
  const [withCompany, setWithCompany] = useState(!!lead.company.trim());
  const [q, setQ] = useState(lead.phone || lead.name);
  const [found, setFound] = useState<Contact[] | null>(null);
  const [dups, setDups] = useState<ContactDuplicate[] | null>(null);

  useEffect(() => {
    if (mode !== "link") return;
    const term = q.trim();
    if (!term) { setFound([]); return; }
    const timer = setTimeout(() => {
      api<Contact[]>(`/contacts?q=${encodeURIComponent(term)}&limit=10`).then(setFound).catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [q, mode]);

  const qualify = useAction(async (body: Record<string, unknown>) => {
    try {
      return await api<LeadContact>(`/crm/leads/${lead.id}/qualify`, { method: "POST", body: JSON.stringify(body) });
    } catch (e) {
      const detail = e instanceof ApiError ? (e.detail as { duplicates?: ContactDuplicate[] }) : null;
      if (e instanceof ApiError && e.status === 409 && detail?.duplicates) {
        setDups(detail.duplicates);
        e.handled = true; // shown in the dialog
      }
      throw e;
    }
  }, { success: "Qualified", failure: "Couldn't qualify" });

  async function run(body: Record<string, unknown>) {
    const done = await qualify.run(body);
    if (done) onQualified(done.contact);
  }

  const create = (force = false) => run({ mode: "create", create_company: withCompany, force });
  const link = (contactId: string) => run({ mode: "link", contact_id: contactId });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Qualify ${lead.name}`}
      description={`Link this lead to a ${one.toLowerCase()}, or create one from it.`}
      footer={mode === "create" ? (
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={qualify.busy} onClick={() => void create(false)}>
            {qualify.busy ? "Saving…" : `Create ${one.toLowerCase()}`}
          </Button>
        </>
      ) : <Button variant="ghost" onClick={onClose}>Cancel</Button>}
    >
      <div className="space-y-4">
        <div role="radiogroup" aria-label="How" className="inline-flex rounded-lg border border-line p-0.5">
          {([["create", "Create new"], ["link", "Link existing"]] as const).map(([k, label]) => (
            <button
              key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => { setMode(k); setDups(null); }}
              className={cx("rounded-md px-3 py-1.5 text-sm pointer-coarse:min-h-11",
                mode === k ? "bg-brand text-brand-fg" : "text-fg-muted hover:text-fg")}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "create" ? (
          <div className="space-y-3 text-sm">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
              <dt className="text-xs text-fg-subtle">Name</dt><dd>{lead.name}</dd>
              <dt className="text-xs text-fg-subtle">Phone</dt><dd>{lead.phone || "—"}</dd>
              <dt className="text-xs text-fg-subtle">Email</dt><dd className="truncate">{lead.email || "—"}</dd>
              <dt className="text-xs text-fg-subtle">Company</dt><dd>{lead.company || "—"}</dd>
            </dl>
            {lead.company.trim() && (
              <label className="inline-flex items-center gap-2 pointer-coarse:min-h-11">
                <input type="checkbox" checked={withCompany} onChange={(e) => setWithCompany(e.target.checked)} />
                Also add {lead.company} as a company (or join it if it exists)
              </label>
            )}
            {dups && (
              <div role="alert" className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
                <p className="font-medium">Someone with this phone or email already exists:</p>
                <ul className="space-y-1">
                  {dups.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span><span className="font-medium">{d.name}</span> <span className="text-xs text-fg-muted">same {d.reason}</span></span>
                      <Button size="sm" disabled={qualify.busy} onClick={() => void link(d.id)}>Link to {d.name}</Button>
                    </li>
                  ))}
                </ul>
                <Button size="sm" variant="subtle" disabled={qualify.busy} onClick={() => void create(true)}>
                  It&apos;s someone else — create anyway
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <Field label={`Find a ${one.toLowerCase()} (name, phone, email or NTN)`}>
              <Input value={q} onChange={(e) => setQ(e.target.value)} />
            </Field>
            <ul className="space-y-1.5" aria-live="polite">
              {found?.length === 0 && <li className="text-sm text-fg-subtle">No matches.</li>}
              {found?.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-fg-muted">{[c.phone, c.email, c.company_name].filter(Boolean).join(" · ")}</span>
                  </span>
                  <Button size="sm" disabled={qualify.busy} onClick={() => void link(c.id)}>Link</Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  );
}
