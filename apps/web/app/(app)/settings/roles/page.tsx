"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CatalogModule, Grant, PermissionScope, RoleDetail, RoleSummary } from "@business-os/types";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { errorText, useAction } from "@/lib/useAction";
import { useConfirm } from "@/components/Confirm";
import { Dialog } from "@/components/Dialog";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingRows, Select, cx } from "@/components/ui";

const SCOPES: { value: PermissionScope; label: string }[] = [
  { value: "own", label: "Own records" },
  { value: "team", label: "Their team's" },
  { value: "branch", label: "Their branch's" },
  { value: "all", label: "All records" },
];

const ACTION_WORDS: Record<string, string> = {
  read: "See", create: "Add", update: "Edit", manage: "Manage", approve: "Approve", export: "Export",
  import: "Import", refund: "Refund", open: "Open", close: "Close", invite: "Invite", request: "Request",
  write: "Record", assign: "Assign", receive: "Receive", cancel: "Cancel", calculate: "Calculate",
  pay: "Mark paid", lock: "Lock", reopen: "Reopen", sales: "Sales report",
};

/** "crm.lead.read" -> "See leads". Plain words for shop owners. */
function keyLabel(key: string): string {
  const [, resource, action] = key.split(".");
  const verb = ACTION_WORDS[action] ?? action;
  return `${verb} ${resource.replace(/_/g, " ")}${resource.endsWith("s") ? "" : "s"}`;
}

function patternLabel(p: string): string {
  if (p === "*") return "Everything (owner)";
  return `Everything in ${p.slice(0, -2)}`;
}

/** Roles and permissions (D-04). A role grants permission keys, each at a
 *  scope where records can be narrowed, and may include other roles. System
 *  roles are templates: copy one to change it. */
export default function RolesPage() {
  return (
    <Can perm="settings.roles.manage" fallback={<EmptyState title="Only people who manage roles can see this page" />}>
      <RolesEditor />
    </Can>
  );
}

