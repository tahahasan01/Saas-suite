"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import type { PosSummary, Product, Sale } from "@business-os/types";
import { api, ApiError } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import { useHotkey, useHotkeyScope } from "@/lib/useHotkey";
import { money, moneyCompact } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Button, Card, cx, ErrorState, Input, LoadingRows } from "@/components/ui";
import { Sheet } from "@/components/Dialog";
import { keepFocus, ProductGrid } from "@/components/pos/ProductGrid";
import { CartPanel, chargeLabel, type Line, type Quote, type QuoteState } from "@/components/pos/CartPanel";
import { Receipt } from "@/components/pos/Receipt";
import { CustomerPicker, type Customer } from "@/components/contacts/CustomerPicker";

interface DrawerLite {
  expected_minor: number;
}

/** One id per cart (D-81): resending the same cart returns the original sale,
 *  so a retry after a timeout or a double F7 can never charge twice. */
function newCartKey(): string {
  // randomUUID is missing outside secure contexts (plain-http LAN tills), so
  // fall back to building a v4 UUID from getRandomValues.
  const c = globalThis.crypto as Crypto & { randomUUID?: () => string };
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** What a keyboard-wedge scanner sends: digits only, EAN-8 and up. Something
 *  that looks like this is never "searched" — a miss adds nothing. */
const BARCODE = /^\d{6,}$/;

const LOCKED_MSG = "The cart is locked until the last sale is charged again or cleared.";

const isWide = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
const finePointer = () => typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;

export default function PosBilling() {
  const { t, me } = useSession();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Product[] | null>(null); // null = first load
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [cart, setCart] = useState<Line[]>([]);
  const [discount, setDiscount] = useState("0");
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState("cash");
  const [customer, setCustomer] = useState<Customer | null>(null); // null = walk-in
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false); // the bottom sheet, below lg
  const [category, setCategory] = useState("");
  const [summary, setSummary] = useState<PosSummary | null>(null);
  const [drawer, setDrawer] = useState<DrawerLite | null | undefined>(undefined); // undefined = unknown
  const scanRef = useRef<HTMLInputElement>(null);
  const sidePaidRef = useRef<HTMLInputElement>(null);
  const sheetPaidRef = useRef<HTMLInputElement>(null);
  const focusPaidOnOpen = useRef(false);
  const qRef = useRef(q);
  qRef.current = q;
  const cartKey = useRef<string>(newCartKey());
  const inFlight = useRef(false); // a ref, so a second F7 in the same tick sees it
  const [charging, setCharging] = useState(false);
  const [chargeError, setChargeError] = useState<string | null>(null);
  // True only when we can't know whether the sale was recorded (network
  // failure or server error) — not for a refusal like "payment is short".
  const [unconfirmed, setUnconfirmed] = useState(false);

  // After a charge that wasn't confirmed, the sale may already be recorded on
  // the server. Until it is retried as-is (same cart id) or cleared on purpose,
  // the cart can't change — otherwise a retry could replay the old sale and
  // leave the new items uncharged.
  const locked = unconfirmed || charging;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  const focusScan = useCallback(() => scanRef.current?.focus({ preventScroll: true }), []);
  // After a tap on a tile or stepper. With a mouse (counter PC) the scan field
  // always takes focus back. On a touchscreen focusing it would pop the
  // on-screen keyboard over the cart on every tap; the tiles never take focus
  // there either (keepFocus), so a scanner's Enter still can't re-add them.
  const refocusAfterTap = useCallback(() => { if (finePointer()) focusScan(); }, [focusScan]);

  // Only the newest search may write the results: a slow reply for "lay" must
  // not land after the one for "lays" (P2).
  const searchSeq = useRef(0);
  const search = useCallback((text: string) => {
    const seq = ++searchSeq.current;
    api<Product[]>(`/pos/products${text ? `?q=${encodeURIComponent(text)}` : ""}`)
      .then((r) => { if (seq === searchSeq.current) { setResults(r); setCatalogError(null); } })
      .catch(() => { if (seq === searchSeq.current) setCatalogError(`Couldn't load ${t("products").toLowerCase()}.`); });
  }, [t]);

  const loadStatus = useCallback(() => {
    // Intentionally quiet: these two feed the glanceable chips above the
    // catalog. A failure hides the chip (it never shows a wrong figure), and
    // the till itself must keep selling; each has its own page that says why.
    api<PosSummary>("/pos/summary").then(setSummary).catch(() => setSummary(null));
    // null means no drawer is open; undefined means we couldn't tell (no chip).
    api<DrawerLite | null>("/pos/drawer/current")
      .then((d) => setDrawer(d ?? null))
      .catch(() => setDrawer(undefined));
  }, []);

  useEffect(loadStatus, [loadStatus]);
  useEffect(() => {
    const id = setTimeout(() => search(q), q ? 200 : 0);
    return () => clearTimeout(id);
  }, [q, search]);

  // Categories that exist in the catalog; typing a search overrides the chip.
  const categories = useMemo(
    () => [...new Set((results ?? []).map((p) => p.category).filter(Boolean))].sort(),
    [results]);
  const shown = useMemo(
    () => (category && !q ? (results ?? []).filter((p) => p.category === category) : results ?? []),
    [results, category, q]);

  // `by`: what one scan counts as — a carton barcode adds 12, a scale label its weight.
  const add = useCallback((p: Product, by = 1): boolean => {
    if (lockedRef.current) return false;
    setCart((c) => {
      const i = c.findIndex((l) => l.product.id === p.id);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, qty: Math.round((l.qty + by) * 1000) / 1000 } : l));
      return [...c, { product: p, qty: by }];
    });
    return true;
  }, []);

  // Stable, so the memoised grid doesn't redraw on every keystroke elsewhere.
  const onTile = useCallback((p: Product) => {
    add(p);
    setScanMsg(null);
    refocusAfterTap();
  }, [add, refocusAfterTap]);

  const setQty = useCallback((id: string, qty: number) => {
    if (lockedRef.current) return;
    setCart((c) => (qty <= 0 ? c.filter((l) => l.product.id !== id) : c.map((l) => (l.product.id === id ? { ...l, qty } : l))));
    refocusAfterTap();
  }, [refocusAfterTap]);

  function addScanned(p: Product, code: string) {
    if (!add(p, p.scan_qty ?? 1)) { setScanMsg(LOCKED_MSG); return; }
    // The item is in the cashier's hand, so the count is what's wrong.
    setScanMsg(p.track_stock && p.stock_qty <= 0 ? `${p.name} shows none in stock; check the count.` : null);
    if (qRef.current.trim() === code) setQ("");
  }

  // Enter in the scan field: an exact barcode first (GET /pos/products/lookup),
  // never "the first search hit" — that added Lays when Dawn Bread was scanned
  // because the results were from before the debounce (P2).
  async function onScanKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    // The field itself, not state: a wedge scanner types faster than renders.
    const text = e.currentTarget.value.trim();
    if (!text) return;
    if (lockedRef.current) { setScanMsg(LOCKED_MSG); return; }
    const looksLikeBarcode = BARCODE.test(text);
    // Clear at once, so a second scan arriving before this resolves starts clean.
    if (looksLikeBarcode) setQ("");

    try {
      const p = await api<Product>(`/pos/products/lookup?barcode=${encodeURIComponent(text)}`);
      addScanned(p, text);
      return;
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) {
        setScanMsg(`Couldn't look up ${text}. Check the connection and try again.`);
        return;
      }
    }
    if (looksLikeBarcode) {
      setScanMsg(`No product with barcode ${text}.`);
      return;
    }

    // A typed name: add only when there's no doubt which product is meant —
    // one exact name match, or a single result.
    const seq = ++searchSeq.current;
    let found: Product[];
    try {
      found = await api<Product[]>(`/pos/products?q=${encodeURIComponent(text)}`);
    } catch {
      setScanMsg(`Couldn't search for "${text}". Check the connection and try again.`);
      return;
    }
    const exact = found.filter((p) => p.name.toLowerCase() === text.toLowerCase());
    const pick = exact.length === 1 ? exact[0] : found.length === 1 ? found[0] : null;
    if (pick) { addScanned(pick, text); return; }
    if (seq === searchSeq.current) setResults(found);
    setScanMsg(found.length ? `${found.length} matches — tap the one you want.` : `Nothing matches "${text}".`);
  }

  const localSubtotal = cart.reduce((s, l) => s + l.product.price_minor * l.qty, 0);
  const discountMinor = Math.round(Number(discount || 0) * 100);

  // Totals come from the server's pricing (discount spread, tax inclusive or
  // exclusive) so the till never shows a different amount from the receipt.
  // Each quote is tagged with the cart it priced; anything else on screen is
  // labelled an estimate (P9).
  const quoteBody = useMemo(() => JSON.stringify({
    items: cart.map((l) => ({ product_id: l.product.id, qty: l.qty })),
    discount_minor: discountMinor,
    payment_method: method, // cash is rounded to the rupee, card isn't
  }), [cart, discountMinor, method]);
  const [quote, setQuote] = useState<{ body: string; quote: Quote } | null>(null);
  const [quoteFail, setQuoteFail] = useState<{ body: string; message: string } | null>(null);
  const [quoteTry, setQuoteTry] = useState(0);
  const quoteSeq = useRef(0);
  useEffect(() => {
    const seq = ++quoteSeq.current;
    if (cart.length === 0) return;
    const id = setTimeout(() => {
      // notify: false — a failed quote shows in the cart as "estimate", not as a toast per keystroke.
      api<Quote>("/pos/sales/quote", { method: "POST", body: quoteBody, notify: false })
        .then((r) => { if (seq === quoteSeq.current) { setQuote({ body: quoteBody, quote: r }); setQuoteFail(null); } })
        .catch((e) => {
          if (seq !== quoteSeq.current) return;
          const message = e instanceof ApiError && typeof e.detail === "string" ? e.detail : "no connection";
          setQuoteFail({ body: quoteBody, message });
        });
    }, 150);
    return () => clearTimeout(id);
  }, [quoteBody, quoteTry, cart.length]);

  const quoteState: QuoteState =
    cart.length === 0 ? { kind: "empty" }
      : quote?.body === quoteBody ? { kind: "ok", quote: quote.quote }
        : quoteFail?.body === quoteBody ? { kind: "failed", message: quoteFail.message }
          : { kind: "pending" };
  const fresh = quoteState.kind === "ok" ? quoteState.quote : null;
  const estimate = cart.length > 0 && !fresh;
  const subtotal = fresh?.subtotal_minor ?? localSubtotal;
  // What the customer pays: the server's total, rounded for cash.
  const total = fresh?.amount_due_minor ?? Math.max(0, localSubtotal - discountMinor);
  const paidMinor = Math.round(Number(paid || 0) * 100);

  const clearCart = useCallback(() => {
    setCustomer(null);
    if (inFlight.current) return; // the outcome of the charge decides the cart
    setCart([]);
    setChargeError(null);
    setUnconfirmed(false);
    setScanMsg(null);
    cartKey.current = newCartKey(); // a new cart is a new sale
    refocusAfterTap();
  }, [refocusAfterTap]);

  async function charge() {
    if (cart.length === 0 || inFlight.current) return;
    inFlight.current = true;
    setCharging(true);
    setChargeError(null);
    setUnconfirmed(false);
    try {
      const sale = await api<Sale>("/pos/sales", {
        method: "POST",
        notify: false, // the cart says exactly what happened (and whether it's safe to retry)
        body: JSON.stringify({
          client_uuid: cartKey.current, // reused if this attempt fails and is retried
          items: cart.map((l) => ({ product_id: l.product.id, qty: l.qty })),
          discount_minor: discountMinor,
          paid_minor: paidMinor, // 0 = exact amount tendered; the server prices the sale
          payment_method: method,
          contact_id: customer?.id ?? null,
        }),
      });
      inFlight.current = false;
      clearCart();
      setDiscount("0");
      setPaid("");
      setCartOpen(false);
      setReceipt(sale);
      setReceiptOpen(true);
      search(qRef.current); // stock just changed
      loadStatus(); // today's figures and the drawer expectation just changed
      void queryClient.invalidateQueries({ queryKey: qk.dashboard.all }); // so are the dashboard's
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) {
        setChargeError(e.message); // refused, so nothing was recorded: fix and retry
      } else {
        setUnconfirmed(true);
        setChargeError("The sale wasn't confirmed. Check the connection and press Charge again — it won't be charged twice.");
      }
    } finally {
      inFlight.current = false;
      setCharging(false);
    }
  }

  // Keyboard-first checkout, in the "pos" hotkey scope: on only while the till
  // is mounted. useHotkey reads the handlers through a ref, so they never go
  // stale and nothing is re-registered on each render (P15).
  useHotkeyScope("pos");
  useHotkey("F2", () => { setCartOpen(false); scanRef.current?.focus(); }, { scope: "pos" });
  useHotkey("F1", () => clearCart(), { scope: "pos" });
  useHotkey("F6", () => {
    if (isWide()) sidePaidRef.current?.focus();
    else { focusPaidOnOpen.current = true; setCartOpen(true); sheetPaidRef.current?.focus(); }
  }, { scope: "pos" });
  useHotkey("F7", () => void charge(), { scope: "pos" });

  // The sheet is a small-screen view; rotating a tablet to landscape (lg)
  // puts the cart back beside the products, so don't leave an overlay behind.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => { if (mq.matches) setCartOpen(false); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Closing an overlay hands focus to the scan field, not to the button that
  // opened it — a scanner's Enter on "View cart" or "Charge" would act on it.
  const backToScan = useCallback((e: Event) => { e.preventDefault(); focusScan(); }, [focusScan]);

  const panel = {
    cart, locked, charging, unconfirmed, chargeError, quote: quoteState, subtotal, total, estimate,
    discount, method, paid,
    onQty: setQty, onClear: clearCart, onDiscount: setDiscount, onMethod: setMethod, onPaid: setPaid,
    onRetryQuote: () => setQuoteTry((n) => n + 1), onCharge: () => void charge(),
  };
  const items = cart.reduce((n, l) => n + l.qty, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_clamp(300px,32%,420px)] lg:items-start">
      {/* Catalog. A container, so the tile columns follow its own width. */}
      <section aria-label={t("products")} className="@container min-w-0">
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
          ref={scanRef}
          autoFocus
          value={q}
          onChange={(e) => { setQ(e.target.value); setScanMsg(null); }}
          onKeyDown={onScanKey}
          aria-label="Scan barcode or search"
          aria-describedby={scanMsg ? "scan-msg" : undefined}
          placeholder={`Scan barcode or search ${t("products").toLowerCase()}…`}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
        />
        <p id="scan-msg" role="status" className={cx("min-h-5 py-1 text-sm", scanMsg ? "text-warning" : "")}>{scanMsg}</p>

        {categories.length > 1 && !q && (
          <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Category">
            <Chip active={category === ""} onClick={() => { setCategory(""); refocusAfterTap(); }}>All</Chip>
            {categories.map((c) => (
              <Chip key={c} active={category === c} onClick={() => { setCategory(c); refocusAfterTap(); }}>{c}</Chip>
            ))}
          </div>
        )}

        {catalogError && <div className="mb-3"><ErrorState message={catalogError} onRetry={() => search(q)} /></div>}
        {results === null && !catalogError ? (
          <LoadingRows rows={4} label={`Loading ${t("products").toLowerCase()}`} />
        ) : shown.length === 0 && !catalogError ? (
          <p className="py-8 text-center text-sm text-fg-subtle">
            {q ? `Nothing matches "${q}".` : <>No {t("products").toLowerCase()}. <Link href="/pos/products" className="text-brand hover:underline">Add some →</Link></>}
          </p>
        ) : (
          <ProductGrid products={shown} locked={locked} onAdd={onTile} />
        )}
      </section>

      {/* Cart beside the catalog from lg up, sized to the content column.
          Capped to the screen: a sticky panel taller than a 768px laptop
          would leave Charge unreachable once the catalog scrolls. */}
      <aside aria-label="Cart" className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:rounded-xl">
        <Card>
          <CustomerPicker value={customer} onChange={setCustomer} />
          <CartPanel {...panel} paidRef={sidePaidRef} />
        </Card>
      </aside>

      {/* Below lg: the cart would sit under the whole catalog, so a bar stays
          on screen with the total and Charge, and the full cart opens in a
          bottom sheet (P1). Safe-area padding keeps it off the iPhone home bar. */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-surface/95 px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur md:-mx-8 md:px-8 lg:hidden">
        {chargeError && (
          <p role="alert" className="mb-1 text-xs text-danger">
            {unconfirmed ? "Sale not confirmed — charge again (it won't be charged twice) or open the cart to clear it." : chargeError}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            aria-label={`View cart, ${cart.length} item${cart.length === 1 ? "" : "s"}`}
            className="flex min-h-12 min-w-0 flex-1 flex-col justify-center rounded-lg px-2 text-left hover:bg-elevated"
          >
            <span className="text-xs text-fg-muted">
              {items === 0 ? "Cart is empty" : `${items} item${items === 1 ? "" : "s"}`} · <span className="underline">View cart</span>
            </span>
            <span className="truncate font-semibold tabular-nums">
              {money(total)}{estimate && <span className="ml-1 text-xs font-normal text-fg-subtle">estimate</span>}
            </span>
          </button>
          <Button onClick={() => void charge()} disabled={cart.length === 0 || charging} className="min-h-12 shrink-0 text-base">
            {chargeLabel(charging, total, estimate)}
          </Button>
        </div>
      </div>

      <Sheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        side="bottom"
        title={`Cart (${cart.length})`}
        hideTitle
        onOpenAutoFocus={(e) => {
          // F6 opens the sheet straight into "Amount paid"; a tap doesn't
          // focus anything, so the phone keyboard stays down.
          e.preventDefault();
          if (focusPaidOnOpen.current) sheetPaidRef.current?.focus();
          focusPaidOnOpen.current = false;
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (!receiptOpen && finePointer()) focusScan();
        }}
        footer={
          <Button onClick={() => void charge()} disabled={cart.length === 0 || charging} className="min-h-12 w-full text-base">
            {chargeLabel(charging, total, estimate)}
          </Button>
        }
      >
        <CartPanel {...panel} paidRef={sheetPaidRef} showCharge={false} inSheet />
        <div className="px-5 pb-4"><CustomerPicker value={customer} onChange={setCustomer} /></div>
      </Sheet>

      <Receipt
        sale={receipt}
        open={receiptOpen}
        business={me?.tenant.name ?? ""}
        onClose={() => setReceiptOpen(false)}
        onCloseAutoFocus={backToScan}
      />
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={keepFocus}
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "min-h-8 rounded-full border px-3 text-xs font-medium capitalize transition-colors pointer-coarse:min-h-11 pointer-coarse:px-4 pointer-coarse:text-sm",
        active ? "border-brand bg-brand-subtle text-brand" : "border-line text-fg-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
