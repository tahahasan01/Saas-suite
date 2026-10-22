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
