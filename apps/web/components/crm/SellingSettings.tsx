"use client";

import { useCallback, useEffect, useState } from "react";
import type { Pipeline } from "@business-os/types";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { errorText, useAction } from "@/lib/useAction";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, ErrorState, Field, Input, LoadingRows, Select, Switch, Textarea } from "@/components/ui";
import { CustomFieldsEditor } from "@/components/CustomFields";

type WebForm = Schema<"WebFormOut">;
type Member = Schema<"PoolMemberOut">;
type Person = Schema<"PersonOut">;

const FIELD_LABELS: Record<WebForm["fields"][number], string> = {
  phone: "Phone", email: "Email", company: "Company", city: "City", message: "Message",
};

/** Settings → CRM, selling (wave D): the discount ceiling, web forms and the
 *  lead pool. Admin only (`crm.settings.manage`). */
export function SellingSettings() {
  return (
    <div className="space-y-6">
      <CustomFieldsEditor />
      <WebFormsEditor />
      <div className="grid gap-6 lg:grid-cols-2">
        <LeadPoolEditor />
        <DiscountCeiling />
      </div>
    </div>
  );
}

function usePeople() {
  const [people, setPeople] = useState<Person[]>([]);
  useEffect(() => { api<Person[]>("/crm/assignment/people").then(setPeople).catch(() => setPeople([])); }, []);
  return people;
}

// ── Discount ceiling ───────────────────────────────────────────────────────
function DiscountCeiling() {
  const [pct, setPct] = useState<string | null>(null);
  useEffect(() => {
    api<{ max_discount_pct: number | null }>("/crm/settings")
      .then((s) => setPct(s.max_discount_pct === null ? "" : String(s.max_discount_pct)))
      .catch(() => setPct(""));
  }, []);
  const save = useAction(
    () => api("/crm/settings", { method: "PUT", body: JSON.stringify({ max_discount_pct: pct === "" ? null : Number(pct) }) }),
    { success: "Discount limit saved", failure: "Couldn't save the limit" },
  );
  return (
    <Card>
      <h2 className="mb-1 font-display text-base font-semibold">Discount limit</h2>
      <p className="mb-3 text-sm text-fg-muted">
        The largest discount a rep can give on a product line. Admins can go above it. Leave empty for no limit.
      </p>
      {pct === null ? <LoadingRows rows={1} /> : (
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); save.run(); }}>
          <Field label="Largest discount (%)">
            <Input type="number" inputMode="decimal" min={0} max={100} step="0.5" className="w-28"
                   value={pct} onChange={(e) => setPct(e.target.value)} />
          </Field>
          <Button type="submit" size="sm" disabled={save.busy}>Save</Button>
        </form>
      )}
    </Card>
  );
}

