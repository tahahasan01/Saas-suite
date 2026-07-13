"use client";

import { useCallback, useEffect, useState } from "react";
import { WORKFLOW_TRIGGERS, type Workflow } from "@business-os/types";
import { api } from "@/lib/api";
import { Button, Card, Field, Input, Select } from "@/components/ui";

const TRIGGER_LABEL: Record<string, string> = {
  "lead.created": "When a lead is created",
  "lead.stage_changed": "When a lead changes stage",
  "interaction.logged": "When an interaction is logged",
};

const blank = { name: "", trigger: "lead.created", message: "", field: "", value: "" };

export default function AutomationsPage() {
  const [items, setItems] = useState<Workflow[]>([]);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Workflow[]>("/workflows").then(setItems).catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  async function toggle(w: Workflow) {
    await api(`/workflows/${w.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !w.enabled }) });
    load();
  }
  async function remove(w: Workflow) {
    await api(`/workflows/${w.id}`, { method: "DELETE" });
    load();
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const conditions = form.field ? [{ field: form.field, op: "eq", value: form.value }] : [];
      await api("/workflows", {
        method: "POST",
        body: JSON.stringify({
          name: form.name, trigger: form.trigger, conditions,
          actions: [{ type: "notify", recipient: "owner", kind: "info", message: form.message, link: "/crm" }],
        }),
      });
      setForm(blank);
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Automations</h1>
      <p className="mb-6 text-sm text-fg-muted">Rules that run automatically. No code required.</p>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-2">
          {items.length === 0 && <Card><p className="text-sm text-fg-subtle">No automations yet. Create one on the right.</p></Card>}
          {items.map((w) => (
            <Card key={w.id} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{w.name}</p>
                <p className="text-xs text-fg-subtle">
                  {TRIGGER_LABEL[w.trigger] ?? w.trigger}
                  {w.conditions.length > 0 && ` · if ${w.conditions[0].field} = ${String(w.conditions[0].value)}`}
                  {w.is_system && " · built-in"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => toggle(w)}
                        className={`relative h-6 w-11 rounded-full transition ${w.enabled ? "bg-brand" : "bg-elevated"}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${w.enabled ? "left-[22px]" : "left-0.5"}`} />
                </button>
                {!w.is_system && (
                  <button onClick={() => remove(w)} className="text-fg-subtle hover:text-danger" aria-label="Delete">✕</button>
                )}
              </div>
            </Card>
          ))}
        </div>

        <Card className="space-y-3">
          <h2 className="text-sm font-semibold">New automation</h2>
          <form onSubmit={create} className="space-y-3">
            <Field label="Name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Alert on WhatsApp leads" />
            </Field>
            <Field label="When…">
              <Select value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })}>
                {WORKFLOW_TRIGGERS.map((t) => <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Only if field (optional)">
                <Input value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value })} placeholder="source" />
              </Field>
              <Field label="equals">
                <Input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="whatsapp" />
              </Field>
            </div>
            <Field label="Notify with message">
              <Input value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required placeholder="New lead: {name}" />
            </Field>
            <Button type="submit" disabled={busy} className="w-full">{busy ? "Saving…" : "Create automation"}</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
