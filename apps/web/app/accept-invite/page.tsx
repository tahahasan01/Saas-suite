"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button, Card, Field, Input, Wordmark } from "@/components/ui";

export default function AcceptInvitePage() {
  const router = useRouter();
  const { refresh } = useSession();
  const [token, setToken] = useState("");
  const [form, setForm] = useState({ name: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/accept-invite", { method: "POST", body: JSON.stringify({ token, ...form }) });
      await refresh();
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept invite");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center"><Wordmark /></div>
        <Card className="space-y-4">
          <div>
            <h1 className="text-lg font-semibold">Join your team</h1>
            <p className="text-sm text-fg-subtle">Set up your account to get started.</p>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <Field label="Your name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Password (min 8 chars)">
              <Input type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </Field>
            {!token && <p className="text-sm text-warning">This invite link is missing its token.</p>}
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" disabled={busy || !token} className="w-full">{busy ? "Joining…" : "Accept invite"}</Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
