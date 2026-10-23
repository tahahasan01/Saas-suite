"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ADDRESS_KINDS, type ContactDetail, type ContactDuplicate, type TimelineItem } from "@business-os/types";
import { api } from "@/lib/api";
import { Can, useCan } from "@/lib/can";
import { formatDate, money, relativeDate } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { useConfirm } from "@/components/Confirm";
import { Badge, Button, Card, cx, EmptyState, ErrorState, Field, Input, LoadingRows, Select, Textarea } from "@/components/ui";
import { CustomFieldValues, useCustomFields } from "@/components/CustomFields";
import { ConsentCard } from "@/components/contacts/ConsentCard";
import { ContactForm, TagChip } from "@/components/contacts/ContactForm";
import { MergeDialog } from "@/components/contacts/MergeDialog";
import { RecordActivities } from "@/components/crm/bits";
import { ROLE_LABELS, telHref, useContactLabels, whatsappHref } from "@/components/contacts/labels";

type Tab = "timeline" | "deals" | "sales" | "invoices" | "activities" | "details";
const invTone: Record<string, "neutral" | "warning" | "brand" | "success" | "danger"> = {
  draft: "neutral", pending_approval: "warning", issued: "brand", partially_paid: "warning", paid: "success", void: "danger",
};

export default function ContactPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const can = useCan();
  const confirm = useConfirm();
  const { one } = useContactLabels();
  const [data, setData] = useState<ContactDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("timeline");
  const [editing, setEditing] = useState(false);
  const [dups, setDups] = useState<ContactDuplicate[] | null>(null);
  const [mergeWith, setMergeWith] = useState<string | null>(null);
  const [timelineKey, setTimelineKey] = useState(0);

  const load = useCallback(() => {
    setError(null);
    api<ContactDetail>(`/contacts/${id}`)
      .then(setData)
      .catch((e) => setError(errorText(e, `Couldn't load this ${one.toLowerCase()}.`)));
  }, [id, one]);
  useEffect(load, [load]);

  const archive = useAction(() => api(`/contacts/${id}`, { method: "DELETE" }), { success: "Archived", failure: "Couldn't archive" });
  const restore = useAction(() => api(`/contacts/${id}/restore`, { method: "POST" }), { success: "Restored", failure: "Couldn't restore" });

  async function onArchive() {
    const done = await confirm({
      title: `Archive ${data?.contact.name}?`,
      body: "They leave the list and the till's lookup. Sales, invoices and history stay, and you can restore them any time.",
      confirmLabel: "Archive",
      busyLabel: "Archiving…",
      run: () => archive.run(),
    });
    if (done) load();
  }

  async function findDuplicates() {
    try {
      setDups((await api<{ duplicates: ContactDuplicate[] }>(`/contacts/${id}/duplicates`)).duplicates);
    } catch {
      setDups([]);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <LoadingRows rows={5} label={`Loading ${one.toLowerCase()}`} />;
  const c = data.contact;
  const wa = whatsappHref(c.phone_e164);

  if (c.merged_into_id) {
    return (
      <EmptyState
        title={`${c.name} was merged into another record`}
        hint="Everything that belonged to this record moved there."
        action={<Link href={`/contacts/${c.merged_into_id}`} className="text-sm font-medium text-brand hover:underline">Open the record it was merged into →</Link>}
      />
    );
  }

  const tabs: [Tab, string][] = [
    ["timeline", "Timeline"], ["deals", `Deals (${data.deals.length})`], ["sales", `Sales (${data.sales.length})`],
    ["invoices", `Invoices (${data.invoices.length})`], ["activities", "Activities"], ["details", "Details"],
  ];

  return (
    <>
      <div className="mb-2"><Link href="/contacts" className="text-sm text-brand hover:underline">← All</Link></div>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-2xl font-bold">{c.name}</h2>
            {c.kind === "company" && <Badge>Company</Badge>}
            {c.archived_at && <Badge tone="warning">Archived</Badge>}
            {c.roles.map((r) => <Badge key={r} tone="brand">{ROLE_LABELS[r] ?? r}</Badge>)}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
            {data.company && <Link href={`/contacts/${data.company.id}`} className="text-brand hover:underline">{data.company.name}</Link>}
            {!data.company && c.company_name && <span>{c.company_name}</span>}
            {c.job_title && <span>{c.job_title}</span>}
            {c.phone && <a href={telHref(c.phone, c.phone_e164)} className="tabular-nums hover:underline">{c.phone}</a>}
            {wa && <a href={wa} target="_blank" rel="noreferrer" className="text-brand hover:underline">WhatsApp</a>}
            {c.email && <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a>}
          </div>
          {c.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{c.tags.map((t) => <TagChip key={t.id} tag={t} />)}</div>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Can perm="contacts.contact.update"><Button variant="subtle" onClick={() => setEditing(true)}>Edit</Button></Can>
          <Can perm="contacts.contact.merge"><Button variant="subtle" onClick={() => void findDuplicates()}>Find duplicates</Button></Can>
          <Can perm="contacts.contact.archive">
            {c.archived_at
              ? <Button variant="subtle" disabled={restore.busy} onClick={async () => { if (await restore.run()) load(); }}>Restore</Button>
              : <Button variant="ghost" onClick={() => void onArchive()}>Archive</Button>}
          </Can>
        </div>
      </header>

      {dups && (
        <Card className="mb-5">
          <h3 className="mb-2 text-sm font-semibold">Possible duplicates</h3>
          {dups.length === 0 ? <p className="text-sm text-fg-muted">No one else has this phone, email or NTN.</p> : (
            <ul className="space-y-1.5 text-sm">
              {dups.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <Link href={`/contacts/${d.id}`} className="font-medium text-brand hover:underline">{d.name}</Link>
                    <span className="ms-2 text-xs text-fg-muted">same {d.reason}{d.archived ? " · archived" : ""}</span>
                  </span>
                  <Button size="sm" onClick={() => setMergeWith(d.id)}>Merge…</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <dl className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Lifetime spend" value={can("pos.sale.read") ? money(data.stats.lifetime_spend_minor) : "—"} />
        <Kpi label="Invoiced" value={can("invoicing.invoice.read") ? money(data.stats.invoiced_minor) : "—"} />
        <Kpi label="Open deals" value={can("crm.lead.read") ? String(data.stats.open_deals) : "—"} />
        <Kpi label="Last visit" value={data.stats.last_visit_at ? relativeDate(data.stats.last_visit_at) : "—"} />
      </dl>

      <div role="tablist" aria-label={`${one} sections`} className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={cx("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm pointer-coarse:min-h-11",
                    tab === k ? "border-brand font-medium text-fg" : "border-transparent text-fg-muted hover:text-fg")}>
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "timeline" && <Timeline contactId={id} refreshKey={timelineKey} onNoted={() => setTimelineKey((k) => k + 1)} />}
        {tab === "deals" && (data.deals.length === 0 ? <EmptyState title="No deals yet" /> : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {data.deals.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 truncate font-medium">{d.name}</span>
                <span className="flex items-center gap-3">
                  <Badge tone={d.stage_kind === "won" ? "success" : d.stage_kind === "lost" ? "danger" : "neutral"}>{d.stage}</Badge>
                  <span className="tabular-nums">{money(d.value_minor)}</span>
                </span>
              </li>
            ))}
          </ul>
        ))}
        {tab === "sales" && (data.sales.length === 0 ? <EmptyState title="No sales yet" hint="Attach the customer at the till to see their purchases here." /> : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {data.sales.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span>{formatDate(s.created_at)} · {s.item_count} item{s.item_count === 1 ? "" : "s"} · <span className="capitalize">{s.payment_method}</span></span>
                <span className="tabular-nums font-medium">{money(s.total_minor)}</span>
              </li>
            ))}
          </ul>
        ))}
        {tab === "invoices" && (data.invoices.length === 0 ? <EmptyState title="No invoices yet" /> : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {data.invoices.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span>{formatDate(i.created_at)}</span>
                <span className="flex items-center gap-3">
                  <Badge tone={invTone[i.status] ?? "neutral"}>{i.status.replace("_", " ")}</Badge>
                  <span className="tabular-nums font-medium">{money(i.total_minor)}</span>
                </span>
              </li>
            ))}
          </ul>
        ))}
        {/* Slot for CRM activities (calls, visits, to-dos) once they land. */}
        {tab === "activities" && (can("crm.lead.read")
          ? <RecordActivities entityType="contact" entityId={id} canPlan={can("crm.activity.manage")} />
          : <EmptyState title="Activities aren't available" hint="Your role can't see planned work." />)}
        {tab === "details" && <Details data={data} onChanged={load} />}
      </div>

      {editing && <ContactForm open contact={c} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
      {mergeWith && (
        <MergeDialog ids={[id, mergeWith]} onClose={() => setMergeWith(null)}
                     onMerged={(winner) => { setMergeWith(null); setDups(null); if (winner === id) load(); else router.push(`/contacts/${winner}`); }} />
      )}
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

const ENTITY_LABEL: Record<string, string> = { contact: "", lead: "Deal", invoice_request: "Invoice", invoice: "Invoice", pos_sale: "Sale" };

/** One timeline line: a done activity says what was done (and the feedback). */
function headline(e: TimelineItem): string {
  if (e.kind === "activity_done" && e.activity) {
    const what = String(e.activity.summary || e.activity.type_name || "activity");
    return e.body ? `Done: ${what} — ${e.body}` : `Done: ${what}`;
  }
  return e.body ?? e.kind.replace("_", " ");
}

function Timeline({ contactId, refreshKey, onNoted }: { contactId: string; refreshKey: number; onNoted: () => void }) {
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    setError(null);
    api<TimelineItem[]>(`/contacts/${contactId}/timeline`)
      .then(setItems)
      .catch((e) => setError(errorText(e, "Couldn't load the timeline.")));
  }, [contactId]);
  useEffect(load, [load, refreshKey]);

  const add = useAction(
    () => api(`/contacts/${contactId}/notes`, { method: "POST", body: JSON.stringify({ body: note }) }),
    { success: "Note added", failure: "Couldn't add the note" },
  );

  return (
    <div className="space-y-4">
      <Can perm="contacts.contact.update">
        <form onSubmit={async (e) => { e.preventDefault(); if (await add.run()) { setNote(""); onNoted(); } }} className="space-y-2">
          <Field label="Add a note">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} />
          </Field>
          <Button size="sm" type="submit" disabled={add.busy || !note.trim()}>{add.busy ? "Saving…" : "Add note"}</Button>
        </form>
      </Can>
      {error ? <ErrorState message={error} onRetry={load} /> : !items ? <LoadingRows rows={3} label="Loading timeline" /> : items.length === 0 ? (
        <p className="text-sm text-fg-subtle">Nothing yet.</p>
      ) : (
        <ul className="space-y-3" data-testid="contact-timeline">
          {items.map((e) => (
            <li key={e.id} className="border-s-2 border-line ps-3 text-sm">
              <p className="text-fg">
                {ENTITY_LABEL[e.entity_type] && <span className="me-1 text-xs font-medium text-fg-muted">{ENTITY_LABEL[e.entity_type]} ·</span>}
                <span className={e.kind === "note" ? "" : "font-medium"}>{headline(e)}</span>
              </p>
              <p className="text-xs text-fg-subtle">{relativeDate(e.occurred_at)}{e.actor_name && ` · ${e.actor_name}`}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Details({ data, onChanged }: { data: ContactDetail; onChanged: () => void }) {
  const c = data.contact;
  const contactFields = useCustomFields("contact");
  const [addr, setAddr] = useState({ kind: "billing", line1: "", line2: "", city: "", province: "" });
  const add = useAction(
    () => api(`/contacts/${c.id}/addresses`, { method: "POST", body: JSON.stringify({ ...addr, is_default: data.addresses.length === 0 }) }),
    { success: "Address added", failure: "Couldn't add the address" },
  );
  const remove = useAction((aid: string) => api(`/contacts/${c.id}/addresses/${aid}`, { method: "DELETE" }),
    { success: "Address removed", failure: "Couldn't remove it" });

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <h3 className="mb-3 text-sm font-semibold">Details</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Info label="NTN" value={c.effective_ntn || "—"} hint={c.company_id && !c.ntn && c.effective_ntn ? "from the company" : undefined} />
          <Info label="STRN" value={c.strn || "—"} />
          <Info label="City" value={c.city || "—"} />
          <Info label="Source" value={c.source || "—"} />
          <Info label="Added" value={formatDate(c.created_at)} />
          <CustomFieldValues fields={contactFields} values={c.custom ?? {}} />
        </dl>
        {c.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-fg-muted">{c.notes}</p>}
        {c.kind === "company" && (
          <>
            <h3 className="mb-2 mt-5 text-sm font-semibold">People</h3>
            {data.people.length === 0 ? <p className="text-sm text-fg-subtle">No one linked yet.</p> : (
              <ul className="space-y-1 text-sm">
                {data.people.map((p) => (
                  <li key={p.id}><Link href={`/contacts/${p.id}`} className="text-brand hover:underline">{p.name}</Link>
                    {p.phone && <span className="ms-2 text-fg-muted">{p.phone}</span>}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>
      <Card>
        <h3 className="mb-3 text-sm font-semibold">Addresses</h3>
        {data.addresses.length === 0 && <p className="mb-3 text-sm text-fg-subtle">No address yet.</p>}
        <ul className="mb-4 space-y-2 text-sm">
          {data.addresses.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-2">
              <span>
                <span className="me-2 text-xs capitalize text-fg-muted">{a.kind}{a.is_default ? " · default" : ""}</span>
                {[a.line1, a.line2, a.city, a.province].filter(Boolean).join(", ")}
              </span>
              <Can perm="contacts.contact.update">
                <Button size="sm" variant="ghost" disabled={remove.busy} onClick={async () => { if (await remove.run(a.id)) onChanged(); }}>
                  Remove<span className="sr-only"> {a.line1}</span>
                </Button>
              </Can>
            </li>
          ))}
        </ul>
        <Can perm="contacts.contact.update">
          <form onSubmit={async (e) => { e.preventDefault(); if (await add.run()) { setAddr({ ...addr, line1: "", line2: "" }); onChanged(); } }}
                className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Address line">
              <Input value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} required />
            </Field>
            <Field label="Area">
              <Input value={addr.line2} onChange={(e) => setAddr({ ...addr, line2: e.target.value })} />
            </Field>
            <Field label="City">
              <Input value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
            </Field>
            <Field label="Type">
              <Select value={addr.kind} onChange={(e) => setAddr({ ...addr, kind: e.target.value })}>
                {ADDRESS_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </Select>
            </Field>
            <div className="sm:col-span-2"><Button size="sm" type="submit" disabled={add.busy}>Add address</Button></div>
          </form>
        </Can>
      </Card>
      <ConsentCard contactId={c.id} />
    </div>
  );
}

function Info({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="truncate">{value}{hint && <span className="ms-1 text-xs text-fg-subtle">({hint})</span>}</dd>
    </div>
  );
}
