"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Product } from "@business-os/types";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Badge, Button, Card, Field, Input } from "@/components/ui";

const blank = { name: "", price: "", stock: "", barcode: "", low: "" };

export default function ProductsPage() {
  const { t } = useSession();
  const [items, setItems] = useState<Product[]>([]);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Product[]>("/pos/products").then(setItems).catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/pos/products", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          barcode: form.barcode,
          price_minor: Math.round(Number(form.price || 0) * 100),
          stock_qty: Number(form.stock || 0),
          low_stock_at: Number(form.low || 0),
        }),
      });
      setForm(blank);
      load();
    } finally {
      setBusy(false);
    }
  }

  const word = t("products");

  return (
    <>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{word}</h1>
        <Link href="/pos" className="text-sm text-brand hover:underline">← Back to billing</Link>
      </div>
      <p className="mb-6 text-sm text-fg-muted">Manage your catalog and stock levels.</p>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-subtle">
                <th className="p-3">Name</th>
                <th className="p-3">Price</th>
                <th className="p-3">Stock</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={3} className="p-6 text-center text-fg-subtle">No {word.toLowerCase()} yet.</td></tr>
              )}
              {items.map((p) => {
                const low = p.low_stock_at > 0 && p.stock_qty <= p.low_stock_at;
                return (
                  <tr key={p.id} className="border-b border-line/60">
                    <td className="p-3">
                      <p className="font-medium">{p.name}</p>
                      {p.barcode && <p className="text-xs text-fg-subtle">{p.barcode}</p>}
                    </td>
                    <td className="p-3">{money(p.price_minor)}</td>
                    <td className="p-3">
                      <span className="mr-2">{p.stock_qty} {p.unit}</span>
                      {low && <Badge tone="warning">low</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-semibold">Add {t("product")}</h2>
          <form onSubmit={add} className="space-y-3">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price (PKR)"><Input type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required /></Field>
              <Field label="Stock"><Input type="number" min={0} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Barcode"><Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></Field>
              <Field label="Low-stock at"><Input type="number" min={0} value={form.low} onChange={(e) => setForm({ ...form, low: e.target.value })} /></Field>
            </div>
            <Button type="submit" disabled={busy} className="w-full">{busy ? "Adding…" : `Add ${t("product")}`}</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
