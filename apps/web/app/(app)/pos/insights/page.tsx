"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { OccasionForecast, RestockItem } from "@business-os/types";
import { api } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";

export default function PosInsights() {
  const router = useRouter();
  const [restock, setRestock] = useState<RestockItem[]>([]);
  const [occasions, setOccasions] = useState<OccasionForecast[]>([]);
  const [ordering, setOrdering] = useState(false);

  useEffect(() => {
    api<RestockItem[]>("/pos/restock").then(setRestock).catch(() => {});
    api<{ occasions: OccasionForecast[] }>("/pos/forecast").then((r) => setOccasions(r.occasions)).catch(() => {});
  }, []);

  // The advice becomes an order in one click — this is the loop that used to
  // dead-end at "here's a number you have no way to receive".
  async function orderAll() {
    setOrdering(true);
    try {
      await api("/pos/purchase-orders", {
        method: "POST",
        body: JSON.stringify({
          items: restock.map((r) => ({ product_id: r.product_id, qty: r.recommend_qty })),
          notes: "From restock advice",
        }),
      });
      router.push("/pos/purchase-orders");
    } finally {
      setOrdering(false);
    }
  }

  return (
    <>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory insights</h1>
        <Link href="/pos" className="text-sm text-brand hover:underline">← Back to billing</Link>
      </div>
      <p className="mb-6 text-sm text-fg-muted">AI restocking advice and seasonal demand forecasts.</p>

      {/* Restock now */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">✦ Restock now</h2>
        {restock.length > 0 && (
          <Button size="sm" onClick={orderAll} disabled={ordering}>
            {ordering ? "Creating…" : "Create purchase order"}
          </Button>
        )}
      </div>
      <div className="mb-8 space-y-2">
        {restock.length === 0 && <Card><p className="text-sm text-fg-subtle">Everything&apos;s well stocked. 👍</p></Card>}
        {restock.map((r) => (
          <Card key={r.product_id} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{r.name}</p>
              <p className="text-xs text-fg-subtle">{r.reason}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-warning">+{r.recommend_qty} {r.unit}</p>
              <p className="text-[11px] text-fg-subtle">{r.stock_qty} in stock</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Seasonal forecast */}
      <h2 className="mb-2 text-sm font-semibold">✦ 60-day seasonal forecast</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {occasions.length === 0 && <Card><p className="text-sm text-fg-subtle">No upcoming events in the next 60 days.</p></Card>}
        {occasions.map((o) => (
          <Card key={o.occasion} className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">{o.occasion}</p>
                <p className="text-xs text-fg-subtle">{o.event_date} · in {o.days_until} days</p>
              </div>
              <Badge tone="brand">+{o.uplift_pct}% demand</Badge>
            </div>
            <ul className="space-y-1 border-t border-line pt-2 text-sm">
              {o.items.filter((it) => it.recommend_qty > 0).length === 0 && (
                <li className="text-xs text-fg-subtle">Stock levels look sufficient.</li>
              )}
              {o.items.filter((it) => it.recommend_qty > 0).map((it) => (
                <li key={it.product_id} className="flex justify-between">
                  <span>{it.name}</span>
                  <span className="text-fg-muted">project {it.projected_units} · <span className="text-warning">stock +{it.recommend_qty}</span></span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
