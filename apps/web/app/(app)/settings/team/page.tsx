"use client";

import { useCallback, useEffect, useState } from "react";
import type { RoleOut, TeamUser } from "@business-os/types";
import { api } from "@/lib/api";
import { Button, Card, Field, Input } from "@/components/ui";

const empty = { name: "", email: "", password: "", role_id: "" };

export default function TeamPage() {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [roles, setRoles] = useState<RoleOut[]>([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [u, r] = await Promise.all([api<TeamUser[]>("/team/users"), api<RoleOut[]>("/team/roles")]);
    setUsers(u);
    setRoles(r);
    setForm((f) => ({ ...f, role_id: f.role_id || r[0]?.id || "" }));
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/team/users", { method: "POST", body: JSON.stringify(form) });
      setForm({ ...empty, role_id: roles[0]?.id ?? "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add user");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-subtle">
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Role</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line/60">
                <td className="p-3">{u.name}</td>
                <td className="p-3 text-fg-muted">{u.email}</td>
                <td className="p-3">{u.role ?? "—"}</td>
                <td className="p-3">
                  <span className={u.status === "active" ? "text-success" : "text-fg-subtle"}>{u.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">Add team member</h2>
        <form onSubmit={addUser} className="space-y-3">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </Field>
          <Field label="Temporary password">
            <Input type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </Field>
          <Field label="Role">
            <select
              className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm"
              value={form.role_id}
              onChange={(e) => setForm({ ...form, role_id: e.target.value })}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Adding…" : "Add member"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
