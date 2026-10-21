"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CONTACT_ROLES, type Contact, type ContactDuplicate, type Tag } from "@business-os/types";
import { api, ApiError } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import { Dialog } from "@/components/Dialog";
import { Button, cx, Field, Input, Select, Textarea } from "@/components/ui";
import { ROLE_LABELS, TAG_DOT, useContactLabels } from "./labels";

export function TagChip({ tag }: { tag: Pick<Tag, "name" | "color"> }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-elevated px-1.5 py-0.5 text-[11px] font-medium text-fg">
      <span aria-hidden className={cx("h-1.5 w-1.5 rounded-full", TAG_DOT[tag.color] ?? TAG_DOT.slate)} />
      {tag.name}
    </span>
  );
}

type Form = {
  kind: "person" | "company";
  name: string;
  company_id: string;
  company_name: string;
  job_title: string;
  phone: string;
  email: string;
  city: string;
  ntn: string;
  strn: string;
  roles: string[];
  tag_ids: string[];
  notes: string;
};

function initial(c?: Contact, kind: "person" | "company" = "person"): Form {
  return {
    kind: c?.kind ?? kind,
    name: c?.name ?? "",
    company_id: c?.company_id ?? "",
    company_name: c && !c.company_id ? c.company_name : "",
    job_title: c?.job_title ?? "",
    phone: c?.phone ?? "",
    email: c?.email ?? "",
    city: c?.city ?? "",
    ntn: c?.ntn ?? "",
    strn: c?.strn ?? "",
    roles: c?.roles ?? [],
    tag_ids: c?.tags.map((t) => t.id) ?? [],
    notes: c?.notes ?? "",
  };
}

/** New or edit, in one dialog. A create that matches someone on phone, email
 *  or NTN shows who, with "Save anyway" for a genuinely different person
 *  (families share numbers). */
export function ContactForm({ open, contact, onClose, onSaved }: {
  open: boolean;
  contact?: Contact;
  onClose: () => void;
  onSaved: (c: Contact) => void;
}) {
  const { one } = useContactLabels();
  const [f, setF] = useState<Form>(() => initial(contact));
  const [companies, setCompanies] = useState<Contact[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [dups, setDups] = useState<ContactDuplicate[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setF(initial(contact));
    setDups(null);
    // Pickers are conveniences: if they fail the form still works with free text.
    api<Contact[]>("/contacts?kind=company&limit=200").then(setCompanies).catch(() => setCompanies([]));
    api<Tag[]>("/tags").then(setTags).catch(() => setTags([]));
  }, [open, contact]);

  const save = useAction(async (force: boolean) => {
    const body = {
      kind: f.kind, name: f.name, job_title: f.job_title, phone: f.phone, email: f.email, city: f.city,
      ntn: f.ntn, strn: f.strn, roles: f.roles, tag_ids: f.tag_ids, notes: f.notes,
      company_id: f.kind === "person" && f.company_id ? f.company_id : null,
      company_name: f.kind === "person" && !f.company_id ? f.company_name : "",
    };
    try {
      return contact
        ? await api<Contact>(`/contacts/${contact.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : await api<Contact>("/contacts", { method: "POST", body: JSON.stringify({ ...body, force }) });
    } catch (e) {
      const detail = e instanceof ApiError ? (e.detail as { duplicates?: ContactDuplicate[] }) : null;
      if (e instanceof ApiError && e.status === 409 && detail?.duplicates) {
        setDups(detail.duplicates);
        e.handled = true; // shown in the form, not as a toast
      }
      throw e;
    }
  }, { success: contact ? "Saved" : `${one} added`, failure: contact ? "Couldn't save" : `Couldn't add the ${one.toLowerCase()}` });

  async function submit(force: boolean) {
    const saved = await save.run(force);
    if (saved) onSaved(saved);
  }

  const toggle = (key: "roles" | "tag_ids", v: string) =>
    setF((cur) => ({ ...cur, [key]: cur[key].includes(v) ? cur[key].filter((x) => x !== v) : [...cur[key], v] }));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={contact ? `Edit ${contact.name}` : `New ${one.toLowerCase()}`}
      dismissible={false}
      size="lg"
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="contact-form" disabled={save.busy}>{save.busy ? "Saving…" : "Save"}</Button>
        </>
      }
    >
      <form id="contact-form" onSubmit={(e) => { e.preventDefault(); void submit(false); }} className="space-y-4">
        {!contact && (
          <div role="radiogroup" aria-label="Kind" className="inline-flex rounded-lg border border-line p-0.5">
            {(["person", "company"] as const).map((k) => (
              <button
                key={k} type="button" role="radio" aria-checked={f.kind === k}
                onClick={() => setF({ ...f, kind: k })}
                className={cx("rounded-md px-3 py-1.5 text-sm pointer-coarse:min-h-11",
                  f.kind === k ? "bg-brand text-brand-fg" : "text-fg-muted hover:text-fg")}
              >
                {k === "person" ? "Person" : "Company"}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={160} />
          </Field>
          {f.kind === "person" ? (
            <Field label="Company">
              {companies.length > 0 ? (
                <Select value={f.company_id} onChange={(e) => setF({ ...f, company_id: e.target.value })}>
                  <option value="">None, or type below</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              ) : (
                <Input value={f.company_name} onChange={(e) => setF({ ...f, company_name: e.target.value })} />
              )}
            </Field>
          ) : (
            <Field label="City">
              <Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
            </Field>
          )}
          <Field label="Phone">
            <Input type="tel" inputMode="tel" placeholder="0300 1234567" value={f.phone}
                   onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          {f.kind === "person" && (
            <>
              <Field label="Job title">
                <Input value={f.job_title} onChange={(e) => setF({ ...f, job_title: e.target.value })} />
              </Field>
              <Field label="City">
                <Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
              </Field>
            </>
          )}
          <Field label="NTN">
            <Input value={f.ntn} onChange={(e) => setF({ ...f, ntn: e.target.value })} maxLength={20} />
          </Field>
          <Field label="STRN">
            <Input value={f.strn} onChange={(e) => setF({ ...f, strn: e.target.value })} maxLength={20} />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-fg-muted">Roles</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {CONTACT_ROLES.map((r) => (
              <label key={r} className="inline-flex items-center gap-1.5 text-sm pointer-coarse:min-h-11">
                <input type="checkbox" checked={f.roles.includes(r)} onChange={() => toggle("roles", r)} />
                {ROLE_LABELS[r]}
              </label>
            ))}
          </div>
        </fieldset>
        {tags.length > 0 && (
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-fg-muted">Tags</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {tags.map((t) => (
                <label key={t.id} className="inline-flex items-center gap-1.5 text-sm pointer-coarse:min-h-11">
                  <input type="checkbox" checked={f.tag_ids.includes(t.id)} onChange={() => toggle("tag_ids", t.id)} />
                  <TagChip tag={t} />
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <Field label="Notes">
          <Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>

        {dups && (
          <div role="alert" className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <p className="font-medium">This looks like someone you already have:</p>
            <ul className="space-y-1">
              {dups.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2">
                  <Link href={`/contacts/${d.id}`} className="font-medium text-brand hover:underline">{d.name}</Link>
                  <span className="text-xs text-fg-muted">same {d.reason}{d.archived ? " · archived" : ""}</span>
                </li>
              ))}
            </ul>
            <Button size="sm" variant="subtle" type="button" disabled={save.busy} onClick={() => void submit(true)}>
              It&apos;s a different person — save anyway
            </Button>
          </div>
        )}
      </form>
    </Dialog>
  );
}
