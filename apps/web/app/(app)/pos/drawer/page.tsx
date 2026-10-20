"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { money, relativeDate } from "@/lib/format";
import { useAction } from "@/lib/useAction";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingRows } from "@/components/ui";
import { useConfirm } from "@/components/Confirm";
import { DataTable, type Column } from "@/components/DataTable";
import { blurOnWheel, methodLabel } from "@/components/pos/labels";

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
  // undefined = still loading; null = no drawer open (the API answers 404).
  const [drawer, setDrawer] = useState<Drawer | null | undefined>(undefined);
  const [drawerError, setDrawerError] = useState(false);
  const [history, setHistory] = useState<Drawer[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [float_, setFloat] = useState("");
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [closed, setClosed] = useState<Drawer | null>(null);
  const confirm = useConfirm();

  const load = useCallback(() => {
    setDrawerError(false);
    setHistoryError(false);
    // null means no drawer is open — an answer, not a failure.
    api<Drawer | null>("/pos/drawer/current")
      .then((d) => setDrawer(d ?? null))
      .catch(() => setDrawerError(true));
    api<Drawer[]>("/pos/drawer/history").then(setHistory).catch(() => setHistoryError(true));
  }, []);
  useEffect(load, [load]);

  const openDrawer = useAction(
    (minor: number) => api("/pos/drawer/open", { method: "POST", body: JSON.stringify({ opening_float_minor: minor }) }),
    { success: "Drawer opened", failure: "Couldn't open the drawer" });
  const closeDrawer = useAction(
    (body: { counted_minor: number; notes: string }) =>
      api<Drawer>("/pos/drawer/close", { method: "POST", body: JSON.stringify(body) }),
    { failure: "Couldn't close the drawer" });

  async function open(e: React.FormEvent) {
    e.preventDefault();
    setClosed(null);
    if (await openDrawer.run(Math.round(Number(float_ || 0) * 100)) !== undefined) {
      setFloat("");
      load();
    }
  }

  const countedMinor = Math.round(Number(counted || 0) * 100);

  // Closing freezes the shift's figures, so it's confirmed with the
  // difference in front of the cashier first (I7).
  function askClose(expectedMinor: number) {
    void confirm({
      title: "Close the drawer?",
      body: (
        <>
          <p className="mb-3">The shift&apos;s figures are frozen once it&apos;s closed.</p>
          <dl className="space-y-1 text-sm text-fg">
            <div className="flex justify-between gap-3"><dt className="text-fg-muted">Expected</dt><dd className="tabular-nums">{money(expectedMinor)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-fg-muted">Counted</dt><dd className="tabular-nums">{money(countedMinor)}</dd></div>
            <div className="flex justify-between gap-3 font-medium"><dt>Over / short</dt><dd><Variance v={countedMinor - expectedMinor} /></dd></div>
          </dl>
        </>
      ),
      confirmLabel: "Close drawer",
      busyLabel: "Closing…",
      cancelLabel: "Keep counting",
      run: async () => {
        const d = await closeDrawer.run({ counted_minor: countedMinor, notes });
        if (d !== undefined) {
          setClosed(d);
          setCounted("");
          setNotes("");
          load();
        }
        return d;
      },
    });
  }

  const historyColumns: Column<Drawer>[] = [
    { key: "closed", header: "Closed", primary: true, cell: (d) => (d.closed_at ? relativeDate(d.closed_at) : "—") },
    { key: "expected", header: "Expected", align: "right", cell: (d) => money(d.expected_minor) },
    { key: "counted", header: "Counted", align: "right", cell: (d) => (d.counted_minor !== null ? money(d.counted_minor) : "—") },
    { key: "variance", header: "Over / short", align: "right", cell: (d) => <Variance v={d.variance_minor} /> },
  ];

  return (
    <>
      <p className="mb-6 text-sm text-fg-muted">Open with a float, count at close, reconcile the difference.</p>

      {closed && <Reconciliation d={closed} />}

      {drawerError ? (
        <ErrorState message="Couldn't load the drawer." onRetry={load} />
      ) : drawer === undefined ? (
        <LoadingRows label="Loading drawer" />
      ) : drawer ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Card className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
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
                    <li key={m.payment_method} className="flex justify-between gap-3 text-sm">
                      <span className="text-fg-muted">{methodLabel(m.payment_method)} · {m.count}</span>
                      <span className="tabular-nums">{money(m.total_minor)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card className="h-fit space-y-3">
            <h2 className="text-sm font-semibold">Close drawer</h2>
            <form onSubmit={(e) => { e.preventDefault(); askClose(drawer.expected_minor); }} className="space-y-3">
              <Field label="Cash counted (PKR)">
                <Input type="number" inputMode="decimal" min={0} step="0.01" value={counted} required
                       onWheel={blurOnWheel} onChange={(e) => setCounted(e.target.value)} />
              </Field>
              <Field label="Notes">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
              </Field>
              <Button type="submit" className="w-full" disabled={closeDrawer.busy}>Close &amp; reconcile</Button>
            </form>
          </Card>
        </div>
      ) : (
        <Card className="max-w-sm space-y-3">
          <h2 className="text-sm font-semibold">Open drawer</h2>
          <form onSubmit={open} className="space-y-3">
            <Field label="Opening float (PKR)">
              <Input type="number" inputMode="decimal" min={0} step="0.01" value={float_} placeholder="e.g. 5000"
                     onWheel={blurOnWheel} onChange={(e) => setFloat(e.target.value)} />
            </Field>
            <Button type="submit" className="w-full" disabled={openDrawer.busy}>{openDrawer.busy ? "Opening…" : "Open drawer"}</Button>
          </form>
        </Card>
      )}

      <section className="mt-6 space-y-2">
        <h2 className="text-sm font-semibold">Past shifts</h2>
        {historyError ? (
          <ErrorState message="Couldn't load past shifts." onRetry={load} />
        ) : (
          <DataTable
            columns={historyColumns}
            rows={history ?? []}
            rowKey={(d) => d.id}
            loading={history === null}
            caption="Past shifts"
            empty={<EmptyState title="No closed shifts yet." />}
          />
        )}
      </section>
    </>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className={`text-lg font-semibold tabular-nums break-words ${accent ? "text-brand" : ""}`}>{value}</dd>
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
