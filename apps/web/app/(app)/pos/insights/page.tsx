"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { OccasionForecast, RestockItem } from "@business-os/types";
import { api } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import { Badge, Button, Card, EmptyState, ErrorState, LoadingRows } from "@/components/ui";

/** Loading, loaded or failed — an error used to look like "everything's well
 *  stocked", which is the one answer a shop must never get by mistake (I6). */
type Load<T> = { state: "loading" } | { state: "ok"; data: T } | { state: "error" };

export default function PosInsights() {
  const router = useRouter();
  const [restock, setRestock] = useState<Load<RestockItem[]>>({ state: "loading" });
  const [occasions, setOccasions] = useState<Load<OccasionForecast[]>>({ state: "loading" });

  const loadRestock = useCallback(() => {
    setRestock({ state: "loading" });
    api<RestockItem[]>("/pos/restock").then((data) => setRestock({ state: "ok", data })).catch(() => setRestock({ state: "error" }));
  }, []);
  const loadForecast = useCallback(() => {
    setOccasions({ state: "loading" });
    api<{ occasions: OccasionForecast[] }>("/pos/forecast")
      .then((r) => setOccasions({ state: "ok", data: r.occasions }))
      .catch(() => setOccasions({ state: "error" }));
  }, []);
  useEffect(() => { loadRestock(); loadForecast(); }, [loadRestock, loadForecast]);

  // The advice becomes an order in one click — this is the loop that used to
  // dead-end at "here's a number you have no way to receive".
  const order = useAction(
    (items: RestockItem[]) => api("/pos/purchase-orders", {
      method: "POST",
      body: JSON.stringify({
        items: items.map((r) => ({ product_id: r.product_id, qty: r.recommend_qty })),
        notes: "From restock advice",
      }),
    }),
    { success: "Purchase order created", failure: "Couldn't create the purchase order" });

  async function orderAll() {
    if (restock.state !== "ok") return;
    if (await order.run(restock.data) !== undefined) router.push("/pos/purchase-orders");
  }

  return (
    <>
      <p className="mb-6 text-sm text-fg-muted">AI restocking advice and seasonal demand forecasts.</p>

      {/* Restock now */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">✦ Restock now</h2>
        {restock.state === "ok" && restock.data.length > 0 && (
          <Button size="sm" onClick={() => void orderAll()} disabled={order.busy}>
            {order.busy ? "Creating…" : "Create purchase order"}
          </Button>
        )}
      </div>
      <div className="mb-8 space-y-2">
        {restock.state === "loading" && <LoadingRows label="Loading restock advice" />}
        {restock.state === "error" && <ErrorState message="Couldn't load restock advice." onRetry={loadRestock} />}
        {restock.state === "ok" && restock.data.length === 0 && <EmptyState title="Everything's well stocked." />}
        {restock.state === "ok" && restock.data.map((r) => (
          <Card key={r.product_id} className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium break-words">{r.name}</p>
              <p className="text-xs text-fg-subtle">{r.reason}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg font-semibold text-warning">+{r.recommend_qty} {r.unit}</p>
              <p className="text-[11px] text-fg-subtle">{r.stock_qty} in stock</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Seasonal forecast */}
      <h2 className="mb-2 text-sm font-semibold">✦ 60-day seasonal forecast</h2>
      {occasions.state === "loading" && <LoadingRows label="Loading forecast" />}
      {occasions.state === "error" && <ErrorState message="Couldn't load the forecast." onRetry={loadForecast} />}
      {occasions.state === "ok" && occasions.data.length === 0 && <EmptyState title="No upcoming events in the next 60 days." />}
      {occasions.state === "ok" && occasions.data.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {occasions.data.map((o) => {
            const need = o.items.filter((it) => it.recommend_qty > 0);
            return (
              <Card key={o.occasion} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{o.occasion}</p>
                    <p className="text-xs text-fg-subtle">{o.event_date} · in {o.days_until} days</p>
                  </div>
                  <Badge tone="brand">+{o.uplift_pct}% demand</Badge>
                </div>
                <ul className="space-y-1 border-t border-line pt-2 text-sm">
                  {need.length === 0 && <li className="text-xs text-fg-subtle">Stock levels look sufficient.</li>}
                  {need.map((it) => (
                    <li key={it.product_id} className="flex flex-wrap justify-between gap-x-3">
                      <span className="min-w-0 break-words">{it.name}</span>
                      <span className="text-fg-muted">project {it.projected_units} · <span className="text-warning">stock +{it.recommend_qty}</span></span>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
