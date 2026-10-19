"use client";

import { useCallback, useEffect, useState } from "react";
import type { Product } from "@business-os/types";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { money, relativeDate } from "@/lib/format";
import { useAction } from "@/lib/useAction";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingRows, Select } from "@/components/ui";
import { Dialog } from "@/components/Dialog";
import { DataTable, type Column } from "@/components/DataTable";
import { blurOnWheel } from "@/components/pos/labels";

interface Supplier { id: string; name: string; phone: string; email: string; notes: string }
interface PoLine { id: string; product_id: string | null; name: string; qty: number; cost_minor: number; received_qty: number }
interface Po {
  id: string;
  supplier_name: string | null;
  status: string;
  notes: string;
  created_at: string;
  total_cost_minor: number;
  items: PoLine[];
}

const statusTone = { ordered: "warning", received: "success", cancelled: "neutral" } as const;

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<Po[] | null>(null); // null = loading
  const [loadError, setLoadError] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [open, setOpen] = useState<string | null>(null);   // expanded PO
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoadError(null);
    api<Po[]>("/pos/purchase-orders").then(setOrders).catch(() => setLoadError("Couldn't load purchase orders."));
    api<Supplier[]>("/pos/suppliers").then(setSuppliers).catch(() => setSuppliers([]));
    api<Product[]>("/pos/products").then(setProducts).catch(() => setProducts([]));
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">Order from suppliers, receive deliveries, stock rises automatically.</p>
        <Button size="sm" variant={creating ? "subtle" : "primary"} onClick={() => setCreating((v) => !v)}>
          {creating ? "Close form" : "New order"}
        </Button>
      </div>

      {creating && (
        <NewOrder suppliers={suppliers} products={products} onDone={() => { setCreating(false); load(); }} />
      )}

      {loadError ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : orders === null ? (
        <LoadingRows label="Loading purchase orders" />
      ) : (
        <div className="space-y-3">
          {orders.length === 0 && !creating && (
            <EmptyState title="No purchase orders yet." hint="The Insights page can create one from restock advice." />
          )}
          {orders.map((po) => (
            <Card key={po.id} className="p-0">
              <button
                type="button"
                aria-expanded={open === po.id}
                className="flex min-h-14 w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 text-left"
                onClick={() => setOpen(open === po.id ? null : po.id)}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words">
                    {po.supplier_name ?? "No supplier"} · {po.items.length} line{po.items.length === 1 ? "" : "s"}
                  </p>
                  <p className="text-xs text-fg-subtle break-words">{relativeDate(po.created_at)}{po.notes && ` · ${po.notes}`}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums">{money(po.total_cost_minor)}</span>
                  <Badge tone={statusTone[po.status as keyof typeof statusTone] ?? "neutral"}>{po.status}</Badge>
                </div>
              </button>
              {open === po.id && <PoDetail po={po} onChanged={load} />}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function PoDetail({ po, onChanged }: { po: Po; onChanged: () => void }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [confirmCancel, setConfirmCancel] = useState(false);
  const id = encodeURIComponent(po.id);

  const receive = useAction(
    (items: { po_item_id: string; qty: number }[]) =>
      api(`/pos/purchase-orders/${id}/receive`, { method: "POST", body: JSON.stringify({ items }) }),
    { success: "Delivery received — stock updated", failure: "Couldn't receive that" });
  const cancel = useAction(
    () => api(`/pos/purchase-orders/${id}/cancel`, { method: "POST" }),
    { success: "Order cancelled", failure: "Couldn't cancel the order" });

  async function doReceive() {
    const items = Object.entries(qty).filter(([, n]) => n > 0).map(([po_item_id, n]) => ({ po_item_id, qty: n }));
    if (!items.length) return;
    if (await receive.run(items) !== undefined) { setQty({}); onChanged(); }
  }

  async function doCancel() {
    if (await cancel.run() !== undefined) { setConfirmCancel(false); onChanged(); }
  }

  const columns: Column<PoLine>[] = [
    { key: "name", header: "Item", primary: true, cell: (l) => <span className="break-words">{l.name}</span> },
    { key: "qty", header: "Ordered", align: "right", cell: (l) => l.qty },
    { key: "rcv", header: "Received", align: "right", cell: (l) => l.received_qty || "—" },
    { key: "cost", header: "Unit cost", align: "right", cell: (l) => money(l.cost_minor) },
  ];
  if (po.status === "ordered") {
    columns.push({
      key: "now", header: "Receive now", align: "right",
      cell: (l) => {
        const outstanding = l.qty - l.received_qty;
        return outstanding > 0 ? (
          <Input type="number" inputMode="decimal" min={0} max={outstanding} step="any" onWheel={blurOnWheel}
                 value={qty[l.id] ?? ""} placeholder={String(outstanding)}
                 onChange={(e) => setQty({ ...qty, [l.id]: Number(e.target.value || 0) })}
                 className="ml-auto w-24 text-right" aria-label={`Receive quantity for ${l.name}`} />
        ) : (
          <Badge tone="success">complete</Badge>
        );
      },
    });
  }

  return (
    <div className="border-t border-line px-4 py-3">
      <DataTable columns={columns} rows={po.items} rowKey={(l) => l.id} caption="Order lines" className="[&_dd]:overflow-visible" />
      {po.status === "ordered" && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(true)}>Cancel order</Button>
          <Button size="sm" onClick={() => void doReceive()} disabled={receive.busy}>{receive.busy ? "Receiving…" : "Receive delivery"}</Button>
        </div>
      )}
      <Dialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel this purchase order?"
        description="Nothing more can be received against it. Stock already received stays."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>Keep order</Button>
            <Button variant="danger" onClick={() => void doCancel()} disabled={cancel.busy}>
              {cancel.busy ? "Cancelling…" : "Cancel order"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">{po.supplier_name ?? "No supplier"} · {money(po.total_cost_minor)}</p>
      </Dialog>
    </div>
  );
}

function NewOrder({ suppliers, products, onDone }: {
  suppliers: Supplier[];
  products: Product[];
  onDone: () => void;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [lines, setLines] = useState<{ product_id: string; qty: string }[]>([{ product_id: "", qty: "" }]);
  const [notes, setNotes] = useState("");

  const place = useAction(async () => {
    const items = lines
      .filter((l) => l.product_id && Number(l.qty) > 0)
      .map((l) => ({ product_id: l.product_id, qty: Number(l.qty) }));
    let sid = supplierId || null;
    if (!sid && newSupplier.trim()) {
      const s = await api<Supplier>("/pos/suppliers", { method: "POST", body: JSON.stringify({ name: newSupplier.trim() }) });
      sid = s.id;
    }
    return api("/pos/purchase-orders", { method: "POST", body: JSON.stringify({ supplier_id: sid, items, notes }) });
  }, { success: "Purchase order placed", failure: "Couldn't create the order" });

  const ready = lines.some((l) => l.product_id && Number(l.qty) > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    if (await place.run() !== undefined) onDone();
  }

  const setLine = (i: number, patch: Partial<{ product_id: string; qty: string }>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <Card className="mb-5">
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Supplier">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— none / new —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          {!supplierId && (
            <Field label="Or add a supplier">
              <Input value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} placeholder="e.g. Karachi Wholesale" />
            </Field>
          )}
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-xs font-medium text-fg-muted">Lines</legend>
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_6rem_auto] items-center gap-2">
              <Select value={line.product_id} aria-label={`Product, line ${i + 1}`}
                      onChange={(e) => setLine(i, { product_id: e.target.value })}>
                <option value="">— product —</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              <Input type="number" inputMode="decimal" min={0} step="any" placeholder="Qty" value={line.qty}
                     aria-label={`Quantity, line ${i + 1}`} onWheel={blurOnWheel}
                     onChange={(e) => setLine(i, { qty: e.target.value })} />
              <button
                type="button"
                aria-label={`Remove line ${i + 1}`}
                disabled={lines.length === 1}
                onClick={() => setLines(lines.filter((_, j) => j !== i))}
                className="grid size-9 place-items-center rounded-lg text-fg-subtle hover:bg-elevated hover:text-danger disabled:opacity-30 pointer-coarse:size-11"
              >
                <X size={16} aria-hidden />
              </button>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => setLines([...lines, { product_id: "", qty: "" }])}>
            + Add line
          </Button>
        </fieldset>

        <Field label="Notes"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></Field>
        <Button type="submit" disabled={place.busy || !ready}>{place.busy ? "Creating…" : "Place order"}</Button>
      </form>
    </Card>
  );
}
