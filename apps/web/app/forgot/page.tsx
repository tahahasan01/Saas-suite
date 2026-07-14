"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button, Card, Field, Input } from "@/components/ui";
import { AuthShell } from "@/components/AuthShell";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/auth/forgot", { method: "POST", body: JSON.stringify({ email }) });
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell eyebrow="Reset password">
        <Card className="space-y-4">
          {sent ? (
            <div className="space-y-2 text-center">
              <p className="text-3xl">📧</p>
              <h1 className="text-lg font-semibold">Check your email</h1>
              <p className="text-sm text-fg-muted">If an account exists for {email}, a reset link is on its way.</p>
            </div>
          ) : (
            <>
              <div>
                <h1 className="text-lg font-semibold">Reset your password</h1>
                <p className="text-sm text-fg-subtle">We&apos;ll email you a reset link.</p>
              </div>
              <form onSubmit={submit} className="space-y-3">
                <Field label="Email">
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </Field>
                <Button type="submit" disabled={busy} className="w-full">{busy ? "Sending…" : "Send reset link"}</Button>
              </form>
            </>
          )}
          <p className="text-center text-sm text-fg-subtle">
            <Link href="/login" className="text-brand hover:underline">Back to sign in</Link>
          </p>
        </Card>
    </AuthShell>
  );
}
