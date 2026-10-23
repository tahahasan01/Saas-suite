/* The touch tile screen (wave B, P42, 0090). Colours come from a fixed
 * palette; each maps to a tint and an edge colour defined for light and dark
 * in globals.css (--tile-<name>-bg / -edge), so names stay readable. */
import type { CSSProperties } from "react";

export const TILE_COLORS = ["red", "orange", "amber", "green", "teal", "blue", "indigo", "purple", "pink", "slate"] as const;
export type TileColor = (typeof TILE_COLORS)[number];

export const TILE_LABELS: Record<TileColor, string> = {
  red: "Red", orange: "Orange", amber: "Yellow", green: "Green", teal: "Teal", blue: "Blue",
  indigo: "Indigo", purple: "Purple", pink: "Pink", slate: "Grey",
};

export interface TileCategory { id: string; name: string; color: string | null; position?: number }

const isTile = (c: string | null | undefined): c is TileColor => !!c && (TILE_COLORS as readonly string[]).includes(c);

/** A product's own colour, else its category's; null for a plain tile. */
export function tileColor(p: { color?: string | null; category_id?: string | null },
                          categoryColors: Map<string, string | null>): TileColor | null {
  if (isTile(p.color)) return p.color;
  const c = p.category_id ? categoryColors.get(p.category_id) : null;
  return isTile(c) ? c : null;
}

export function tileStyle(color: TileColor | null): CSSProperties | undefined {
  return color ? { background: `var(--tile-${color}-bg)`, borderTopColor: `var(--tile-${color}-edge)` } : undefined;
}

/** What a tile says about stock. A product that doesn't track stock (a
 *  dish, a haircut, a delivery charge) is never "out of stock": its stock
 *  figure is just 0, and treating that as empty locked it on the till. */
export function stockState(p: { stock_qty: number; low_stock_at: number; unit: string; track_stock?: boolean }):
  { out: boolean; low: boolean; text: string } {
  if (p.track_stock === false) return { out: false, low: false, text: "" };
  if (p.stock_qty <= 0) return { out: true, low: false, text: "Out of stock" };
  if (p.low_stock_at > 0 && p.stock_qty <= p.low_stock_at) return { out: false, low: true, text: `Low stock · ${p.stock_qty} ${p.unit} left` };
  return { out: false, low: false, text: `${p.stock_qty} ${p.unit} in stock` };
}
