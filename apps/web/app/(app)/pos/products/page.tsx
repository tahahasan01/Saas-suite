"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Product } from "@business-os/types";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Badge, Button, Card, Field, Input } from "@/components/ui";

const blank = { name: "", price: "", stock: "", barcode: "", low: "", hs_code: "", tax_rate: "" };

/** Minor units in the API, rupees in the input — convert at the boundary only. */
const toMinor = (rupees: string) => Math.round(Number(rupees || 0) * 100);

export default function ProductsPage() {
  const { t } = useSession();
  const [items, setItems] = useState<Product[]>([]);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(() => {
    api<Product[]>(`/pos/products?include_archived=${showArchived}`)
      .then(setItems)
      .catch(() => setItems([]));
  }, [showArchived]);
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
          price_minor: toMinor(form.price),
          stock_qty: Number(form.stock || 0),
          low_stock_at: Number(form.low || 0),
          hs_code: form.hs_code,
          tax_rate: Number(form.tax_rate || 0),
        }),
      });
      setForm(blank);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: Partial<Product>) {
    await api(`/pos/products/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    setEditing(null);
    load();
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
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-xs text-fg-subtle">{items.length} {word.toLowerCase()}</span>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-muted">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="accent-[var(--color-brand)]"
              />
              Show archived
            </label>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-subtle">
                <th className="p-3">Name</th>
                <th className="p-3">Price</th>
                <th className="p-3">Stock</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={4} className="p-6 text-center text-fg-subtle">No {word.toLowerCase()} yet.</td></tr>
              )}
              {items.map((p) =>
                editing === p.id ? (
                  <EditRow key={p.id} p={p} onCancel={() => setEditing(null)} onSave={(b) => patch(p.id, b)} />
                ) : (
                  <ViewRow
                    key={p.id}
                    p={p}
                    onEdit={() => setEditing(p.id)}
                    onArchive={() => patch(p.id, { active: !p.active })}
                  />
                ),
              )}
            </tbody>
          </table>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-semibold">Add {t("product")}</h2>
          <form onSubmit={add} className="space-y-3">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price (PKR)"><Input type="number" min={0} step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required /></Field>
              <Field label="Stock"><Input type="number" min={0} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Barcode"><Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></Field>
              <Field label="Low-stock at"><Input type="number" min={0} value={form.low} onChange={(e) => setForm({ ...form, low: e.target.value })} /></Field>
            </div>
            {/* Required on every FBR line item — a wrong HS code is the most
                common rejection (error 0052). */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="HS code"><Input value={form.hs_code} placeholder="0101.2100" onChange={(e) => setForm({ ...form, hs_code: e.target.value })} /></Field>
              <Field label="Tax rate %"><Input type="number" min={0} max={100} step="0.01" value={form.tax_rate} placeholder="18" onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} /></Field>
            </div>
            <Button type="submit" disabled={busy} className="w-full">{busy ? "Adding…" : `Add ${t("product")}`}</Button>
          </form>
        </Card>
      </div>
    </>
  );
}

function ViewRow({ p, onEdit, onArchive }: { p: Product; onEdit: () => void; onArchive: () => void }) {
  const low = p.active && p.low_stock_at > 0 && p.stock_qty <= p.low_stock_at;
  return (
    <tr className={`border-b border-line/60 ${p.active ? "" : "opacity-55"}`}>
      <td className="p-3">
        <p className="font-medium">{p.name}</p>
        <p className="text-xs text-fg-subtle">
          {p.barcode && <span>{p.barcode}</span>}
          {p.barcode && p.hs_code && " · "}
          {p.hs_code && <span>HS {p.hs_code}</span>}
        </p>
      </td>
      <td className="p-3 tabular-nums">
        {money(p.price_minor)}
        {p.tax_rate > 0 && <span className="ml-1 text-xs text-fg-subtle">+{p.tax_rate}%</span>}
      </td>
      <td className="p-3">
        <span className="mr-2 tabular-nums">{p.stock_qty} {p.unit}</span>
        {low && <Badge tone="warning">low</Badge>}
        {!p.active && <Badge>archived</Badge>}
      </td>
      <td className="p-3 text-right">
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={onArchive}>{p.active ? "Archive" : "Restore"}</Button>
        </div>
      </td>
    </tr>
  );
}

/* Archiving rather than deleting: a sold product is referenced by past sales,
   so removing the row would rewrite history. */
function EditRow({ p, onCancel, onSave }: { p: Product; onCancel: () => void; onSave: (b: Partial<Product>) => void }) {
  const [f, setF] = useState({
    name: p.name,
    price: (p.price_minor / 100).toString(),
    stock: p.stock_qty.toString(),
    hs_code: p.hs_code,
    tax_rate: p.tax_rate.toString(),
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave({
        name: f.name,
        price_minor: toMinor(f.price),
        stock_qty: Number(f.stock || 0),
        hs_code: f.hs_code,
        tax_rate: Number(f.tax_rate || 0),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-b border-line/60 bg-elevated/40">
      <td className="p-2">
        <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Name" />
        <div className="mt-1 grid grid-cols-2 gap-1">
          <Input value={f.hs_code} onChange={(e) => setF({ ...f, hs_code: e.target.value })} placeholder="HS code" aria-label="HS code" className="text-xs" />
          <Input type="number" min={0} max={100} step="0.01" value={f.tax_rate} onChange={(e) => setF({ ...f, tax_rate: e.target.value })} placeholder="Tax %" aria-label="Tax rate" className="text-xs" />
        </div>
      </td>
      <td className="p-2 align-top"><Input type="number" min={0} step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} aria-label="Price" /></td>
      <td className="p-2 align-top"><Input type="number" min={0} value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} aria-label="Stock" /></td>
      <td className="p-2 text-right align-top">
        <div className="flex justify-end gap-1">
          <Button size="sm" onClick={save} disabled={saving}>{saving ? "…" : "Save"}</Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </td>
    </tr>
  );
}
