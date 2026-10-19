"use client";

import { useId } from "react";
import { Minus, Plus, X } from "lucide-react";
import { PAYMENT_METHODS, type Product } from "@business-os/types";
import { money } from "@/lib/format";
import { Button, cx, Input, Select } from "@/components/ui";
import { keepFocus } from "./ProductGrid";
import { blurOnWheel, METHOD_LABEL } from "./labels";

export interface Line {
  product: Product;
  qty: number;
}

/** The server's own pricing of the cart (POST /pos/sales/quote, D-21). */
export interface Quote {
  subtotal_minor: number;
  discount_minor: number;
  tax_minor: number;
  total_minor: number;
  rounding_minor: number;    // cash rounding (due - total)
  amount_due_minor: number;  // what the customer pays
}

/** Where the till's figures stand: the server's quote, still on its way, or
 *  failed (then the local sum is only an estimate and says so — P9). */
export type QuoteState =
  | { kind: "empty" }
  | { kind: "ok"; quote: Quote }
  | { kind: "pending" }
  | { kind: "failed"; message: string };

/** The amount a cash customer is likely to hand over: the next 500, 1000 and
 *  5000 note above the total. */
export function quickTenders(totalMinor: number): number[] {
  const rupees = totalMinor / 100;
  const out = new Set<number>();
  for (const note of [500, 1000, 5000]) {
    const v = Math.ceil(rupees / note) * note;
    if (v > rupees) out.add(v);
  }
  return [...out].sort((a, b) => a - b);
}

export function chargeLabel(charging: boolean, total: number, estimate: boolean) {
  if (charging) return "Recording sale…";
  return `Charge ${estimate ? "≈ " : ""}${money(total)}`;
}

type Props = {
  cart: Line[];
  locked: boolean;
  charging: boolean;
  unconfirmed: boolean;
  chargeError: string | null;
  quote: QuoteState;
  subtotal: number;
  total: number;
  estimate: boolean;
  discount: string;
  method: string;
  paid: string;
  paidRef?: React.Ref<HTMLInputElement>;
  onQty: (id: string, qty: number) => void;
  onClear: () => void;
  onDiscount: (v: string) => void;
  onMethod: (v: string) => void;
  onPaid: (v: string) => void;
  onRetryQuote: () => void;
  onCharge: () => void;
  /** In the bottom sheet the Charge button lives in the sheet's footer. */
  showCharge?: boolean;
  /** Room for the sheet's ✕ in the top-right corner. */
  inSheet?: boolean;
};

