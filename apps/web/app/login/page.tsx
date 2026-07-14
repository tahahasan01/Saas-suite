"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button, Card, Field, Input, PasswordInput } from "@/components/ui";
import { AuthShell } from "@/components/AuthShell";

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
    <AuthShell eyebrow="Sign in">
      <Card className="space-y-5">
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-fg-subtle">Sign in to your workspace</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {/* autoComplete + name are what let a password manager recognise and
              fill this form — the difference between a two-second sign-in and a
              typed password. autoFocus because there is one job on this screen. */}
          <Field label="Email">
            <Input
              type="email"
              name="email"
              autoComplete="username"
              autoFocus
              placeholder="you@company.pk"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Password">
            <PasswordInput
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
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
          {/* pill-invert carries bg/colour/radius itself — see globals.css */}
          <Button type="submit" disabled={busy} className="pill-invert w-full transition-opacity hover:opacity-90">
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
    </AuthShell>
  );
}