function RolesEditor() {
  const confirm = useConfirm();
  const [roles, setRoles] = useState<RoleSummary[] | null>(null);
  const [catalog, setCatalog] = useState<CatalogModule[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<RoleDetail | null>(null);
  const [draft, setDraft] = useState<{ name: string; description: string; grants: Grant[]; inherits: string[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [r, c] = await Promise.all([api<RoleSummary[]>("/roles"), api<CatalogModule[]>("/permissions/catalog")]);
      setRoles(r);
      setCatalog(c);
      setSelected((s) => s ?? r[0]?.id ?? null);
    } catch (e) {
      setLoadError(errorText(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selected) return;
    let live = true;
    api<RoleDetail>(`/roles/${selected}`).then((d) => {
      if (!live) return;
      setDetail(d);
      setDraft({ name: d.name, description: d.description, grants: d.grants, inherits: d.inherits });
    }).catch((e) => setLoadError(errorText(e)));
    return () => { live = false; };
  }, [selected]);

  const grantOf = useMemo(() => new Map((draft?.grants ?? []).map((g) => [g.permission_key, g])), [draft]);
  const patterns = (draft?.grants ?? []).filter((g) => g.permission_key.endsWith("*"));

  function toggle(key: string, on: boolean) {
    if (!draft) return;
    const rest = draft.grants.filter((g) => g.permission_key !== key);
    setDraft({ ...draft, grants: on ? [...rest, { permission_key: key, scope: "all" }] : rest });
  }
  function setScope(key: string, scope: PermissionScope) {
    if (!draft) return;
    setDraft({ ...draft, grants: draft.grants.map((g) => (g.permission_key === key ? { ...g, scope } : g)) });
  }

  const save = useAction(async () => {
    if (!detail || !draft) return;
    if (draft.name !== detail.name || draft.description !== detail.description) {
      await api(`/roles/${detail.id}`, { method: "PATCH", body: JSON.stringify({ name: draft.name, description: draft.description }) });
    }
    await api(`/roles/${detail.id}/grants`, { method: "PUT", body: JSON.stringify({ grants: draft.grants }) });
    const d = await api<RoleDetail>(`/roles/${detail.id}/inherits`, { method: "PUT", body: JSON.stringify({ role_ids: draft.inherits }) });
    setDetail(d);
    await load();
    return d;
  }, { success: "Role saved", failure: "Couldn't save the role" });

  const create = useAction(async (name: string) => {
    const d = await api<RoleDetail>("/roles", { method: "POST", body: JSON.stringify({ name, grants: [] }) });
    setCreating(false);
    setNewName("");
    await load();
    setSelected(d.id);
    return d;
  }, { success: "Role added", failure: "Couldn't add the role" });

  const copy = useAction(async (role: RoleDetail) => {
    const d = await api<RoleDetail>(`/roles/${role.id}/copy`, { method: "POST", body: JSON.stringify({ name: `${role.name} (copy)` }) });
    await load();
    setSelected(d.id);
    return d;
  }, { success: "Copy made. Edit it freely.", failure: "Couldn't copy the role" });

  async function remove(role: RoleDetail) {
    const ok = await confirm({
      title: `Delete ${role.name}?`,
      description: "People must be moved off this role first.",
      confirmLabel: "Delete", tone: "danger",
      run: () => api(`/roles/${role.id}`, { method: "DELETE" }).then(() => true).catch(() => undefined),
    });
    if (ok) { setSelected(null); setDetail(null); await load(); }
  }

  if (loadError) return <ErrorState message={`Couldn't load roles. ${loadError}`} onRetry={load} />;
  if (!roles) return <LoadingRows rows={4} label="Loading roles" />;

  const locked = !!detail?.is_system;

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="space-y-2">
        <ul className="space-y-1" aria-label="Roles">
          {roles.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setSelected(r.id)}
                aria-current={r.id === selected ? "true" : undefined}
                className={cx("flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-start text-sm pointer-coarse:min-h-11",
                  r.id === selected ? "bg-brand-subtle text-brand" : "hover:bg-elevated")}
              >
                <span className="min-w-0 truncate font-medium">{r.name}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {r.is_system && <Badge>System</Badge>}
                  <span className="text-xs text-fg-subtle">{r.user_count}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <Button variant="subtle" className="w-full" onClick={() => setCreating(true)}>New role</Button>
      </div>

      {detail && draft && (
        <Card className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
              <Field label="Role name">
                <Input value={draft.name} disabled={locked} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </Field>
              <Field label="What it's for">
                <Input value={draft.description} disabled={locked}
                       onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </Field>
            </div>
            <div className="flex gap-2">
              {locked
                ? <Button variant="subtle" disabled={copy.busy} onClick={() => copy.run(detail)}>Copy to edit</Button>
                : <Button variant="ghost" onClick={() => remove(detail)}>Delete</Button>}
            </div>
          </div>
          {locked && <p className="text-sm text-fg-muted">This is a built-in role. Copy it to make your own version.</p>}

          {patterns.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {patterns.map((g) => (
                <span key={g.permission_key} className="inline-flex items-center gap-1 rounded-md bg-elevated px-2 py-1 text-xs">
                  {patternLabel(g.permission_key)}
                  {!locked && (
                    <button type="button" aria-label={`Remove ${patternLabel(g.permission_key)}`}
                            onClick={() => toggle(g.permission_key, false)} className="text-fg-muted hover:text-fg">×</button>
                  )}
                </span>
              ))}
            </div>
          )}

          <fieldset className="space-y-4" disabled={locked}>
            <legend className="text-sm font-semibold">Permissions</legend>
            {catalog.map((mod) => (
              <div key={mod.module} className="space-y-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{mod.label}</h3>
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {mod.keys.map((k) => {
                    const g = grantOf.get(k.key);
                    return (
                      <li key={k.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
                        <label className="flex min-w-0 items-center gap-2 text-sm pointer-coarse:min-h-11">
                          <input type="checkbox" checked={!!g} onChange={(e) => toggle(k.key, e.target.checked)}
                                 className="h-4 w-4 accent-[var(--color-brand)]" />
                          <span>{keyLabel(k.key)}</span>
                          <span className="hidden text-xs text-fg-subtle sm:inline">{k.key}</span>
                        </label>
                        {g && k.scoped && (
                          <Select aria-label={`Scope for ${k.key}`} value={g.scope} className="w-40"
                                  onChange={(e) => setScope(k.key, e.target.value as PermissionScope)}>
                            {SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </Select>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </fieldset>

          <fieldset className="space-y-2" disabled={locked}>
            <legend className="text-sm font-semibold">Includes these roles</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {roles.filter((r) => r.id !== detail.id).map((r) => (
                <label key={r.id} className="flex items-center gap-2 text-sm pointer-coarse:min-h-11">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]"
                         checked={draft.inherits.includes(r.id)}
                         onChange={(e) => setDraft({ ...draft, inherits: e.target.checked
                           ? [...draft.inherits, r.id] : draft.inherits.filter((i) => i !== r.id) })} />
                  {r.name}
                </label>
              ))}
            </div>
          </fieldset>

          {!locked && (
            <div className="flex justify-end">
              <Button disabled={save.busy} onClick={() => save.run()}>{save.busy ? "Saving…" : "Save role"}</Button>
            </div>
          )}
        </Card>
      )}

      <Dialog open={creating} onOpenChange={setCreating} title="New role" size="sm"
              footer={<>
                <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
                <Button disabled={!newName.trim() || create.busy} onClick={() => create.run(newName.trim())}>Add role</Button>
              </>}>
        <Field label="Role name">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Store manager" />
        </Field>
      </Dialog>
    </div>
  );
}
