"use client";

import { useCallback, useEffect, useState } from "react";
import type { RoleOut, TeamUser } from "@business-os/types";
import { api } from "@/lib/api";
import { Button, Card, Field, Input, Select } from "@/components/ui";

export default function TeamPage() {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [roles, setRoles] = useState<RoleOut[]>([]);
  const [form, setForm] = useState({ email: "", role_id: "" });
  const [sent, setSent] = useState(false);
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

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/team/invite", { method: "POST", body: JSON.stringify(form) });
      setSent(true);
      setForm({ email: "", role_id: roles[0]?.id ?? "" });
      setTimeout(() => setSent(false), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invite");
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
        <h2 className="text-sm font-semibold">Invite a teammate</h2>
        <p className="text-xs text-fg-subtle">They&apos;ll get an email to set up their own account.</p>
        <form onSubmit={invite} className="space-y-3">
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </Field>
          <Field label="Role">
            <Select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
          {sent && <p className="text-sm text-success">✓ Invite sent</p>}
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">{busy ? "Sending…" : "Send invite"}</Button>
        </form>
      </Card>
    </div>
  );
}
