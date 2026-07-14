"use client";

import { useState } from "react";
import Link from "next/link";
import type { SaleDetail } from "@business-os/types";
import { api, ApiError } from "@/lib/api";
import { money, relativeDate } from "@/lib/format";
import { Badge, Button, Card, Input } from "@/components/ui";

/* Returns are looked up by receipt: that is the only identifier a customer
   standing at the counter actually has. */

export default function ReturnsPage() {
  const [q, setQ] = useState("");
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ refund: number } | null>(null);
  const [busy, setBusy] = useState(false);

  async function find(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setDone(null);
    setSale(null);
    try {
      const found = await api<SaleDetail>(`/pos/sales/${q.trim()}`);
      setSale(found);
      setQty({});
    } catch {
      setErr("No sale with that receipt number.");
    }
  }

  const refund = sale
    ? sale.returnable.reduce((sum, l) => sum + Math.round(l.price_minor * (qty[l.sale_item_id] ?? 0)), 0)
    : 0;

  async function submit() {
    if (!sale) return;
    const items = Object.entries(qty)
      .filter(([, n]) => n > 0)
      .map(([sale_item_id, n]) => ({ sale_item_id, qty: n }));
    if (!items.length) return;

    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ refund_minor: number }>(`/pos/sales/${sale.id}/returns`, {
        method: "POST",
        body: JSON.stringify({ items, reason, restock }),
      });
      setDone({ refund: r.refund_minor });
      setSale(await api<SaleDetail>(`/pos/sales/${sale.id}`)); // reflect what's left
      setQty({});
      setReason("");
    } catch (e) {
      setErr(e instanceof ApiError && typeof e.detail === "string" ? e.detail : "Couldn't process that return.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Returns</h1>
        <Link href="/pos" className="text-sm text-brand hover:underline">← Back to billing</Link>
      </div>
      <p className="mb-6 text-sm text-fg-muted">Find the sale, choose what&apos;s coming back, refund it.</p>

      <form onSubmit={find} className="mb-5 flex max-w-md gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Receipt / sale ID" aria-label="Receipt number" />
        <Button type="submit" disabled={!q.trim()}>Find sale</Button>
      </form>

      {err && !sale && <p className="text-sm text-danger">{err}</p>}

      {done && (
        <Card className="mb-5 border-success/40 bg-success/5">
          <p className="text-sm font-medium text-success">Refunded {money(done.refund)}</p>
          <p className="mt-0.5 text-xs text-fg-muted">
            {restock ? "Stock returned to the shelf." : "Stock not restocked."}
            {sale?.fbr_status && " A debit note has been filed with FBR."}
          </p>
        </Card>
      )}

      {sale && (
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <Card className="p-0">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <div>
                <p className="text-sm font-medium">Sale {sale.id.slice(0, 8).toUpperCase()}</p>
                <p className="text-xs text-fg-subtle">{relativeDate(sale.created_at)} · {money(sale.total_minor)}</p>
              </div>
              {sale.fbr_invoice_number && <Badge tone="success">Filed with FBR</Badge>}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-fg-subtle">
                  <th className="p-3">Item</th>
                  <th className="p-3 text-right">Sold</th>
                  <th className="p-3 text-right">Returned</th>
                  <th className="p-3 text-right">Return now</th>
                </tr>
              </thead>
              <tbody>
                {sale.returnable.map((l) => (
                  <tr key={l.sale_item_id} className="border-b border-line/60">
                    <td className="p-3">
                      <p className="font-medium">{l.name}</p>
                      <p className="text-xs text-fg-subtle">{money(l.price_minor)} each</p>
                    </td>
                    <td className="p-3 text-right tabular-nums text-fg-muted">{l.qty_sold}</td>
                    <td className="p-3 text-right tabular-nums text-fg-muted">{l.qty_returned || "—"}</td>
                    <td className="p-3 text-right">
                      {l.qty_returnable > 0 ? (
                        <Input
                          type="number" min={0} max={l.qty_returnable} step="any"
                          value={qty[l.sale_item_id] ?? ""}
                          onChange={(e) => setQty({ ...qty, [l.sale_item_id]: Number(e.target.value || 0) })}
                          className="ml-auto w-20 text-right"
                          aria-label={`Return quantity for ${l.name}`}
                        />
                      ) : (
                        <Badge>fully returned</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold">Refund</h2>
            <p className="text-2xl font-semibold tabular-nums">{money(refund)}</p>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" />
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)}
                     className="mt-1 accent-[var(--color-brand)]" />
              <span>
                Put stock back
                <span className="block text-xs text-fg-subtle">Uncheck for damaged goods.</span>
              </span>
            </label>
            {err && <p className="text-xs text-danger">{err}</p>}
            <Button onClick={submit} disabled={busy || refund === 0} className="w-full">
              {busy ? "Refunding…" : `Refund ${money(refund)}`}
            </Button>
          </Card>
        </div>
      )}
    </>
  );
}
