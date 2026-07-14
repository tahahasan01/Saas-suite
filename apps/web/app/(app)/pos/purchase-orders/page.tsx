"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Product } from "@business-os/types";
import { api, ApiError } from "@/lib/api";
import { money, relativeDate } from "@/lib/format";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";

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
  const [orders, setOrders] = useState<Po[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [open, setOpen] = useState<string | null>(null);   // expanded PO
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Po[]>("/pos/purchase-orders").then(setOrders).catch(() => setOrders([]));
    api<Supplier[]>("/pos/suppliers").then(setSuppliers).catch(() => setSuppliers([]));
    api<Product[]>("/pos/products").then(setProducts).catch(() => setProducts([]));
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Purchase orders</h1>
        <Link href="/pos" className="text-sm text-brand hover:underline">← Back to billing</Link>
      </div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">Order from suppliers, receive deliveries, stock rises automatically.</p>
        <Button size="sm" variant={creating ? "subtle" : "primary"} onClick={() => setCreating((v) => !v)}>
          {creating ? "Cancel" : "New order"}
        </Button>
      </div>

      {err && <p className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{err}</p>}

      {creating && (
        <NewOrder suppliers={suppliers} products={products}
                  onDone={() => { setCreating(false); load(); }} onError={setErr} />
      )}

      <div className="space-y-3">
        {orders.length === 0 && !creating && (
          <Card><p className="py-6 text-center text-sm text-fg-subtle">
            No purchase orders yet. The Insights page can create one from restock advice.
          </p></Card>
        )}
        {orders.map((po) => (
          <Card key={po.id} className="p-0">
            <button
              className="flex w-full items-center justify-between px-4 py-3 text-left"
              onClick={() => setOpen(open === po.id ? null : po.id)}
            >
              <div>
                <p className="text-sm font-medium">
                  {po.supplier_name ?? "No supplier"} · {po.items.length} line{po.items.length === 1 ? "" : "s"}
                </p>
                <p className="text-xs text-fg-subtle">{relativeDate(po.created_at)}{po.notes && ` · ${po.notes}`}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold tabular-nums">{money(po.total_cost_minor)}</span>
                <Badge tone={statusTone[po.status as keyof typeof statusTone] ?? "neutral"}>{po.status}</Badge>
              </div>
            </button>
            {open === po.id && <PoDetail po={po} onChanged={load} onError={setErr} />}
          </Card>
        ))}
      </div>
    </>
  );
}

function PoDetail({ po, onChanged, onError }: { po: Po; onChanged: () => void; onError: (e: string) => void }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  async function receive() {
    const items = Object.entries(qty).filter(([, n]) => n > 0)
      .map(([po_item_id, n]) => ({ po_item_id, qty: n }));
    if (!items.length) return;
    setBusy(true);
    try {
      await api(`/pos/purchase-orders/${po.id}/receive`, { method: "POST", body: JSON.stringify({ items }) });
      setQty({});
      onChanged();
    } catch (e) {
      onError(e instanceof ApiError && typeof e.detail === "string" ? e.detail : "Couldn't receive that.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    try {
      await api(`/pos/purchase-orders/${po.id}/cancel`, { method: "POST" });
      onChanged();
    } catch (e) {
      onError(e instanceof ApiError && typeof e.detail === "string" ? e.detail : "Couldn't cancel that.");
    }
  }

  return (
    <div className="border-t border-line px-4 py-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-fg-subtle">
            <th className="pb-2">Item</th>
            <th className="pb-2 text-right">Ordered</th>
            <th className="pb-2 text-right">Received</th>
            <th className="pb-2 text-right">Unit cost</th>
            {po.status === "ordered" && <th className="pb-2 text-right">Receive now</th>}
          </tr>
        </thead>
        <tbody>
          {po.items.map((l) => {
            const outstanding = l.qty - l.received_qty;
            return (
              <tr key={l.id} className="border-t border-line/60">
                <td className="py-2">{l.name}</td>
                <td className="py-2 text-right tabular-nums">{l.qty}</td>
                <td className="py-2 text-right tabular-nums">{l.received_qty || "—"}</td>
                <td className="py-2 text-right tabular-nums">{money(l.cost_minor)}</td>
                {po.status === "ordered" && (
                  <td className="py-2 text-right">
                    {outstanding > 0 ? (
                      <Input type="number" min={0} max={outstanding} step="any"
                             value={qty[l.id] ?? ""}
                             onChange={(e) => setQty({ ...qty, [l.id]: Number(e.target.value || 0) })}
                             className="ml-auto w-20 text-right" aria-label={`Receive ${l.name}`} />
                    ) : (
                      <Badge tone="success">complete</Badge>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {po.status === "ordered" && (
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={cancel}>Cancel order</Button>
          <Button size="sm" onClick={receive} disabled={busy}>{busy ? "Receiving…" : "Receive delivery"}</Button>
        </div>
      )}
    </div>
  );
}

function NewOrder({ suppliers, products, onDone, onError }: {
  suppliers: Supplier[];
  products: Product[];
  onDone: () => void;
  onError: (e: string) => void;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [lines, setLines] = useState<{ product_id: string; qty: string }[]>([{ product_id: "", qty: "" }]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const items = lines
      .filter((l) => l.product_id && Number(l.qty) > 0)
      .map((l) => ({ product_id: l.product_id, qty: Number(l.qty) }));
    if (!items.length) return;
    setBusy(true);
    try {
      let sid = supplierId || null;
      if (!sid && newSupplier.trim()) {
        const s = await api<Supplier>("/pos/suppliers", {
          method: "POST", body: JSON.stringify({ name: newSupplier.trim() }),
        });
        sid = s.id;
      }
      await api("/pos/purchase-orders", {
        method: "POST",
        body: JSON.stringify({ supplier_id: sid, items, notes }),
      });
      onDone();
    } catch (e) {
      onError(e instanceof ApiError && typeof e.detail === "string" ? e.detail : "Couldn't create the order.");
    } finally {
      setBusy(false);
    }
  }

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

        {lines.map((line, i) => (
          <div key={i} className="grid grid-cols-[1fr_100px] gap-3">
            <Select value={line.product_id}
                    onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, product_id: e.target.value } : l)))}>
              <option value="">— product —</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <Input type="number" min={0} step="any" placeholder="Qty" value={line.qty}
                   onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, qty: e.target.value } : l)))} />
          </div>
        ))}
        <button type="button" onClick={() => setLines([...lines, { product_id: "", qty: "" }])}
                className="text-xs text-brand hover:underline">
          + Add line
        </button>

        <Field label="Notes"><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></Field>
        <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Place order"}</Button>
      </form>
    </Card>
  );
}
