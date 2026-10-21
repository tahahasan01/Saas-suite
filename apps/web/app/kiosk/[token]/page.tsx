"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import type { KioskBootstrap, KioskPunch } from "@business-os/types";
import { apiUrl } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { Button, Card, Input } from "@/components/ui";

/* The shared clock-in screen at a shop or office (D-43). No login: the link's
   token is the kiosk's only credential, and it can do nothing but punch.
   Tap your name, enter your PIN, and the server checks you in or out. Plain
   fetch, not lib/api: a wrong PIN is a 401 here, not "your session ended". */

type Stage = { kind: "pick" } | { kind: "pin"; id: string; name: string } | { kind: "done"; punch: KioskPunch };
const GREET_MS = 5_000;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), { ...init, headers: { "Content-Type": "application/json" }, credentials: "omit" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body?.detail === "string" ? body.detail : "Something went wrong. Try again.");
  return body as T;
}

export default function KioskScreen({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [boot, setBoot] = useState<KioskBootstrap | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: "pick" });
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const pinRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    call<KioskBootstrap>(`/kiosk/${encodeURIComponent(token)}/bootstrap`).then(setBoot).catch((e: Error) => setFatal(e.message));
  }, [token]);
  useEffect(load, [load]);

  // The greeting clears itself so the next person finds the list.
  useEffect(() => {
    if (stage.kind !== "done") return;
    const t = setTimeout(() => setStage({ kind: "pick" }), GREET_MS);
    return () => clearTimeout(t);
  }, [stage]);
  useEffect(() => { if (stage.kind === "pin") pinRef.current?.focus(); }, [stage]);

  async function punch(e: React.FormEvent) {
    e.preventDefault();
    if (stage.kind !== "pin" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await call<KioskPunch>(`/kiosk/${encodeURIComponent(token)}/punch`, {
        method: "POST", body: JSON.stringify({ employee_id: stage.id, pin }),
      });
      setStage({ kind: "done", punch: r });
      setPin("");
      setQ("");
    } catch (err) {
      setError((err as Error).message);
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  if (fatal) {
    return (
      <main className="grid min-h-dvh place-items-center bg-canvas p-6 text-center">
        <Card className="max-w-sm space-y-2">
          <h1 className="text-lg font-semibold">This kiosk can&apos;t start</h1>
          <p className="text-sm text-fg-muted">{fatal}</p>
          <Button variant="subtle" onClick={() => { setFatal(null); load(); }}>Try again</Button>
        </Card>
      </main>
    );
  }

  const people = (boot?.employees ?? []).filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <main className="min-h-dvh bg-canvas px-4 py-6 sm:px-8">
      <header className="mx-auto mb-6 flex max-w-4xl flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl font-bold tracking-tight">{boot?.location.name ?? "Loading…"}</h1>
        <p className="text-sm text-fg-muted">Tap your name to clock in or out</p>
      </header>

      <div className="mx-auto max-w-4xl">
        {stage.kind === "done" ? (
          <Card className="mx-auto max-w-md space-y-2 py-10 text-center" >
            <p className="text-3xl font-bold" role="status">
              {stage.punch.kind === "in" ? "Welcome" : "Goodbye"}, {stage.punch.name.split(" ")[0]}
            </p>
            <p className="text-fg-muted">
              {stage.punch.kind === "in" ? "Clocked in" : "Clocked out"} at {formatTime(stage.punch.at)}
              {stage.punch.kind === "out" && stage.punch.worked_today_min > 0 &&
                ` · ${Math.floor(stage.punch.worked_today_min / 60)}h ${stage.punch.worked_today_min % 60}m today`}
            </p>
            <Button variant="subtle" onClick={() => setStage({ kind: "pick" })}>Next person</Button>
          </Card>
        ) : stage.kind === "pin" ? (
          <Card className="mx-auto max-w-sm space-y-4">
            <p className="text-lg font-semibold">{stage.name}</p>
            <form onSubmit={punch} className="space-y-3">
              <label className="block text-sm text-fg-muted" htmlFor="kiosk-pin">Your PIN</label>
              <Input id="kiosk-pin" ref={pinRef} type="password" inputMode="numeric" autoComplete="off" maxLength={6}
                     value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="text-center text-2xl tracking-[0.5em]" />
              {error && <p role="alert" className="text-sm text-danger">{error}</p>}
              <div className="grid grid-cols-3 gap-2" aria-hidden>
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k) => k === "" ? <span key="gap" /> : (
                  <button key={k} type="button" tabIndex={-1}
                          className="h-14 rounded-lg border border-line bg-surface text-xl font-semibold active:bg-elevated"
                          onClick={() => setPin((p) => (k === "⌫" ? p.slice(0, -1) : (p + k).slice(0, 6)))}>{k}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" className="flex-1" onClick={() => { setStage({ kind: "pick" }); setPin(""); setError(null); }}>Back</Button>
                <Button type="submit" className="flex-1" disabled={busy || pin.length < 4}>{busy ? "Checking…" : "OK"}</Button>
              </div>
            </form>
          </Card>
        ) : (
          <div className="space-y-4">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find your name…" aria-label="Find your name" className="max-w-sm" />
            {boot && people.length === 0 && <p className="text-sm text-fg-muted">No one here yet. Ask HR to add staff to this site.</p>}
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {people.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={!p.has_pin}
                    onClick={() => { setStage({ kind: "pin", id: p.id, name: p.name }); setError(null); }}
                    className="flex h-24 w-full flex-col items-center justify-center rounded-xl border border-line bg-surface p-2 text-center font-medium disabled:opacity-50"
                  >
                    {p.name}
                    {!p.has_pin && <span className="text-xs font-normal text-fg-subtle">No PIN — ask HR</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