export function CartPanel(p: Props) {
  const id = useId();
  const { cart, locked, quote } = p;
  const paidMinor = Math.round(Number(p.paid || 0) * 100);
  const change = quote.kind === "ok" && paidMinor > 0 && paidMinor >= p.total ? paidMinor - p.total : null;

  return (
    // The heading's parent holds the whole cart (lines included): e2e helpers
    // and screen-reader heading navigation both rely on that.
    <div className={cx("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2", p.inSheet && "px-5 pt-4 pb-2")}>
      <h2 className={cx("text-sm font-semibold", p.inSheet && "py-2.5")}>Cart ({cart.length})</h2>
      {/* The deliberate way out, by touch too — including the "unconfirmed"
          lock, which a touch-only till could only escape by reloading (P4). */}
      <Button
        variant="ghost"
        size="sm"
        onMouseDown={keepFocus}
        onClick={p.onClear}
        disabled={cart.length === 0 || p.charging}
        className={cx("justify-self-end", p.inSheet && "mr-11")}
      >
        Clear cart
      </Button>

      <div className="col-span-2 mt-2 min-w-0">
        <ul className={cx("mb-3 divide-y divide-line/60", !p.inSheet && "max-h-[38dvh] overflow-y-auto pr-1")}>
          {cart.length === 0 && <li className="py-2 text-sm text-fg-subtle">Add items to start a bill.</li>}
          {cart.map((l) => (
            <li key={l.product.id} className="py-2 text-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1 break-words">{l.product.name}</p>
                {/* No fixed width: Rs 100,000.50 fits, and digits line up. */}
                <span className="shrink-0 text-right font-medium tabular-nums">{money(l.product.price_minor * l.qty)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs text-fg-subtle">{money(l.product.price_minor)} each</span>
                <div className="flex shrink-0 items-center gap-1">
                  <Step label={`Decrease ${l.product.name}`} disabled={locked} onClick={() => p.onQty(l.product.id, l.qty - 1)}>
                    <Minus size={16} aria-hidden />
                  </Step>
                  <span className="min-w-8 text-center tabular-nums" aria-label={`Quantity of ${l.product.name}`}>{l.qty}</span>
                  <Step label={`Increase ${l.product.name}`} disabled={locked} onClick={() => p.onQty(l.product.id, l.qty + 1)}>
                    <Plus size={16} aria-hidden />
                  </Step>
                  <Step label={`Remove ${l.product.name}`} disabled={locked} onClick={() => p.onQty(l.product.id, 0)} ghost>
                    <X size={16} aria-hidden />
                  </Step>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="space-y-1.5 border-t border-line pt-3 text-sm">
          <Row label="Subtotal" value={money(p.subtotal)} />
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={`${id}-discount`} className="text-fg-muted">Discount (PKR)</label>
            <Input
              id={`${id}-discount`} type="number" inputMode="decimal" min={0} step="0.01"
              value={p.discount} onChange={(e) => p.onDiscount(e.target.value)} onWheel={blurOnWheel}
              disabled={locked} className="w-28 py-1 text-right"
            />
          </div>
          {quote.kind === "ok" && quote.quote.tax_minor > 0 && <Row label="Sales tax" value={money(quote.quote.tax_minor)} />}
          {quote.kind === "ok" && quote.quote.rounding_minor !== 0 && (
            <>
              <Row label="Total" value={money(quote.quote.total_minor)} />
              <Row label="Cash rounding" value={money(quote.quote.rounding_minor)} />
            </>
          )}
          <Row
            label={quote.kind === "ok" && quote.quote.rounding_minor !== 0 ? "Amount due" : p.estimate ? "Total (estimate)" : "Total"}
            value={money(p.total)}
            bold
          />
          {quote.kind === "failed" && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs">
              <span>Couldn&apos;t get the price from the server ({quote.message}). The total above leaves out tax; the sale will be priced by the server.</span>
              <Button size="sm" variant="subtle" onMouseDown={keepFocus} onClick={p.onRetryQuote}>Retry</Button>
            </div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label htmlFor={`${id}-method`} className="text-xs font-medium text-fg-muted">Payment method</label>
            <Select id={`${id}-method`} value={p.method} onChange={(e) => p.onMethod(e.target.value)} disabled={locked}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
            </Select>
          </div>
          <div className="space-y-1">
            <label htmlFor={`${id}-paid`} className="text-xs font-medium text-fg-muted">Amount paid</label>
            <Input
              id={`${id}-paid`} ref={p.paidRef} type="number" inputMode="decimal" min={0} step="0.01"
              value={p.paid} onChange={(e) => p.onPaid(e.target.value)} onWheel={blurOnWheel}
              disabled={locked} placeholder="Exact"
            />
          </div>
        </div>

        {p.method === "cash" && cart.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Quick tender">
            <Tender active={p.paid === ""} disabled={locked} onClick={() => p.onPaid("")}>Exact</Tender>
            {quickTenders(p.total).map((v) => (
              <Tender key={v} active={p.paid === String(v)} disabled={locked} onClick={() => p.onPaid(String(v))}>
                {money(v * 100)}
              </Tender>
            ))}
          </div>
        )}

        {change !== null && <p className="mt-2 text-right text-sm text-success">Change: {money(change)}</p>}
        {p.chargeError && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {p.chargeError}
            {p.unconfirmed && <> The cart is locked until you charge it again or clear it.</>}
          </p>
        )}

        {p.showCharge !== false && (
          <Button onClick={p.onCharge} disabled={cart.length === 0 || p.charging} className="mt-3 min-h-12 w-full text-base">
            {chargeLabel(p.charging, p.total, p.estimate)}
          </Button>
        )}
        {/* Keyboard hints mean nothing on a touchscreen. */}
        {!p.inSheet && (
          <p className="mt-2 text-center text-[11px] text-fg-subtle pointer-coarse:hidden">
            <kbd>F2</kbd> search · <kbd>F6</kbd> pay · <kbd>F7</kbd> charge · <kbd>F1</kbd> clear
          </p>
        )}
      </div>
    </div>
  );
}

/** 44px by default (touch), 36px only with a mouse on a wide screen (P5). */
function Step({ label, onClick, disabled, ghost, children }: {
  label: string; onClick: () => void; disabled?: boolean; ghost?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={keepFocus}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "grid size-11 place-items-center rounded-lg transition-colors disabled:opacity-40 lg:pointer-fine:size-9",
        ghost ? "text-fg-subtle hover:bg-elevated hover:text-danger" : "bg-elevated hover:bg-line",
      )}
    >
      {children}
    </button>
  );
}

function Tender({ active, onClick, disabled, children }: {
  active: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cx(
        "min-h-9 rounded-lg border px-3 text-sm font-medium tabular-nums transition-colors disabled:opacity-40 pointer-coarse:min-h-11",
        active ? "border-brand bg-brand-subtle text-brand" : "border-line text-fg-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

export function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={cx("flex justify-between gap-3", bold ? "text-base font-semibold" : "text-fg-muted")}>
      <span>{label}</span>
      <span className={cx("shrink-0 tabular-nums", bold && "text-fg")}>{value}</span>
    </div>
  );
}
