"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PAYMENT_METHODS, type PosSummary, type Product, type Sale } from "@business-os/types";
import { api } from "@/lib/api";
import { money, moneyCompact } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Button, Card, Input, Select } from "@/components/ui";
import { FbrStamp } from "@/components/pos/FbrStamp";

interface Line {
  product: Product;
  qty: number;
}

interface DrawerLite {
  expected_minor: number;
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
  const [category, setCategory] = useState("");
  const [summary, setSummary] = useState<PosSummary | null>(null);
  const [drawer, setDrawer] = useState<DrawerLite | null | undefined>(undefined); // undefined = loading
  const searchRef = useRef<HTMLInputElement>(null);
  const paidRef = useRef<HTMLInputElement>(null);

  const search = useCallback((text: string) => {
    api<Product[]>(`/pos/products${text ? `?q=${encodeURIComponent(text)}` : ""}`)
      .then(setResults)
      .catch(() => setResults([]));
  }, []);

  const loadStatus = useCallback(() => {
    api<PosSummary>("/pos/summary").then(setSummary).catch(() => setSummary(null));
    api<DrawerLite>("/pos/drawer/current").then(setDrawer).catch(() => setDrawer(null));
  }, []);

  useEffect(() => search(""), [search]);
  useEffect(loadStatus, [loadStatus]);
  useEffect(() => {
    const id = setTimeout(() => search(q), 200);
    return () => clearTimeout(id);
  }, [q, search]);

  // Categories that exist in the catalog; typing a search overrides the chip.
  const categories = useMemo(
    () => [...new Set(results.map((p) => p.category).filter(Boolean))].sort(),
    [results]);
  const shown = useMemo(
    () => (category && !q ? results.filter((p) => p.category === category) : results),
    [results, category, q]);

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
    loadStatus(); // today's figures and the drawer expectation just changed
    searchRef.current?.focus();
  }

  // Keyboard-first checkout (cashier never touches the mouse).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === "F1") { e.preventDefault(); setCart([]); }
      else if (e.key === "F6") { e.preventDefault(); paidRef.current?.focus(); }
      else if (e.key === "F7") { e.preventDefault(); void charge(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [charge]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      {/* Catalog */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Point of Sale</h1>
          <div className="flex gap-4 text-sm">
            <Link href="/pos/insights" className="text-brand hover:underline">✦ Insights</Link>
            <Link href="/pos/purchase-orders" className="text-brand hover:underline">Orders</Link>
            <Link href="/pos/drawer" className="text-brand hover:underline">Drawer</Link>
            <Link href="/pos/returns" className="text-brand hover:underline">Returns</Link>
            <Link href="/pos/products" className="text-brand hover:underline">Manage {t("products").toLowerCase()}</Link>
          </div>
        </div>
        {/* The shift at a glance — what Square keeps in the cashier's eyeline. */}
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          {summary && (
            <span className="rounded-lg border border-line bg-surface px-2.5 py-1.5 tabular-nums text-fg-muted">
              Today: <span className="font-semibold text-fg">{moneyCompact(summary.sales_today_total_minor)}</span>
              {" · "}{summary.sales_today_count} sale{summary.sales_today_count === 1 ? "" : "s"}
            </span>
          )}
          {summary && summary.low_stock_count > 0 && (
            <Link href="/pos/products" className="rounded-lg border border-warning/30 bg-warning/5 px-2.5 py-1.5 text-warning">
              {summary.low_stock_count} low stock
            </Link>
          )}
          {drawer === null && (
            <Link href="/pos/drawer" className="rounded-lg border border-warning/30 bg-warning/5 px-2.5 py-1.5 text-warning">
              No drawer open — open one to reconcile cash
            </Link>
          )}
          {drawer && (
            <Link href="/pos/drawer" className="rounded-lg border border-line bg-surface px-2.5 py-1.5 tabular-nums text-fg-muted">
              Drawer: <span className="font-semibold text-fg">{moneyCompact(drawer.expected_minor)}</span> expected
            </Link>
          )}
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

        {categories.length > 1 && !q && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            <Chip active={category === ""} onClick={() => setCategory("")}>All</Chip>
            {categories.map((c) => (
              <Chip key={c} active={category === c} onClick={() => setCategory(c)}>{c}</Chip>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {shown.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-fg-subtle">
              No {t("products").toLowerCase()}.{" "}
              <Link href="/pos/products" className="text-brand hover:underline">Add some →</Link>
            </p>
          )}
          {shown.map((p) => (
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
          <Input ref={paidRef} type="number" min={0} value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="Amount paid" />
        </div>
        {paidMinor > 0 && paidMinor >= total && (
          <p className="mt-2 text-right text-sm text-success">Change: {money(paidMinor - total)}</p>
        )}
        <Button onClick={charge} disabled={cart.length === 0} className="mt-3 w-full">
          Charge {money(total)}
        </Button>
        <p className="mt-2 text-center text-[11px] text-fg-subtle">
          <kbd>F2</kbd> search · <kbd>F6</kbd> pay · <kbd>F7</kbd> charge · <kbd>F1</kbd> clear
        </p>
      </Card>

      {receipt && <Receipt sale={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
        active ? "border-brand bg-brand-subtle text-brand" : "border-line text-fg-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
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
        <div onClick={(e) => e.stopPropagation()} className="receipt-print space-y-2">
          <p className="text-center text-base font-semibold text-success">✓ Sale complete</p>
          {/* Full id, not a slice: this is what Returns looks the sale up by. */}
          <p className="text-center font-mono text-[10px] text-fg-subtle">{sale.id}</p>
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
            {sale.tax_minor > 0 && <Row label="incl. sales tax" value={money(sale.tax_minor)} />}
            <Row label="Paid" value={money(sale.paid_minor)} />
            <Row label="Change" value={money(sale.change_minor)} />
          </div>

          <FbrStamp invoiceNumber={sale.fbr_invoice_number} status={sale.fbr_status} />

          <div className="no-print flex gap-2">
            <Button variant="subtle" onClick={() => window.print()} className="flex-1">Print</Button>
            <Button onClick={onClose} className="flex-1">New sale</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
