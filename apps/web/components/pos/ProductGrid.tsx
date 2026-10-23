"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { Product } from "@business-os/types";
import { money } from "@/lib/format";
import { stockState, tileColor, tileStyle } from "@/lib/tiles";
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

const NO_COLORS = new Map<string, string | null>();

export const ProductGrid = memo(function ProductGrid({ products, locked, onAdd, categoryColors = NO_COLORS, big = false, label }: {
  products: Product[];
  locked: boolean;
  onAdd: (p: Product) => void;
  /** Category id → tile colour (P42); a product's own colour wins. */
  categoryColors?: Map<string, string | null>;
  /** Touch mode: bigger tiles, fewer per row. */
  big?: boolean;
  label?: string;
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
      <div aria-label={label} role={label ? "group" : undefined}
           className={big ? "grid grid-cols-2 gap-3 @2xl:grid-cols-3 @4xl:grid-cols-4"
                          : "grid grid-cols-2 gap-2 @sm:grid-cols-3 @2xl:grid-cols-4 @4xl:grid-cols-5 @6xl:grid-cols-6"}>
        {products.slice(0, count).map((p) => (
          <Tile key={p.id} p={p} locked={locked} onAdd={onAdd} big={big} color={tileColor(p, categoryColors)} />
        ))}
      </div>
      {count < products.length && (
        <div ref={sentinel} className="py-3 text-center text-xs text-fg-subtle" data-testid="grid-more">
          Showing {count} of {products.length}. Scroll for more, or search.
        </div>
      )}
    </>
  );
});

function Tile({ p, locked, onAdd, big, color }: {
  p: Product; locked: boolean; onAdd: (p: Product) => void; big: boolean; color: ReturnType<typeof tileColor>;
}) {
  const { out, low, text } = stockState(p);
  return (
    <button
      type="button"
      onMouseDown={keepFocus}
      onClick={() => onAdd(p)}
      // Out of stock says so in words, not only in colour.
      disabled={locked || out}
      // The colour is a tint plus a top edge; the name and price keep the
      // normal text colour, so a coloured tile reads as well as a plain one.
      style={tileStyle(color)}
      className={cx(
        "flex min-w-0 flex-col rounded-lg border border-line bg-surface text-start transition-colors",
        big ? "min-h-32 p-4" : "min-h-24 p-3",
        color && "border-t-4",
        "hover:border-brand/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line",
      )}
    >
      <span className={cx("font-medium leading-tight break-words", big ? "text-base" : "text-sm")}>{p.name}</span>
      <span className={cx("mt-1 tabular-nums text-brand", big ? "text-base font-semibold" : "text-sm")}>{money(p.price_minor)}</span>
      <span className={cx("mt-auto pt-1 text-[11px]", out ? "font-medium text-danger" : low ? "font-medium text-warning" : "text-fg-subtle")}>
        {text}
      </span>
    </button>
  );
}