// ── Web forms ──────────────────────────────────────────────────────────────
function WebFormsEditor() {
  const [forms, setForms] = useState<WebForm[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WebForm | "new" | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const people = usePeople();

  const load = useCallback(() => {
    setError(null);
    api<WebForm[]>("/crm/web-forms").then(setForms).catch((e) => setError(errorText(e, "Couldn't load the forms.")));
  }, []);
  useEffect(load, [load]);
  useEffect(() => { api<Pipeline[]>("/crm/pipelines").then(setPipelines).catch(() => setPipelines([])); }, []);

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold">Web forms</h2>
        {!editing && <Button size="sm" onClick={() => setEditing("new")}>New form</Button>}
      </div>
      <p className="mb-3 text-sm text-fg-muted">
        A page where customers leave their details. Link it from your website, Facebook page or WhatsApp profile;
        every message becomes a lead.
      </p>
      {editing && (
        <FormEditor form={editing === "new" ? null : editing} pipelines={pipelines} people={people}
                    onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
      {error ? <ErrorState message={error} onRetry={load} /> : !forms ? <LoadingRows rows={2} /> : (
        forms.length === 0 ? (!editing && <p className="text-sm text-fg-subtle">No forms yet.</p>) : (
          <ul className="divide-y divide-line">
            {forms.map((f) => <FormRow key={f.id} form={f} onEdit={() => setEditing(f)} onChanged={load} />)}
          </ul>
        )
      )}
    </Card>
  );
}

function FormRow({ form: f, onEdit, onChanged }: { form: WebForm; onEdit: () => void; onChanged: () => void }) {
  const toast = useToast();
  const toggle = useAction(
    () => api(`/crm/web-forms/${f.id}`, { method: "PATCH", body: JSON.stringify({ active: !f.active }) }),
    { failure: "Couldn't change the form" },
  );
  const link = typeof window === "undefined" ? f.link : `${window.location.origin}${f.link}`;
  async function copy() {
    try { await navigator.clipboard.writeText(link); toast.success("Link copied"); }
    catch { toast.error("Couldn't copy. Open the form and copy its address instead."); }
  }
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="font-medium">{f.name}</span>
          {!f.active && <Badge>Off</Badge>}
        </span>
        <span className="block text-xs text-fg-subtle">{f.leads_today} today · source “{f.source}”</span>
      </span>
      <span className="flex flex-wrap items-center gap-1">
        <Button size="sm" variant="ghost" onClick={copy}>Copy link</Button>
        <a href={f.link} target="_blank" rel="noreferrer" className="px-2 text-xs font-medium text-brand hover:underline">Open</a>
        <Button size="sm" variant="ghost" onClick={onEdit}>Edit</Button>
        <Switch checked={f.active} label={`${f.name} is on`} disabled={toggle.busy}
                onChange={async () => { if (await toggle.run()) onChanged(); }} />
      </span>
    </li>
  );
}

function FormEditor({ form, pipelines, people, onCancel, onSaved }: {
  form: WebForm | null; pipelines: Pipeline[]; people: Person[]; onCancel: () => void; onSaved: () => void;
}) {
  const [v, setV] = useState({
    name: form?.name ?? "Website enquiries", title: form?.title ?? "", intro: form?.intro ?? "",
    thank_you: form?.thank_you ?? "", source: form?.source ?? "web form", fields: form?.fields ?? ["phone", "email", "message"],
    stage_id: form?.stage_id ?? "", owner_id: form?.owner_id ?? "", daily_cap: String(form?.daily_cap ?? 200),
  });
  const save = useAction(() => {
    const stage = pipelines.flatMap((p) => p.stages.map((s) => ({ p, s }))).find((x) => x.s.id === v.stage_id);
    const body = {
      name: v.name, title: v.title, intro: v.intro, thank_you: v.thank_you, source: v.source, fields: v.fields,
      stage_id: v.stage_id || null, pipeline_id: stage?.p.id ?? null, owner_id: v.owner_id || null,
      daily_cap: Number(v.daily_cap || 200),
    };
    return form
      ? api(`/crm/web-forms/${form.id}`, { method: "PATCH", body: JSON.stringify(body) })
      : api("/crm/web-forms", { method: "POST", body: JSON.stringify(body) });
  }, { success: "Form saved", failure: "Couldn't save the form" });

  const toggleField = (k: WebForm["fields"][number]) =>
    setV({ ...v, fields: v.fields.includes(k) ? v.fields.filter((x) => x !== k) : [...v.fields, k] });

  return (
    <form className="mb-4 space-y-3 rounded-md border border-line bg-elevated/40 p-3"
          onSubmit={async (e) => { e.preventDefault(); if (await save.run()) onSaved(); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Form name (for you)"><Input required maxLength={120} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="Heading customers see"><Input maxLength={160} value={v.title} placeholder="Get a quote" onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
      </div>
      <Field label="A line under the heading"><Textarea rows={2} maxLength={1000} value={v.intro} onChange={(e) => setV({ ...v, intro: e.target.value })} /></Field>
      <fieldset className="space-y-1">
        <legend className="text-xs font-medium text-fg-muted">Ask for (name is always asked)</legend>
        <div className="flex flex-wrap gap-3">
          {(Object.keys(FIELD_LABELS) as WebForm["fields"][number][]).map((k) => (
            <label key={k} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={v.fields.includes(k)} onChange={() => toggleField(k)} />{FIELD_LABELS[k]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="New leads go to stage">
          <Select value={v.stage_id} onChange={(e) => setV({ ...v, stage_id: e.target.value })}>
            <option value="">First stage of the main pipeline</option>
            {pipelines.map((p) => (
              <optgroup key={p.id} label={p.name}>
                {p.stages.filter((s) => !s.is_won).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Who gets them">
          <Select value={v.owner_id} onChange={(e) => setV({ ...v, owner_id: e.target.value })}>
            <option value="">The lead pool, in turn</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Source on the lead"><Input required maxLength={60} value={v.source} onChange={(e) => setV({ ...v, source: e.target.value })} /></Field>
        <Field label="Most leads a day"><Input type="number" inputMode="numeric" min={1} max={10000} value={v.daily_cap} onChange={(e) => setV({ ...v, daily_cap: e.target.value })} /></Field>
      </div>
      <Field label="Thank-you message"><Input maxLength={500} value={v.thank_you} placeholder="Thank you. We'll be in touch soon." onChange={(e) => setV({ ...v, thank_you: e.target.value })} /></Field>
      {save.error && <p className="text-xs text-danger" role="alert">{save.error}</p>}
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={save.busy}>{save.busy ? "Saving…" : "Save form"}</Button>
        <Button size="sm" variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

// ── Lead pool ──────────────────────────────────────────────────────────────
function LeadPoolEditor() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const people = usePeople();

  const load = useCallback(() => {
    setError(null);
    api<Member[]>("/crm/assignment/pool").then(setMembers).catch((e) => setError(errorText(e, "Couldn't load the pool.")));
  }, []);
  useEffect(load, [load]);

  const put = useAction(
    (next: { user_id: string; active: boolean; daily_cap: number | null }[]) =>
      api<Member[]>("/crm/assignment/pool", { method: "PUT", body: JSON.stringify({ members: next }) }),
    { failure: "Couldn't save the pool" },
  );
  const plain = (ms: Member[]) => ms.map((m) => ({ user_id: m.user_id, active: m.active, daily_cap: m.daily_cap }));
  async function change(next: ReturnType<typeof plain>) {
    const saved = await put.run(next);
    if (saved) setMembers(saved as Member[]);
  }

  const free = people.filter((p) => !members?.some((m) => m.user_id === p.id));
  return (
    <Card>
      <h2 className="mb-1 font-display text-base font-semibold">Lead pool</h2>
      <p className="mb-3 text-sm text-fg-muted">
        New leads from web forms go to these people in turn. Anyone on approved leave today is skipped.
      </p>
      {error ? <ErrorState message={error} onRetry={load} /> : !members ? <LoadingRows rows={2} /> : (
        <>
          {members.length === 0 && <p className="mb-3 text-sm text-fg-subtle">Nobody yet: new leads go to the owner.</p>}
          <ul className="mb-3 divide-y divide-line">
            {members.map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium">{m.name}</span>
                  <span className="text-xs text-fg-subtle">{m.assigned_today} today</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-xs text-fg-muted">
                    <span aria-hidden>Most a day</span>
                    <Input type="number" inputMode="numeric" min={1} max={1000} className="w-20 py-1"
                           defaultValue={m.daily_cap ?? ""} aria-label={`Most leads a day for ${m.name}`}
                           onBlur={(e) => {
                             const cap = e.target.value ? Number(e.target.value) : null;
                             if (cap !== m.daily_cap) change(plain(members).map((x) => x.user_id === m.user_id ? { ...x, daily_cap: cap } : x));
                           }} />
                  </span>
                  <Switch checked={m.active} label={`${m.name} takes leads`} disabled={put.busy}
                          onChange={(on) => change(plain(members).map((x) => x.user_id === m.user_id ? { ...x, active: on } : x))} />
                  <Button size="sm" variant="ghost" disabled={put.busy}
                          onClick={() => change(plain(members).filter((x) => x.user_id !== m.user_id))}>
                    Remove
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          {free.length > 0 && (
            <div className="flex items-end gap-2">
              <Field label="Add someone">
                <Select value={adding} onChange={(e) => setAdding(e.target.value)}>
                  <option value="">Choose…</option>
                  {free.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
              <Button size="sm" disabled={!adding || put.busy}
                      onClick={async () => { await change([...plain(members), { user_id: adding, active: true, daily_cap: null }]); setAdding(""); }}>
                Add
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
