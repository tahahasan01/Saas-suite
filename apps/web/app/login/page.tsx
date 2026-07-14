"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button, Card, Field, Input, Wordmark } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      await refresh();
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    // Auth is marketing's doorstep, not the app's: it gets the landing page's
    // scheme (`theme-marketing`) so signup → login → dashboard doesn't feel like
    // three companies. The glow sits under the card the way it sits under the
    // product shot on the homepage.
    <main className="theme-marketing bleed relative grid min-h-screen place-items-center overflow-hidden p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center"><Wordmark /></div>

        <div className="mt-6 flex items-center gap-4">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-line-strong" />
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-subtle">Sign in</span>
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-line-strong" />
        </div>

        <Card className="mt-6 space-y-5">
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
            <p className="mt-1 text-sm text-fg-subtle">Sign in to your workspace</p>
          </div>

          <form onSubmit={submit} className="space-y-3">
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Password">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <div className="text-right">
              <Link href="/forgot" className="text-xs text-fg-muted hover:text-brand">Forgot password?</Link>
            </div>
            {/* role=alert so a failed sign-in is announced, not just recoloured */}
            {error && (
              <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy} className="pill-invert w-full rounded-full border-0 hover:opacity-90">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="text-center text-sm text-fg-subtle">
            New here?{" "}
            <Link href="/signup" className="text-brand hover:underline">
              Create a workspace
            </Link>
          </p>
        </Card>

        <p className="mt-6 text-center text-xs text-fg-subtle">Built for Pakistan · PKR · CNIC · FBR</p>
      </div>
    </main>
  );
}
