"use client";

import { keepFocus } from "@/components/pos/ProductGrid";
import { cx } from "@/components/ui";
import { type TileCategory, tileColor, tileStyle } from "@/lib/tiles";

/* Big coloured category tiles above the till's items (wave B, P42). A tap
 * shows that category; the pressed tile is marked, and tapping it again or
 * "All items" goes back. Names always show, so colour is never the only cue. */
export function CategoryTiles({ categories, value, onChange, showAll, big }: {
  categories: (TileCategory & { count: number })[];
  /** "" = home, "*" = all items, else a category id. */
  value: string;
  onChange: (next: string) => void;
  /** Offer "All items" (home shows favourites instead of everything). */
  showAll: boolean;
  big: boolean;
}) {
  const tile = cx("flex min-w-0 flex-col justify-between rounded-lg border border-line bg-surface text-start font-medium",
                  "transition-colors hover:border-brand/50 aria-pressed:ring-2 aria-pressed:ring-brand",
                  big ? "min-h-20 p-4 text-base" : "min-h-14 p-3 text-sm");
  return (
    <div role="group" aria-label="Categories"
         className="mb-3 grid grid-cols-2 gap-2 @sm:grid-cols-3 @2xl:grid-cols-4 @4xl:grid-cols-6">
      {showAll && (
        <button type="button" onMouseDown={keepFocus} aria-pressed={value === "*"} className={tile}
                onClick={() => onChange(value === "*" ? "" : "*")}>
          All items
        </button>
      )}
      {categories.map((c) => {
        const color = tileColor({ color: c.color, category_id: null }, new Map());
        return (
          <button key={c.id} type="button" onMouseDown={keepFocus} aria-pressed={value === c.id}
                  style={tileStyle(color)} className={cx(tile, color && "border-t-4")}
                  onClick={() => onChange(value === c.id ? "" : c.id)}>
            <span className="break-words leading-tight">{c.name}</span>
            <span className="text-xs font-normal text-fg-muted">{c.count} item{c.count === 1 ? "" : "s"}</span>
          </button>
        );
      })}
    </div>
  );
}
