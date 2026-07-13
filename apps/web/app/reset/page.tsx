"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button, Card, Field, Input, Wordmark } from "@/components/ui";

export default function ResetPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
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
      await api("/auth/reset", { method: "POST", body: JSON.stringify({ token, password }) });
      setDone(true);
      setTimeout(() => router.replace("/login"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center"><Wordmark /></div>
        <Card className="space-y-4">
          {done ? (
            <div className="space-y-2 text-center">
              <p className="text-3xl">✅</p>
              <h1 className="text-lg font-semibold">Password updated</h1>
              <p className="text-sm text-fg-muted">Redirecting to sign in…</p>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-semibold">Choose a new password</h1>
              <form onSubmit={submit} className="space-y-3">
                <Field label="New password (min 8 chars)">
                  <Input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
                </Field>
                {!token && <p className="text-sm text-warning">This reset link is missing its token.</p>}
                {error && <p className="text-sm text-danger">{error}</p>}
                <Button type="submit" disabled={busy || !token} className="w-full">{busy ? "Updating…" : "Update password"}</Button>
              </form>
              <p className="text-center text-sm text-fg-subtle">
                <Link href="/login" className="text-brand hover:underline">Back to sign in</Link>
              </p>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
