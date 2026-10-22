"use client";

import { useState } from "react";
import type { RefundableLine, SaleLookup } from "@business-os/types";
import { api, ApiError } from "@/lib/api";
import { Can } from "@/lib/can";
import { money, relativeDate } from "@/lib/format";
import { useAction } from "@/lib/useAction";
import { Badge, Button, Card, ErrorState, Input } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { blurOnWheel } from "@/components/pos/labels";
import { previewRefund } from "@/components/pos/refund";

/* Returns are looked up by receipt: that is the only identifier a customer
   standing at the counter actually has. */


export default function ReturnsPage() {
  const [q, setQ] = useState("");
  const [sale, setSale] = useState<SaleLookup | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(true);
  const [findError, setFindError] = useState<{ text: string; retry: boolean } | null>(null);
  const [finding, setFinding] = useState(false);
  const [done, setDone] = useState<{ refund: number; restocked: boolean } | null>(null);

  const lookup = (id: string) => api<SaleLookup>(`/pos/sales/${encodeURIComponent(id)}`);

  async function find(e?: React.FormEvent) {
    e?.preventDefault();
    const id = q.trim();
    if (!id) return;
    setFindError(null);
    setDone(null);
    setSale(null);
    setFinding(true);
    try {
      setSale(await lookup(id));
      setQty({});
    } catch (err) {
      // "Not found" (or not even a receipt number: 422) means check the number;
      // anything else means try again (I9).
      setFindError(err instanceof ApiError && (err.status === 404 || err.status === 422)
        ? { text: "No sale with that receipt number. Check it against the receipt.", retry: false }
        : { text: "Couldn't look the sale up. Check the connection and try again.", retry: true });
    } finally {
      setFinding(false);
    }
  }

  // From the server's own figures, never price x qty — that ignored the
  // discount share and could hand out more cash than was recorded (I8).
  const refund = sale ? previewRefund(sale.returnable, qty, sale.refundable_minor) : 0;
  const chosen = Object.values(qty).some((n) => n > 0);
  const over = sale?.returnable.find((l) => (qty[l.sale_item_id] ?? 0) > l.qty_returnable);

  const submit = useAction(async () => {
    if (!sale) return undefined;
    const items = Object.entries(qty).filter(([, n]) => n > 0).map(([sale_item_id, n]) => ({ sale_item_id, qty: n }));
    const r = await api<{ refund_minor: number }>(`/pos/sales/${encodeURIComponent(sale.id)}/returns`, {
      method: "POST",
      body: JSON.stringify({ items, reason, restock }),
    });
    setDone({ refund: r.refund_minor, restocked: restock });
    setQty({});
    setReason("");
    // Reflect what's left. The return itself is saved; if the refresh fails,
    // clear the sale (a stale "returnable" count invites a second return) and
    // say why, rather than leaving the old numbers up.
    try {
      setSale(await lookup(sale.id));
    } catch {
      setSale(null);
      setFindError({ text: "Return saved, but the sale couldn't be reloaded. Look it up again to see what's left.", retry: true });
    }
    return r;
  }, { failure: "Couldn't process that return" });

  const columns: Column<RefundableLine>[] = [
    {
      key: "item", header: "Item", primary: true,
      cell: (l) => (
        <div className="min-w-0">
          <p className="font-medium break-words">{l.name}</p>
          <p className="text-xs text-fg-subtle">
            {money(l.paid_minor)} paid for {l.qty_sold}
          </p>
        </div>
      ),
    },
    { key: "sold", header: "Sold", align: "right", cell: (l) => l.qty_sold },
    { key: "returned", header: "Returned", align: "right", cell: (l) => l.qty_returned || "—" },
    {
      key: "now", header: "Return now", align: "right", wrap: true,
      cell: (l) => l.qty_returnable > 0 ? (
        <Input
          type="number" inputMode="decimal" min={0} max={l.qty_returnable} step="any" onWheel={blurOnWheel}
          value={qty[l.sale_item_id] ?? ""} placeholder={`max ${l.qty_returnable}`}
          onChange={(e) => setQty({ ...qty, [l.sale_item_id]: Number(e.target.value || 0) })}
          className="ml-auto w-24 text-right"
          aria-label={`Return quantity for ${l.name}`}
        />
      ) : (
        <Badge>fully returned</Badge>
      ),
    },
  ];

  return (
    <>
      <p className="mb-6 text-sm text-fg-muted">Find the sale, choose what&apos;s coming back, refund it.</p>

      <form onSubmit={find} className="mb-5 flex max-w-md flex-wrap gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Receipt / sale ID" aria-label="Receipt number"
               autoComplete="off" spellCheck={false} className="min-w-0 flex-1" />
        <Button type="submit" disabled={!q.trim() || finding}>{finding ? "Finding…" : "Find sale"}</Button>
      </form>

      {findError && (
        <div className="mb-5 max-w-md">
          <ErrorState message={findError.text} onRetry={findError.retry ? () => void find() : undefined} />
        </div>
      )}

      {done && (
        <Card className="mb-5 border-success/40 bg-success/5">
          <p className="text-sm font-medium text-success">Refunded {money(done.refund)}</p>
          <p className="mt-0.5 text-xs text-fg-muted">
            {done.restocked ? "Stock returned to the shelf." : "Stock not restocked."}
            {sale?.fbr_status && " A debit note has been filed with FBR."}
          </p>
        </Card>
      )}

      {sale && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">Sale {sale.id.slice(0, 8).toUpperCase()}</p>
                <p className="text-xs text-fg-subtle">{relativeDate(sale.created_at)} · {money(sale.amount_due_minor || sale.total_minor)} paid</p>
              </div>
              {sale.fbr_invoice_number && <Badge tone="success">Filed with FBR</Badge>}
            </div>
            <DataTable columns={columns} rows={sale.returnable} rowKey={(l) => l.sale_item_id} caption="Items on this sale" />
          </div>

          <Card className="h-fit space-y-3">
            <h2 className="text-sm font-semibold">Refund</h2>
            <p className="text-2xl font-semibold tabular-nums">{money(refund)}</p>
            {sale.refundable_minor === 0 && (
              <p className="text-xs text-fg-muted">Everything paid for this sale has been refunded.</p>
            )}
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" aria-label="Reason" />
            <label className="flex min-h-11 cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)}
                     className="mt-0.5 size-6 shrink-0 accent-[var(--color-brand)]" />
              <span>
                Put stock back
                <span className="block text-xs text-fg-subtle">Uncheck for damaged goods.</span>
              </span>
            </label>
            {over && <p role="alert" className="text-xs text-danger">Only {over.qty_returnable} of {over.name} can be returned.</p>}
            {submit.error && <p role="alert" className="text-xs text-danger">{submit.error}</p>}
            <Can perm="pos.sale.refund" fallback={<p className="text-sm text-fg-muted">Ask a manager to give the refund.</p>}>
              <Button onClick={() => void submit.run()} disabled={submit.busy || !chosen || !!over || refund === 0} className="w-full">
                {submit.busy ? "Refunding…" : `Refund ${money(refund)}`}
              </Button>
            </Can>
          </Card>
        </div>
      )}
    </>
  );
}
