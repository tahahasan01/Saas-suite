"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { money, relativeDate } from "@/lib/format";
import { Badge, Button, Card, Field, Input } from "@/components/ui";

interface MethodTotal { payment_method: string; count: number; total_minor: number }
interface Drawer {
  id: string;
  status: string;
  opened_at: string;
  opened_by: string | null;
  opening_float_minor: number;
  expected_minor: number;
  cash_sales_minor: number;
  cash_refunds_minor: number;
  sales_by_method: MethodTotal[];
  closed_at: string | null;
  counted_minor: number | null;
  variance_minor: number | null;
  notes: string;
}

export default function DrawerPage() {
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [history, setHistory] = useState<Drawer[]>([]);
  const [float_, setFloat] = useState("");
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [closed, setClosed] = useState<Drawer | null>(null);

  const load = useCallback(() => {
    api<Drawer>("/pos/drawer/current").then(setDrawer).catch(() => setDrawer(null));
    api<Drawer[]>("/pos/drawer/history").then(setHistory).catch(() => setHistory([]));
  }, []);
  useEffect(load, [load]);

  async function open(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setClosed(null);
    try {
      await api("/pos/drawer/open", {
        method: "POST",
        body: JSON.stringify({ opening_float_minor: Math.round(Number(float_ || 0) * 100) }),
      });
      setFloat("");
      load();
    } catch (e) {
      setErr(e instanceof ApiError && typeof e.detail === "string" ? e.detail : "Couldn't open the drawer.");
    }
  }

  async function close(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const d = await api<Drawer>("/pos/drawer/close", {
        method: "POST",
        body: JSON.stringify({ counted_minor: Math.round(Number(counted || 0) * 100), notes }),
      });
      setClosed(d);
      setCounted("");
      setNotes("");
      load();
    } catch (e) {
      setErr(e instanceof ApiError && typeof e.detail === "string" ? e.detail : "Couldn't close the drawer.");
    }
  }

  return (
    <>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Cash drawer</h1>
        <Link href="/pos" className="text-sm text-brand hover:underline">← Back to billing</Link>
      </div>
      <p className="mb-6 text-sm text-fg-muted">Open with a float, count at close, reconcile the difference.</p>

      {err && <p className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{err}</p>}

      {closed && <Reconciliation d={closed} />}

      {drawer ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Drawer open</p>
                <p className="text-xs text-fg-subtle">
                  Since {relativeDate(drawer.opened_at)}{drawer.opened_by && ` · ${drawer.opened_by}`}
                </p>
              </div>
              <Badge tone="success">open</Badge>
            </div>

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Opening float" value={money(drawer.opening_float_minor)} />
              <Stat label="Cash sales" value={money(drawer.cash_sales_minor)} />
              <Stat label="Cash refunds" value={`−${money(drawer.cash_refunds_minor)}`} />
              <Stat label="Expected in drawer" value={money(drawer.expected_minor)} accent />
            </dl>

            {drawer.sales_by_method.length > 0 && (
              <div className="border-t border-line pt-3">
                <p className="mb-2 text-xs font-semibold text-fg-muted">Sales this shift</p>
                <ul className="space-y-1">
                  {drawer.sales_by_method.map((m) => (
                    <li key={m.payment_method} className="flex justify-between text-sm">
                      <span className="capitalize text-fg-muted">{m.payment_method} · {m.count}</span>
                      <span className="tabular-nums">{money(m.total_minor)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold">Close drawer</h2>
            <form onSubmit={close} className="space-y-3">
              <Field label="Cash counted (PKR)">
                <Input type="number" min={0} step="0.01" value={counted} required
                       onChange={(e) => setCounted(e.target.value)} />
              </Field>
              <Field label="Notes">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
              </Field>
              <Button type="submit" className="w-full">Close &amp; reconcile</Button>
            </form>
          </Card>
        </div>
      ) : (
        <Card className="max-w-sm space-y-3">
          <h2 className="text-sm font-semibold">Open drawer</h2>
          <form onSubmit={open} className="space-y-3">
            <Field label="Opening float (PKR)">
              <Input type="number" min={0} step="0.01" value={float_} placeholder="e.g. 5000"
                     onChange={(e) => setFloat(e.target.value)} />
            </Field>
            <Button type="submit" className="w-full">Open drawer</Button>
          </form>
        </Card>
      )}

      {history.length > 0 && (
        <Card className="mt-6 p-0">
          <p className="border-b border-line px-4 py-2.5 text-sm font-semibold">Past shifts</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-subtle">
                <th className="p-3">Closed</th>
                <th className="p-3 text-right">Expected</th>
                <th className="p-3 text-right">Counted</th>
                <th className="p-3 text-right">Over / short</th>
              </tr>
            </thead>
            <tbody>
              {history.map((d) => (
                <tr key={d.id} className="border-b border-line/60">
                  <td className="p-3 text-fg-muted">{d.closed_at ? relativeDate(d.closed_at) : "—"}</td>
                  <td className="p-3 text-right tabular-nums">{money(d.expected_minor)}</td>
                  <td className="p-3 text-right tabular-nums">{d.counted_minor !== null ? money(d.counted_minor) : "—"}</td>
                  <td className="p-3 text-right">
                    <Variance v={d.variance_minor} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className={`text-lg font-semibold tabular-nums ${accent ? "text-brand" : ""}`}>{value}</dd>
    </div>
  );
}

function Variance({ v }: { v: number | null }) {
  if (v === null) return <span className="text-fg-subtle">—</span>;
  if (v === 0) return <Badge tone="success">exact</Badge>;
  return (
    <span className={`font-medium tabular-nums ${v > 0 ? "text-success" : "text-danger"}`}>
      {v > 0 ? "+" : "−"}{money(Math.abs(v))}
    </span>
  );
}

/** The moment of truth at close, shown once, big. */
function Reconciliation({ d }: { d: Drawer }) {
  const v = d.variance_minor ?? 0;
  return (
    <Card className={`mb-5 ${v === 0 ? "border-success/40 bg-success/5" : v < 0 ? "border-danger/40 bg-danger/5" : "border-warning/40 bg-warning/5"}`}>
      <p className="text-sm font-semibold">
        {v === 0 ? "Drawer reconciled exactly." : v < 0 ? `Short by ${money(-v)}` : `Over by ${money(v)}`}
      </p>
      <p className="mt-1 text-xs text-fg-muted">
        Expected {money(d.expected_minor)} · counted {d.counted_minor !== null ? money(d.counted_minor) : "—"}
        {d.notes && ` · ${d.notes}`}
      </p>
    </Card>
  );
}
