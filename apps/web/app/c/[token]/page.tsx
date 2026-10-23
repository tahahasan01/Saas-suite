"use client";

import { use, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { apiUrl } from "@/lib/api";
import { Button, Card } from "@/components/ui";

/* Confirming marketing emails (double opt-in). Someone ticked "send me
   offers" on a business's web form with this address; only the owner of the
   inbox can say yes, here. No login: the signed link is the credential. Its
   GET changes nothing (mail scanners open links); the button does. */

type Page = Schema<"ConsentConfirmPage">;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init, headers: { "Content-Type": "application/json" }, credentials: "omit", cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body?.detail === "string" ? body.detail : "Something went wrong. Try again.");
  return body as T;
}

export default function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const path = `/public/consent/${encodeURIComponent(token)}`;
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { call<Page>(path).then(setPage).catch((e: Error) => setError(e.message)); }, [path]);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try { setPage(await call<Page>(path, { method: "POST" })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 py-8 text-fg">
      <div className="w-full max-w-md">
        <Card>
          <div className="space-y-4 p-6 text-center">
            {error ? <p role="alert">{error}</p> : !page ? <p className="text-fg-muted" role="status">Loading…</p> : page.done ? (
              <p role="status">Thank you. You&apos;ll hear from {page.business_name} about offers. Every email has a link to stop them.</p>
            ) : (
              <>
                <h1 className="font-display text-xl font-semibold">Offers from {page.business_name}?</h1>
                <p className="text-sm text-fg-muted">
                  Someone asked for offers to be sent to this address. If it was you, confirm below. If not, close this page.
                </p>
                <Button className="w-full" disabled={busy} onClick={confirm}>{busy ? "Confirming…" : "Yes, send me offers"}</Button>
              </>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}
