"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PAYMENT_METHODS, type Product, type Sale } from "@business-os/types";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Button, Card, Input, Select } from "@/components/ui";

interface Line {
  product: Product;
  qty: number;
}

export default function PosBilling() {
  const { t } = useSession();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [cart, setCart] = useState<Line[]>([]);
  const [discount, setDiscount] = useState("0");
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState("cash");
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const search = useCallback((text: string) => {
    api<Product[]>(`/pos/products${text ? `?q=${encodeURIComponent(text)}` : ""}`)
      .then(setResults)
      .catch(() => setResults([]));
  }, []);

  useEffect(() => search(""), [search]);
  useEffect(() => {
    const id = setTimeout(() => search(q), 200);
    return () => clearTimeout(id);
  }, [q, search]);

  function addToCart(p: Product) {
    setCart((c) => {
      const i = c.findIndex((l) => l.product.id === p.id);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { product: p, qty: 1 }];
    });
  }

  function setQty(id: string, qty: number) {
    setCart((c) => (qty <= 0 ? c.filter((l) => l.product.id !== id) : c.map((l) => (l.product.id === id ? { ...l, qty } : l))));
  }

  // Enter in search: if it's an exact barcode, add and clear.
  async function onSearchKey(e: React.KeyboardEvent) {
    if (e.key !== "Enter" || !q.trim()) return;
    const hit = results.find((p) => p.barcode === q.trim()) ?? results[0];
    if (hit) {
      addToCart(hit);
      setQ("");
    }
  }

  const subtotal = cart.reduce((s, l) => s + l.product.price_minor * l.qty, 0);
  const discountMinor = Math.round(Number(discount || 0) * 100);
  const total = Math.max(0, subtotal - discountMinor);
  const paidMinor = Math.round(Number(paid || 0) * 100);

  async function charge() {
    if (cart.length === 0) return;
    const sale = await api<Sale>("/pos/sales", {
      method: "POST",
      body: JSON.stringify({
        items: cart.map((l) => ({ product_id: l.product.id, qty: l.qty })),
        discount_minor: discountMinor,
        paid_minor: paidMinor || total,
        payment_method: method,
      }),
    });
    setReceipt(sale);
    setCart([]);
    setDiscount("0");
    setPaid("");
    search(q);
    searchRef.current?.focus();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      {/* Catalog */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Point of Sale</h1>
          <div className="flex gap-4 text-sm">
            <Link href="/pos/insights" className="text-brand hover:underline">✦ Insights</Link>
            <Link href="/pos/products" className="text-brand hover:underline">Manage {t("products").toLowerCase()}</Link>
          </div>
        </div>
        <Input
          ref={searchRef}
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onSearchKey}
          placeholder={`Scan barcode or search ${t("products").toLowerCase()}…`}
          className="mb-3"
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {results.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-fg-subtle">
              No {t("products").toLowerCase()}.{" "}
              <Link href="/pos/products" className="text-brand hover:underline">Add some →</Link>
            </p>
          )}
          {results.map((p) => (
            <button key={p.id} onClick={() => addToCart(p)}
                    className="rounded-lg border border-line bg-surface p-3 text-left transition-colors hover:border-brand/50">
              <p className="text-sm font-medium leading-tight">{p.name}</p>
              <p className="mt-1 text-sm text-brand">{money(p.price_minor)}</p>
              <p className={`text-[11px] ${p.stock_qty <= p.low_stock_at && p.low_stock_at > 0 ? "text-warning" : "text-fg-subtle"}`}>
                {p.stock_qty} {p.unit} in stock
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Cart / checkout */}
      <Card className="flex h-fit flex-col">
        <h2 className="mb-3 text-sm font-semibold">Cart ({cart.length})</h2>
        <div className="mb-3 max-h-72 space-y-2 overflow-y-auto">
          {cart.length === 0 && <p className="text-sm text-fg-subtle">Add items to start a bill.</p>}
          {cart.map((l) => (
            <div key={l.product.id} className="flex items-center gap-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate">{l.product.name}</p>
                <p className="text-xs text-fg-subtle">{money(l.product.price_minor)}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setQty(l.product.id, l.qty - 1)} className="h-6 w-6 rounded bg-elevated">−</button>
                <span className="w-7 text-center">{l.qty}</span>
                <button onClick={() => setQty(l.product.id, l.qty + 1)} className="h-6 w-6 rounded bg-elevated">+</button>
              </div>
              <span className="w-16 text-right">{money(l.product.price_minor * l.qty)}</span>
            </div>
          ))}
        </div>

        <div className="space-y-1.5 border-t border-line pt-3 text-sm">
          <Row label="Subtotal" value={money(subtotal)} />
          <div className="flex items-center justify-between">
            <span className="text-fg-muted">Discount (PKR)</span>
            <Input type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-24 py-1 text-right" />
          </div>
          <Row label="Total" value={money(total)} bold />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
          <Input type="number" min={0} value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="Amount paid" />
        </div>
        {paidMinor > 0 && paidMinor >= total && (
          <p className="mt-2 text-right text-sm text-success">Change: {money(paidMinor - total)}</p>
        )}
        <Button onClick={charge} disabled={cart.length === 0} className="mt-3 w-full">
          Charge {money(total)}
        </Button>
      </Card>

      {receipt && <Receipt sale={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "text-base font-semibold" : "text-fg-muted"}`}>
      <span>{label}</span>
      <span className={bold ? "text-fg" : ""}>{value}</span>
    </div>
  );
}

function Receipt({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <Card className="w-full max-w-xs space-y-2 text-sm" >
        <div onClick={(e) => e.stopPropagation()} className="space-y-2">
          <p className="text-center text-base font-semibold text-success">✓ Sale complete</p>
          <p className="text-center text-xs text-fg-subtle">Receipt #{sale.id.slice(0, 8).toUpperCase()}</p>
          <div className="border-t border-line pt-2">
            {sale.items.map((it, i) => (
              <div key={i} className="flex justify-between">
                <span className="truncate">{it.qty} × {it.name}</span>
                <span>{money(it.line_total_minor)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-line pt-2">
            <Row label="Total" value={money(sale.total_minor)} bold />
            <Row label="Paid" value={money(sale.paid_minor)} />
            <Row label="Change" value={money(sale.change_minor)} />
          </div>
          <Button onClick={onClose} className="w-full">New sale</Button>
        </div>
      </Card>
    </div>
  );
}
