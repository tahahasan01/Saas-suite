"use client";

import { useCallback, useEffect, useState } from "react";
import { WORKFLOW_TRIGGERS, type Workflow } from "@business-os/types";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { errorText, useAction } from "@/lib/useAction";
import { Button, Card, EmptyState, ErrorState, Field, Input, LoadingRows, Select, Switch } from "@/components/ui";
import { Dialog } from "@/components/Dialog";

const TRIGGER_LABEL: Record<string, string> = {
  "lead.created": "When a lead is created",
  "lead.stage_changed": "When a lead changes stage",
  "interaction.logged": "When an interaction is logged",
};

const blank = { name: "", trigger: "lead.created", message: "", field: "", value: "" };

export default function AutomationsPage() {
  const [items, setItems] = useState<Workflow[] | null>(null); // null = loading
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState(blank);
  const [deleting, setDeleting] = useState<Workflow | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    api<Workflow[]>("/workflows")
      .then(setItems)
      .catch((e) => setLoadError(errorText(e, "Couldn't load automations.")));
  }, []);
  useEffect(load, [load]);

  // Each write is guarded and toasts on failure; before, a failed toggle
  // threw into the void and the switch just didn't move.
  const toggle = useAction(
    (w: Workflow) => api<Workflow>(`/workflows/${w.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !w.enabled }) }),
    { failure: "Couldn't change the rule" },
  );
  const remove = useAction(
    (w: Workflow) => api(`/workflows/${w.id}`, { method: "DELETE" }),
    { success: "Automation deleted", failure: "Couldn't delete the automation" },
  );
  const create = useAction(
    () => {
      const conditions = form.field ? [{ field: form.field, op: "eq", value: form.value }] : [];
      return api<Workflow>("/workflows", {
        method: "POST",
        body: JSON.stringify({
          name: form.name, trigger: form.trigger, conditions,
          actions: [{ type: "notify", recipient: "owner", kind: "info", message: form.message, link: "/crm" }],
        }),
      });
    },
    { success: "Automation created", failure: "Couldn't create the automation" },
  );

  async function onToggle(w: Workflow) {
    const updated = await toggle.run(w);
    if (updated) setItems((cur) => cur && cur.map((x) => (x.id === w.id ? { ...x, enabled: updated.enabled } : x)));
  }
  async function confirmDelete() {
    if (!deleting) return;
    const ok = await remove.run(deleting);
    setDeleting(null);
    if (ok !== undefined) load();
  }
  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!(await create.run())) return; // keep the form so it can be retried
    setForm(blank);
    load();
  }

  return (
    <>
      <p className="mb-6 text-sm text-fg-muted">Rules that run automatically. No code required.</p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-2">
          {loadError ? (
            <ErrorState message={loadError} onRetry={load} />
          ) : items === null ? (
            <LoadingRows label="Loading automations" />
          ) : items.length === 0 ? (
            <EmptyState title="No automations yet" hint="Create one with the form alongside." />
          ) : (
            items.map((w) => (
              <Card key={w.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={w.name}>{w.name}</p>
                  <p className="text-xs text-fg-subtle">
                    {TRIGGER_LABEL[w.trigger] ?? w.trigger}
                    {w.conditions.length > 0 && ` · if ${w.conditions[0].field} = ${String(w.conditions[0].value)}`}
                    {w.is_system && " · built-in"}
                    {/* State in words too, not only the switch's colour. */}
                    {" · "}{w.enabled ? "on" : "off"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Switch
                    checked={w.enabled}
                    onChange={() => onToggle(w)}
                    label={`Enable ${w.name}`}
                    disabled={toggle.busy}
                  />
                  {!w.is_system && (
                    <button
                      type="button"
                      onClick={() => setDeleting(w)}
                      aria-label={`Delete ${w.name}`}
                      title={`Delete ${w.name}`}
                      className="grid h-9 w-9 place-items-center rounded-lg text-fg-subtle hover:bg-elevated hover:text-danger pointer-coarse:h-11 pointer-coarse:w-11"
                    >
                      <X size={16} aria-hidden />
                    </button>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>

        <Card className="space-y-3">
          <h2 className="text-sm font-semibold">New automation</h2>
          <form onSubmit={onCreate} className="space-y-3">
            <Field label="Name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Alert on WhatsApp leads" />
            </Field>
            <Field label="When…">
              <Select value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })}>
                {WORKFLOW_TRIGGERS.map((t) => <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
            <Button type="submit" disabled={create.busy} className="w-full">{create.busy ? "Saving…" : "Create automation"}</Button>
          </form>
        </Card>
      </div>

      <Dialog
        open={!!deleting}
        onOpenChange={(o) => { if (!o && !remove.busy) setDeleting(null); }}
        title={deleting ? `Delete “${deleting.name}”?` : "Delete automation?"}
        size="sm"
        footer={
          <>
            <Button variant="ghost" disabled={remove.busy} onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" disabled={remove.busy} onClick={confirmDelete}>{remove.busy ? "Deleting…" : "Delete"}</Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">The rule stops running straight away. This can&apos;t be undone.</p>
      </Dialog>
    </>
  );
}
