/* The till's local search index (3D, F21): the whole saved catalogue,
 * searched in memory, so a registered till has no 200-product cap and
 * answers the same online or off. Ranking: an exact barcode or SKU, then a
 * name that starts with the text, a word that does, anywhere in the name. */
import type { Product } from "@business-os/types";

interface Entry { product: Product; name: string; words: string[]; codes: string[] }
export interface SearchIndex { entries: Entry[] }

export function buildIndex(products: Product[]): SearchIndex {
  const entries = products
    .filter((p) => p.active)
    .map((p) => {
      const name = p.name.toLowerCase();
      return { product: p, name, words: name.split(/\s+/).filter(Boolean),
               codes: [p.barcode, p.sku].filter((c): c is string => Boolean(c)).map((c) => c.toLowerCase()) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { entries };
}

/** Best match first; every word of the text must match (any order). */
export function searchIndex(index: SearchIndex, text: string): Product[] {
  const q = text.trim().toLowerCase();
  if (!q) return index.entries.map((e) => e.product);
  const terms = q.split(/\s+/);
  const ranked: { rank: number; e: Entry }[] = [];
  for (const e of index.entries) {
    if (e.codes.includes(q)) { ranked.push({ rank: 0, e }); continue; }
    if (!terms.every((t) => e.name.includes(t))) continue;
    const rank = e.name.startsWith(q) ? 1 : e.words.some((w) => w.startsWith(terms[0])) ? 2 : 3;
    ranked.push({ rank, e });
  }
  // Stable sort: equal ranks keep the index's name order.
  return ranked.sort((a, b) => a.rank - b.rank).map((r) => r.e.product);
}
