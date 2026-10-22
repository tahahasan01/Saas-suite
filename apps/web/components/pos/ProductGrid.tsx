"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { Product } from "@business-os/types";
import { money } from "@/lib/format";
import { cx } from "@/components/ui";

/** Keeps the scan field focused: a tapped tile that took focus was "clicked"
 *  again by the scanner's Enter, re-adding it instead of the scanned item (P3). */
export const keepFocus = (e: React.MouseEvent) => e.preventDefault();

/* Memoised: typing an amount paid or a discount re-rendered up to 200 tiles on
 * every keystroke, which a low-end Android till feels (P16). It only redraws
 * when the products, the lock or the handler change. Columns follow the
 * catalog's own width (container queries), so a 2560 screen gets 6 columns of
 * sensible tiles instead of 3 tiles 600px wide. */
// Tiles drawn per step. A registered till has its whole catalogue (no cap,
// F21), so the grid draws a page and the next one as you scroll near the end:
// a 5,000-item shop never puts 5,000 buttons on a low-end Android at once.
export const GRID_PAGE = 120;

export const ProductGrid = memo(function ProductGrid({ products, locked, onAdd }: {
  products: Product[];
  locked: boolean;
  onAdd: (p: Product) => void;
}) {
  const [count, setCount] = useState(GRID_PAGE);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => setCount(GRID_PAGE), [products]);      // a new search starts at the top
  useEffect(() => {
    const el = sentinel.current;
    if (!el || count >= products.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((seen) => {
      if (seen.some((e) => e.isIntersecting)) setCount((c) => c + GRID_PAGE);
    }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [count, products.length]);
  return (
    <>
      <div className="grid grid-cols-2 gap-2 @sm:grid-cols-3 @2xl:grid-cols-4 @4xl:grid-cols-5 @6xl:grid-cols-6">
        {products.slice(0, count).map((p) => <Tile key={p.id} p={p} locked={locked} onAdd={onAdd} />)}
      </div>
      {count < products.length && (
        <div ref={sentinel} className="py-3 text-center text-xs text-fg-subtle" data-testid="grid-more">
          Showing {count} of {products.length}. Scroll for more, or search.
        </div>
      )}
    </>
  );
});

function Tile({ p, locked, onAdd }: { p: Product; locked: boolean; onAdd: (p: Product) => void }) {
  const out = p.stock_qty <= 0;
  const low = !out && p.low_stock_at > 0 && p.stock_qty <= p.low_stock_at;
  return (
    <button
      type="button"
      onMouseDown={keepFocus}
      onClick={() => onAdd(p)}
      // Out of stock says so in words, not only in colour.
      disabled={locked || out}
      className={cx(
        "flex min-h-24 min-w-0 flex-col rounded-lg border border-line bg-surface p-3 text-start transition-colors",
        "hover:border-brand/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line",
      )}
    >
      <span className="text-sm font-medium leading-tight break-words">{p.name}</span>
      <span className="mt-1 text-sm tabular-nums text-brand">{money(p.price_minor)}</span>
      <span className={cx("mt-auto pt-1 text-[11px]", out ? "font-medium text-danger" : low ? "font-medium text-warning" : "text-fg-subtle")}>
        {out ? "Out of stock" : low ? `Low stock · ${p.stock_qty} ${p.unit} left` : `${p.stock_qty} ${p.unit} in stock`}
      </span>
    </button>
  );
}
