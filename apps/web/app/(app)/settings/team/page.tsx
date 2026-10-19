"use client";

import { useCallback, useEffect, useState } from "react";
import type { RoleOut, TeamUser } from "@business-os/types";
import { api } from "@/lib/api";
import { errorText, useAction } from "@/lib/useAction";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Select } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";

const COLUMNS: Column<TeamUser>[] = [
  { key: "name", header: "Name", primary: true, cell: (u) => u.name },
  { key: "email", header: "Email", cell: (u) => <span className="text-fg-muted">{u.email}</span> },
  { key: "role", header: "Role", cell: (u) => u.role ?? "—" },
  {
    key: "status", header: "Status",
    // A word as well as a colour, so it doesn't rely on colour alone.
    cell: (u) => <Badge tone={u.status === "active" ? "success" : "neutral"}>{u.status}</Badge>,
  },
];

export default function TeamPage() {
  const [users, setUsers] = useState<TeamUser[] | null>(null);
  const [roles, setRoles] = useState<RoleOut[]>([]);
  const [form, setForm] = useState({ email: "", role_id: "" });
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [u, r] = await Promise.all([api<TeamUser[]>("/team/users"), api<RoleOut[]>("/team/roles")]);
      setUsers(u);
      setRoles(r);
      setForm((f) => ({ ...f, role_id: f.role_id || r[0]?.id || "" }));
    } catch (e) {
      setLoadError(errorText(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const invite = useAction(
    // Resolves to the address: the endpoint answers 204, and `run` uses undefined for "failed".
    async (body: typeof form) => { await api("/team/invite", { method: "POST", body: JSON.stringify(body) }); return body.email; },
    { success: (to) => `Invite sent to ${to}`, failure: "Couldn't send the invite" },
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await invite.run(form);
    if (ok) {
      // They join the list once they accept; until then the email is the record.
      setForm({ email: "", role_id: roles[0]?.id ?? "" });
    }
  }

  return (
    // minmax(0,1fr): a plain 1fr column grows to its widest content (the
    // table), which pushed the invite card 64px off a 1024px screen. Below
    // xl the card stacks under the list instead of squeezing beside it.
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        {loadError ? (
          <ErrorState message={`Couldn't load your team. ${loadError}`} onRetry={load} />
        ) : (
          <DataTable
            columns={COLUMNS}
            rows={users ?? []}
            rowKey={(u) => u.id}
            loading={users === null}
            caption="Team members"
            empty={<EmptyState title="No teammates yet" hint="Invite someone with the form alongside." />}
          />
        )}
      </div>

      <Card className="space-y-3 self-start">
        <h2 className="text-sm font-semibold">Invite a teammate</h2>
        <p className="text-xs text-fg-subtle">They&apos;ll get an email to set up their own account.</p>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Email">
            <Input type="email" name="email" autoComplete="off" value={form.email}
                   onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </Field>
          <Field label="Role">
            <Select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
          {invite.error && <p role="alert" className="text-sm text-danger">{invite.error}</p>}
          <Button type="submit" disabled={invite.busy || !form.role_id} className="w-full">
            {invite.busy ? "Sending…" : "Send invite"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
