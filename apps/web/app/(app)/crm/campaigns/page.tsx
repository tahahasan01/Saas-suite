"use client";

import { useCallback, useEffect, useState } from "react";
import type { Tag } from "@business-os/types";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useCan } from "@/lib/can";
import { errorText, useAction } from "@/lib/useAction";
import { useConfirm } from "@/components/Confirm";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingRows, Select, Textarea } from "@/components/ui";

type Campaign = Schema<"CampaignOut">;
type Segment = Schema<"SegmentOut">;
type Template = Schema<"TemplateOut">;
type Preview = Schema<"SegmentPreview">;

const SKIP: Record<string, string> = {
  no_consent: "haven't agreed to marketing", opted_out: "asked not to be contacted",
  no_address: "have no email", daily_cap: "over today's limit",
};
const TOKENS = ["{{first_name|Customer}}", "{{name}}", "{{company}}", "{{city}}", "{{business_name}}"];

/** CRM → Campaigns (wave D): saved lists of contacts, email templates, and
 *  campaigns that go only to contacts who agreed to marketing. */
export default function CampaignsPage() {
  const can = useCan();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const reload = useCallback(() => {
    api<Segment[]>("/crm/segments").then(setSegments).catch(() => setSegments([]));
    api<Template[]>("/crm/templates").then(setTemplates).catch(() => setTemplates([]));
  }, []);
  const manage = can("crm.campaign.manage");
  useEffect(() => { if (manage) reload(); }, [manage, reload]);

  if (!manage) {
    return <EmptyState title="Campaigns aren't part of your role" hint="Ask the owner or an admin for campaign access." />;
  }
  return (
    <div className="space-y-6">
      <CampaignsCard segments={segments} templates={templates} />
      <div className="grid gap-6 lg:grid-cols-2">
        <SegmentsCard segments={segments} onChanged={reload} />
        <TemplatesCard templates={templates} onChanged={reload} />
      </div>
    </div>
  );
}

// ── Campaigns ──────────────────────────────────────────────────────────────
function CampaignsCard({ segments, templates }: { segments: Segment[]; templates: Template[] }) {
  const can = useCan();
  const confirm = useConfirm();
  const [list, setList] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", segment_id: "", template_id: "" });

  const load = useCallback(() => {
    setError(null);
    api<Campaign[]>("/crm/campaigns").then(setList).catch((e) => setError(errorText(e, "Couldn't load campaigns.")));
  }, []);
  useEffect(load, [load]);

  const create = useAction(() => api("/crm/campaigns", { method: "POST", body: JSON.stringify(draft) }),
    { success: "Campaign saved as a draft", failure: "Couldn't save the campaign" });
  const send = useAction((id: string) => api(`/crm/campaigns/${id}/send`, { method: "POST" }),
    { success: "Campaign sent", failure: "Couldn't send the campaign" });

  async function sendOne(c: Campaign) {
    const p = await api<Preview>(`/crm/segments/${c.segment_id}/preview?channel=email`).catch(() => null);
    const skipped = p ? Object.entries(p.skipped).map(([k, n]) => `${n} ${SKIP[k] ?? k}`).join(", ") : "";
    if (!(await confirm({
      title: `Send “${c.name}” to ${p?.reachable ?? "the"} ${p?.reachable === 1 ? "person" : "people"}?`,
      body: skipped ? `Left out: ${skipped}. Emails written after 9 pm go out at 9 am.` : "Emails written after 9 pm go out at 9 am.",
      confirmLabel: "Send now",
    }))) return;
    if (await send.run(c.id)) load();
  }

  return (
    <Card>
      <h2 className="mb-1 font-display text-base font-semibold">Campaigns</h2>
      <p className="mb-3 text-sm text-fg-muted">
        An email to a saved list. It only goes to people who agreed to hear from you, and every email has a link to stop them.
      </p>
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
            onSubmit={async (e) => { e.preventDefault(); if (await create.run()) { setDraft({ name: "", segment_id: "", template_id: "" }); load(); } }}>
        <Field label="Campaign name"><Input required maxLength={120} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
        <Field label="Send to">
          <Select required value={draft.segment_id} onChange={(e) => setDraft({ ...draft, segment_id: e.target.value })}>
            <option value="">Choose a list…</option>
            {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Message">
          <Select required value={draft.template_id} onChange={(e) => setDraft({ ...draft, template_id: e.target.value })}>
            <option value="">Choose a template…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Button type="submit" size="sm" disabled={create.busy}>Save draft</Button>
      </form>
      {error ? <ErrorState message={error} onRetry={load} /> : !list ? <LoadingRows rows={2} /> : (
        list.length === 0 ? <p className="text-sm text-fg-subtle">No campaigns yet.</p> : (
          <ul className="divide-y divide-line">
            {list.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{c.name}</span>{" "}
                  <Badge tone={c.status === "sent" ? "success" : "neutral"}>{c.status === "sent" ? "Sent" : "Draft"}</Badge>
                  {c.status === "sent" && (
                    <span className="block text-xs text-fg-subtle">
                      {c.queued_count} sent, {c.skipped_count} left out{c.sent_at && ` · ${formatDateTime(c.sent_at)}`}
                    </span>
                  )}
                </span>
                {c.status === "draft" && can("crm.campaign.send") && (
                  <Button size="sm" disabled={send.busy} onClick={() => sendOne(c)}>Send</Button>
                )}
              </li>
            ))}
          </ul>
        )
      )}
    </Card>
  );
}

