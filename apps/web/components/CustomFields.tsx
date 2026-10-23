"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { formatDay, formatNumber } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { Badge, Button, Card, ErrorState, Field, Input, LoadingRows, Select } from "@/components/ui";

/* Custom fields on leads and contacts (wave D, C26): the inputs, the read-only
   list and the settings editor. The server checks every value against the
   field's kind; these only shape the input. */

type FieldDef = Schema<"CustomFieldOut">;
export type CustomValues = Record<string, unknown>;
type Entity = FieldDef["entity"];

const KINDS: { key: FieldDef["kind"]; label: string }[] = [
  { key: "text", label: "Text" }, { key: "number", label: "Number" }, { key: "date", label: "Date" },
  { key: "select", label: "Choice from a list" }, { key: "checkbox", label: "Yes / no" },
];

/** The active fields for leads or contacts ([] when none or not readable). */
export function useCustomFields(entity: Entity): FieldDef[] {
  const [fields, setFields] = useState<FieldDef[]>([]);
  useEffect(() => {
    api<FieldDef[]>(`/custom-fields?entity=${entity}`).then(setFields).catch(() => setFields([]));
  }, [entity]);
  return fields;
}

/** Only what changed: a cleared value is sent as null, so the server drops it. */
export function customPatch(before: CustomValues, after: CustomValues): CustomValues | undefined {
  const out: CustomValues = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = after[key] === "" ? undefined : after[key];
    if (a !== before[key]) out[key] = a === undefined ? null : a;
  }
  return Object.keys(out).length ? out : undefined;
}

export function CustomFieldInputs({ fields, values, onChange }: {
  fields: FieldDef[]; values: CustomValues; onChange: (v: CustomValues) => void;
}) {
  if (fields.length === 0) return null;
  const set = (key: string, v: unknown) => onChange({ ...values, [key]: v });
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {fields.map((f) => {
        const v = values[f.key];
        if (f.kind === "checkbox") {
          return (
            <label key={f.key} className="flex items-center gap-2 text-sm pointer-coarse:min-h-11">
              <input type="checkbox" checked={v === true} onChange={(e) => set(f.key, e.target.checked)} />
              {f.label}
            </label>
          );
        }
        return (
          <Field key={f.key} label={f.label}>
            {f.kind === "select" ? (
              <Select value={typeof v === "string" ? v : ""} onChange={(e) => set(f.key, e.target.value)}>
                <option value="">—</option>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
            ) : (
              <Input
                type={f.kind === "number" ? "number" : f.kind === "date" ? "date" : "text"}
                inputMode={f.kind === "number" ? "decimal" : undefined}
                step={f.kind === "number" ? "any" : undefined}
                maxLength={f.kind === "text" ? 500 : undefined}
                value={v === undefined || v === null ? "" : String(v)}
                onChange={(e) => set(f.key, f.kind === "number"
                  ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
              />
            )}
          </Field>
        );
      })}
    </div>
  );
}

function shown(f: FieldDef, v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (f.kind === "checkbox") return v ? "Yes" : "No";
  if (f.kind === "date" && typeof v === "string") return formatDay(v);
  if (f.kind === "number" && typeof v === "number") return formatNumber(v);
  return String(v);
}

/** The values as label/value pairs, for a details list. */
export function CustomFieldValues({ fields, values }: { fields: FieldDef[]; values: CustomValues }) {
  return (
    <>
      {fields.map((f) => (
        <div key={f.key} className="min-w-0">
          <dt className="text-xs text-fg-subtle">{f.label}</dt>
          <dd className="truncate text-fg">{shown(f, values[f.key])}</dd>
        </div>
      ))}
    </>
  );
}

// ── Settings ───────────────────────────────────────────────────────────────
/** CRM settings: add, rename and retire the fields leads and contacts carry. */
export function CustomFieldsEditor() {
  const [entity, setEntity] = useState<Entity>("lead");
  const [fields, setFields] = useState<FieldDef[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState({ label: "", kind: "text" as FieldDef["kind"], options: "" });

  const load = useCallback(() => {
    setError(null);
    api<FieldDef[]>(`/custom-fields?entity=${entity}&include_archived=true`).then(setFields)
      .catch((e) => setError(errorText(e, "Couldn't load the fields.")));
  }, [entity]);
  useEffect(load, [load]);

  const add = useAction(() => api("/custom-fields", { method: "POST", body: JSON.stringify({
    entity, label: v.label, kind: v.kind,
    options: v.kind === "select" ? v.options.split(",").map((o) => o.trim()).filter(Boolean) : [],
  }) }), { success: "Field added", failure: "Couldn't add the field" });
  const retire = useAction((id: string, archived: boolean) =>
    api(`/custom-fields/${id}`, { method: "PATCH", body: JSON.stringify({ archived }) }),
    { failure: "Couldn't change the field" });

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold">Custom fields</h2>
        <Select aria-label="Fields for" className="w-40" value={entity} onChange={(e) => setEntity(e.target.value as Entity)}>
          <option value="lead">Leads</option>
          <option value="contact">Contacts</option>
        </Select>
      </div>
      <p className="mb-3 text-sm text-fg-muted">
        Extra details you want on every {entity === "lead" ? "lead" : "contact"}, such as plot size or blood group.
      </p>
      {error ? <ErrorState message={error} onRetry={load} /> : !fields ? <LoadingRows rows={2} /> : (
        <ul className="mb-4 divide-y divide-line text-sm">
          {fields.length === 0 && <li className="py-2 text-fg-subtle">No fields yet.</li>}
          {fields.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className={f.archived ? "text-fg-subtle line-through" : "font-medium"}>{f.label}</span>{" "}
                <span className="text-xs text-fg-subtle">
                  {KINDS.find((k) => k.key === f.kind)?.label}{f.kind === "select" && `: ${f.options.join(", ")}`}
                </span>
                {f.archived && <> <Badge>Retired</Badge></>}
              </span>
              <Button size="sm" variant="ghost" disabled={retire.busy}
                      onClick={async () => { if (await retire.run(f.id, !f.archived)) load(); }}>
                {f.archived ? "Bring back" : "Retire"}<span className="sr-only"> {f.label}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form className="grid gap-2 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
            onSubmit={async (e) => { e.preventDefault(); if (await add.run()) { setV({ label: "", kind: "text", options: "" }); load(); } }}>
        <Field label="Field name"><Input required maxLength={80} value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} /></Field>
        <Field label="Kind">
          <Select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as FieldDef["kind"] })}>
            {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </Select>
        </Field>
        <Button type="submit" size="sm" disabled={add.busy}>Add field</Button>
        {v.kind === "select" && (
          <div className="sm:col-span-3">
            <Field label="Choices, separated by commas">
              <Input required value={v.options} placeholder="DHA, Bahria, Gulberg" onChange={(e) => setV({ ...v, options: e.target.value })} />
            </Field>
          </div>
        )}
      </form>
    </Card>
  );
}
