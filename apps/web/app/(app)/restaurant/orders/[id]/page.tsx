"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Schema } from "@business-os/api-client";
import type { Product } from "@business-os/types";
import { api, ApiError } from "@/lib/api";
import { Can } from "@/lib/can";
import { formatTime, money } from "@/lib/format";
import { tileCategories } from "@/lib/offline/till";
import type { TileCategory } from "@/lib/tiles";
import { errorText, useAction } from "@/lib/useAction";
import { Dialog } from "@/components/Dialog";
import { ApprovalPrompt, type Approval } from "@/components/pos/ApprovalPrompt";
import { CategoryTiles } from "@/components/pos/CategoryTiles";
import { ProductGrid } from "@/components/pos/ProductGrid";
import { Badge, Button, Card, ErrorState, Field, Input, LoadingRows } from "@/components/ui";

type Order = Schema<"OrderOut">;
type Line = Order["lines"][number];

/* One restaurant order (wave B, study 11): tap items in, add notes, send
   what's new to the kitchen (a ticket per station), and void with a reason
   once the kitchen has it. Paying the bill comes next. */
export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [cats, setCats] = useState<TileCategory[]>([]);
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<Line | null>(null);

  const load = useCallback(() => {
    setError(null);
    api<Order>(`/restaurant/orders/${id}`).then(setOrder).catch((e) => setError(errorText(e, "Couldn't load the order.")));
  }, [id]);
  useEffect(load, [load]);
  useEffect(() => {
    api<Product[]>("/pos/products").then(setProducts).catch(() => setProducts([]));
    void tileCategories().then(setCats);
  }, []);

  const add = useAction(
    (p: Product) => api<Order>(`/restaurant/orders/${id}/lines`, { method: "POST", body: JSON.stringify({ product_id: p.id, qty: 1 }) }),
    { failure: "Couldn't add it" },
  );
  const change = useAction(
    (line: Line, body: object) => api<Order>(`/restaurant/order-lines/${line.id}`, { method: "PATCH", body: JSON.stringify(body) }),
    { failure: "Couldn't change it" },
  );
  const send = useAction(
    () => api<Order>(`/restaurant/orders/${id}/send`, { method: "POST" }),
    { success: "Sent to the kitchen", failure: "Couldn't send it" },
  );
  const cancel = useAction(
    () => api<Order>(`/restaurant/orders/${id}/cancel`, { method: "POST" }),
    { success: "Order cancelled", failure: "Couldn't cancel it" },
  );

  const colors = useMemo(() => new Map(cats.map((c) => [c.id, c.color])), [cats]);
  const shown = useMemo(() => {
    const all = (products ?? []).filter((p) => p.active);
    if (q) return all.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
    return category ? all.filter((p) => p.category_id === category) : all;
  }, [products, category, q]);
  const tileCats = useMemo(() => {
    const count = new Map<string, number>();
    for (const p of products ?? []) if (p.category_id) count.set(p.category_id, (count.get(p.category_id) ?? 0) + 1);
    return cats.filter((c) => count.has(c.id)).map((c) => ({ ...c, count: count.get(c.id) ?? 0 }));
  }, [products, cats]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!order || !products) return <LoadingRows rows={4} label="Loading the order" />;

  const open = order.status === "open";
  const title = order.order_type === "dine_in" ? `Table ${order.table_label}` : `Takeaway · token ${order.token}`;
  const unsent = order.lines.some((l) => l.qty > l.sent_qty);
  const anySent = order.lines.some((l) => l.sent_qty > 0);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
      <section aria-label="Menu" className="@container min-w-0">
        {open && (
          <>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the menu…" aria-label="Search the menu" className="mb-3" />
            {!q && tileCats.length > 0 && (
              <CategoryTiles categories={tileCats} value={category} onChange={setCategory} showAll={false} big={false} />
            )}
            <ProductGrid products={shown} locked={add.busy} categoryColors={colors} label="Menu items"
                         onAdd={async (p) => { const o = await add.run(p); if (o) setOrder(o); }} />
          </>
        )}
      </section>

      <aside aria-label="Order" className="space-y-3 lg:sticky lg:top-20 lg:self-start">
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-semibold">{title}</h2>
            {order.guests && <span className="text-sm text-fg-muted">{order.guests} guests</span>}
            {!open && <Badge>{order.status === "cancelled" ? "Cancelled" : "Paid"}</Badge>}
            <Link href="/restaurant" className="ms-auto text-sm text-brand hover:underline">Back to floor</Link>
          </div>
          {order.lines.length === 0 ? <p className="text-sm text-fg-muted">Tap items on the menu to add them.</p> : (
            <ul aria-label="Order lines" className="divide-y divide-line text-sm">
              {order.lines.filter((l) => l.qty > 0).map((l) => (
                <OrderLine key={l.id} line={l} open={open} busy={change.busy}
                           onQty={async (qty) => {
                             if (qty < l.sent_qty) { setVoiding(l); return; }
                             const o = await change.run(l, { qty }); if (o) setOrder(o);
                           }}
                           onNote={async (note) => { const o = await change.run(l, { note }); if (o) setOrder(o); }}
                           onVoid={() => setVoiding(l)} />
              ))}
            </ul>
          )}
          <p className="flex justify-between border-t border-line pt-2 font-semibold tabular-nums">
            <span>Running bill</span><span>{money(order.total_minor)}</span>
          </p>
          {open && (
            <Can perm="restaurant.order.create">
              <div className="flex flex-wrap gap-2">
                <Button className="flex-1" disabled={!unsent || send.busy}
                        onClick={async () => { const o = await send.run(); if (o) setOrder(o); }}>
                  {send.busy ? "Sending…" : "Send to kitchen"}
                </Button>
                {!anySent && (
                  <Button variant="ghost" disabled={cancel.busy}
                          onClick={async () => { if ((await cancel.run()) !== undefined) router.push("/restaurant"); }}>Cancel order</Button>
                )}
              </div>
            </Can>
          )}
        </Card>

        {order.kots.length > 0 && (
          <section aria-label="Kitchen tickets" className="space-y-2">
            <h3 className="text-sm font-semibold">Kitchen tickets</h3>
            <ul className="space-y-2">
              {[...order.kots].reverse().map((k) => (
                <li key={k.id} className={`rounded-lg border p-3 text-sm ${k.kind === "void" ? "border-danger" : "border-line"}`}>
                  <p className="flex flex-wrap gap-2 font-medium">
                    <span>{k.kind === "void" ? "VOID" : "KOT"} #{k.number}</span>
                    <span className="text-fg-muted">{k.station_name} · {formatTime(k.created_at)}</span>
                  </p>
                  <ul>
                    {k.lines.map((x, i) => <li key={i}>{x.qty} × {x.name}{x.note ? ` (${x.note})` : ""}</li>)}
                  </ul>
                  {k.reason && <p className="text-xs text-fg-muted">Why: {k.reason}{k.approved_by_name ? ` · approved by ${k.approved_by_name}` : ""}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>

      {voiding && <VoidDialog line={voiding} onClose={() => setVoiding(null)} onDone={(o) => { setVoiding(null); setOrder(o); }} />}
    </div>
  );
}

function OrderLine({ line, open, busy, onQty, onNote, onVoid }: {
  line: Line; open: boolean; busy: boolean; onQty: (qty: number) => void; onNote: (note: string) => void; onVoid: () => void;
}) {
  const [note, setNote] = useState(line.note);
  const sentAll = line.sent_qty >= line.qty;
  return (
    <li className="space-y-1 py-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 font-medium">{line.name}</span>
        {line.sent_qty > 0 && <Badge tone={sentAll ? "success" : "warning"}>{sentAll ? "Sent" : `${line.sent_qty} sent`}</Badge>}
        <span className="tabular-nums">{money(Math.round(line.qty * line.unit_price_minor))}</span>
      </div>
      {open && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="subtle" disabled={busy} aria-label={`One less ${line.name}`} onClick={() => onQty(line.qty - 1)}>−</Button>
          <span className="w-8 text-center tabular-nums" aria-label={`${line.name} quantity`}>{line.qty}</span>
          <Button size="sm" variant="subtle" disabled={busy} aria-label={`One more ${line.name}`} onClick={() => onQty(line.qty + 1)}>+</Button>
          <Input value={note} maxLength={200} placeholder="Note, e.g. less spicy" aria-label={`Note for ${line.name}`}
                 className="min-w-0 flex-1" onChange={(e) => setNote(e.target.value)}
                 onBlur={() => { if (note !== line.note) onNote(note); }} />
          <Button size="sm" variant="ghost" aria-label={`Void ${line.name}`} onClick={onVoid}>Void</Button>
        </div>
      )}
    </li>
  );
}

function VoidDialog({ line, onClose, onDone }: { line: Line; onClose: () => void; onDone: (o: Order) => void }) {
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
  const [needPin, setNeedPin] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reachesKitchen = Number(qty) > line.qty - line.sent_qty;

  async function go(approval?: Approval): Promise<string | null> {
    try {
      const o = await api<Order>(`/restaurant/order-lines/${line.id}/void`, {
        method: "POST", body: JSON.stringify({ qty: Number(qty), reason, ...(approval ?? {}) }), notify: false });
      onDone(o);
      return null;
    } catch (e) {
      if (e instanceof ApiError && e.status === 403 && !approval) { setNeedPin(true); return null; }
      return errorText(e, "Couldn't void it");
    }
  }

  return (
    <>
      <Dialog open={!needPin} onOpenChange={(o) => { if (!o) onClose(); }} title={`Void ${line.name}`} size="sm"
              footer={<Button variant="danger" disabled={!Number(qty) || (reachesKitchen && reason.trim().length < 3)}
                              onClick={async () => setErr(await go())}>Void</Button>}>
        <div className="space-y-3">
          <Field label="How many">
            <Input type="number" inputMode="decimal" min={0} max={line.qty} step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          {reachesKitchen && (
            <>
              <p className="text-sm text-warning">The kitchen already has this. A VOID ticket goes to them, and a manager may need to approve.</p>
              <Field label="Why"><Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} /></Field>
            </>
          )}
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        </div>
      </Dialog>
      <ApprovalPrompt open={needPin} need="restaurant.order.void" source="/restaurant/approvers"
                      reason={`Void ${qty} × ${line.name}: ${reason}`}
                      onApprove={(a) => go(a)} onCancel={() => { setNeedPin(false); onClose(); }} />
    </>
  );
}