// ── Segments ───────────────────────────────────────────────────────────────
function SegmentsCard({ segments, onChanged }: { segments: Segment[]; onChanged: () => void }) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [v, setV] = useState({ name: "", tag_id: "", kind: "", city: "", role: "" });
  const [preview, setPreview] = useState<Record<string, Preview>>({});
  useEffect(() => { api<Tag[]>("/tags").then(setTags).catch(() => setTags([])); }, []);

  const create = useAction(() => api("/crm/segments", { method: "POST", body: JSON.stringify({
    name: v.name,
    filter: {
      ...(v.tag_id ? { tag_ids: [v.tag_id] } : {}), ...(v.kind ? { kind: v.kind } : {}),
      ...(v.city.trim() ? { city: v.city.trim() } : {}), ...(v.role ? { roles: [v.role] } : {}),
    },
  }) }), { success: "List saved", failure: "Couldn't save the list" });

  async function look(id: string) {
    const p = await api<Preview>(`/crm/segments/${id}/preview?channel=email`).catch(() => null);
    if (p) setPreview((cur) => ({ ...cur, [id]: p }));
  }

  return (
    <Card>
      <h2 className="mb-1 font-display text-base font-semibold">Saved lists</h2>
      <p className="mb-3 text-sm text-fg-muted">Who a campaign goes to, worked out again each time you send.</p>
      <ul className="mb-4 divide-y divide-line">
        {segments.map((s) => (
          <li key={s.id} className="py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{s.name}</span>
              <Button size="sm" variant="ghost" onClick={() => look(s.id)}>Who's on it?</Button>
            </div>
            {preview[s.id] && (
              <p className="text-xs text-fg-muted">
                {preview[s.id].total} contacts, {preview[s.id].reachable} can be emailed
                {Object.entries(preview[s.id].skipped).map(([k, n]) => `; ${n} ${SKIP[k] ?? k}`).join("")}
              </p>
            )}
          </li>
        ))}
      </ul>
      <form className="grid gap-2 sm:grid-cols-2"
            onSubmit={async (e) => { e.preventDefault(); if (await create.run()) { setV({ name: "", tag_id: "", kind: "", city: "", role: "" }); onChanged(); } }}>
        <Field label="List name"><Input required maxLength={120} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="With tag">
          <Select value={v.tag_id} onChange={(e) => setV({ ...v, tag_id: e.target.value })}>
            <option value="">Any</option>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Kind">
          <Select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>
            <option value="">People and companies</option><option value="person">People</option><option value="company">Companies</option>
          </Select>
        </Field>
        <Field label="Role">
          <Select value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })}>
            <option value="">Any</option>
            {["customer", "supplier", "patient", "student", "parent", "partner"].map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
          </Select>
        </Field>
        <Field label="City"><Input maxLength={80} value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} /></Field>
        <div className="flex items-end"><Button type="submit" size="sm" disabled={create.busy}>Save list</Button></div>
      </form>
    </Card>
  );
}

// ── Templates ──────────────────────────────────────────────────────────────
function TemplatesCard({ templates, onChanged }: { templates: Template[]; onChanged: () => void }) {
  const [v, setV] = useState({ name: "", subject: "", body: "" });
  const create = useAction(() => api("/crm/templates", { method: "POST", body: JSON.stringify(v) }),
    { success: "Template saved", failure: "Couldn't save the template" });
  return (
    <Card>
      <h2 className="mb-1 font-display text-base font-semibold">Email templates</h2>
      <p className="mb-3 text-sm text-fg-muted">
        Fill-ins: {TOKENS.join(", ")}. Text after | is used when the contact has no value.
      </p>
      <ul className="mb-4 divide-y divide-line">
        {templates.map((t) => (
          <li key={t.id} className="py-2 text-sm"><span className="font-medium">{t.name}</span>
            <span className="block truncate text-xs text-fg-subtle">{t.subject}</span></li>
        ))}
      </ul>
      <form className="space-y-2"
            onSubmit={async (e) => { e.preventDefault(); if (await create.run()) { setV({ name: "", subject: "", body: "" }); onChanged(); } }}>
        <Field label="Template name"><Input required maxLength={120} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="Subject"><Input maxLength={200} value={v.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} /></Field>
        <Field label="Message"><Textarea required rows={5} maxLength={10000} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} /></Field>
        {create.error && <p className="text-xs text-danger" role="alert">{create.error}</p>}
        <Button type="submit" size="sm" disabled={create.busy}>Save template</Button>
      </form>
    </Card>
  );
}
