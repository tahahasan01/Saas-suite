"use client";

import { useCallback, useEffect, useState } from "react";
import { WORKFLOW_TRIGGERS, type ActivityType, type Workflow } from "@business-os/types";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { errorText, useAction } from "@/lib/useAction";
import { Button, Card, EmptyState, ErrorState, Field, Input, LoadingRows, Select, Switch } from "@/components/ui";
import { useConfirm } from "@/components/Confirm";

const TRIGGER_LABEL: Record<string, string> = {
  "lead.created": "When a lead is created",
  "lead.stage_changed": "When a lead changes stage",
  "interaction.logged": "When an interaction is logged",
  "lead.won": "When a lead is won",
  "lead.lost": "When a lead is lost",
  "lead.restored": "When a lost lead is restored",
  "activity.done": "When an activity is marked done",
  "activity.overdue": "When an activity becomes overdue",
  "contact.created": "When a contact is created",
};

// action: notify the owner, or plan an activity on the lead for its owner
// (the create_activity action, St02 §6.10).
const blank = { name: "", trigger: "lead.created", message: "", field: "", value: "",
                action: "notify" as "notify" | "activity", activityType: "", days: "1" };

export default function AutomationsPage() {
  const [items, setItems] = useState<Workflow[] | null>(null); // null = loading
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState(blank);
  const confirm = useConfirm();
  // Only offered when the CRM is on (the types endpoint needs it).
  const [types, setTypes] = useState<ActivityType[]>([]);
  useEffect(() => {
    api<ActivityType[]>("/activity-types", { notify: false }).then(setTypes).catch(() => setTypes([]));
  }, []);

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
          actions: form.action === "activity"
            ? [{ type: "create_activity", activity_type: form.activityType || types[0]?.name, summary: form.message,
                 offset_days: Math.max(0, Number(form.days) || 0), assignee: "owner" }]
            : [{ type: "notify", recipient: "owner", kind: "info", message: form.message, link: "/crm" }],
        }),
      });
    },
    { success: "Automation created", failure: "Couldn't create the automation" },
  );

  async function onToggle(w: Workflow) {
    const updated = await toggle.run(w);
    if (updated) setItems((cur) => cur && cur.map((x) => (x.id === w.id ? { ...x, enabled: updated.enabled } : x)));
  }
  async function onDelete(w: Workflow) {
    const done = await confirm({
      title: `Delete “${w.name}”?`,
      body: "The rule stops running straight away. This can't be undone.",
      confirmLabel: "Delete",
      busyLabel: "Deleting…",
      tone: "danger",
      run: () => remove.run(w),
    });
    if (done) load();
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
                    {w.actions[0]?.type === "create_activity" && " · plans an activity"}
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
                      onClick={() => onDelete(w)}
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
            {types.length > 0 && (
              <Field label="Then…">
                <Select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value as "notify" | "activity" })}>
                  <option value="notify">Notify the owner</option>
                  <option value="activity">Plan an activity for the owner</option>
                </Select>
              </Field>
            )}
            {form.action === "activity" && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label="Activity">
                  <Select value={form.activityType || types[0]?.name} onChange={(e) => setForm({ ...form, activityType: e.target.value })}>
                    {types.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                  </Select>
                </Field>
                <Field label="Due in (days)">
                  <Input type="number" min={0} max={365} value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} />
                </Field>
              </div>
            )}
            <Field label={form.action === "activity" ? "Activity summary" : "Notify with message"}>
              <Input value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required
                     placeholder={form.action === "activity" ? "Follow up with {name}" : "New lead: {name}"} />
            </Field>
            <Button type="submit" disabled={create.busy} className="w-full">{create.busy ? "Saving…" : "Create automation"}</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
