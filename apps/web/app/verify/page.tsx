"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Card, Wordmark } from "@/components/ui";

export default function VerifyPage() {
  const [state, setState] = useState<"loading" | "ok" | "fail">("loading");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) return setState("fail");
    api("/auth/verify", { method: "POST", body: JSON.stringify({ token }) })
      .then(() => setState("ok"))
      .catch(() => setState("fail"));
  }, []);

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center"><Wordmark /></div>
        <Card className="space-y-2 text-center">
          {state === "loading" && <p className="text-sm text-fg-muted">Verifying…</p>}
          {state === "ok" && (
            <>
              <p className="text-3xl">✅</p>
              <h1 className="text-lg font-semibold">Email verified</h1>
              <p className="text-sm text-fg-muted">You&apos;re all set.</p>
              <Link href="/dashboard" className="mt-2 inline-block text-sm text-brand hover:underline">Go to dashboard →</Link>
            </>
          )}
          {state === "fail" && (
            <>
              <p className="text-3xl">⚠️</p>
              <h1 className="text-lg font-semibold">Link expired or invalid</h1>
              <Link href="/login" className="mt-2 inline-block text-sm text-brand hover:underline">Back to sign in</Link>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
