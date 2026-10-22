/* Keyboard movement shared by Tabs, DropdownMenu and Combobox (WAI-ARIA
 * APG): arrows along the axis, Home/End, wrapping, disabled items skipped,
 * and left/right swapped when the page reads right to left (Urdu, D-53). */

export type Orientation = "horizontal" | "vertical";

export function nextIndex(
  current: number, key: string, count: number, orientation: Orientation = "horizontal",
  dir: "ltr" | "rtl" = "ltr", disabled: (i: number) => boolean = () => false,
): number | null {
  if (count === 0) return null;
  const fwd = orientation === "vertical" ? "ArrowDown" : dir === "rtl" ? "ArrowLeft" : "ArrowRight";
  const back = orientation === "vertical" ? "ArrowUp" : dir === "rtl" ? "ArrowRight" : "ArrowLeft";
  let start: number;
  let step: number;
  if (key === fwd) { start = current + 1; step = 1; }
  else if (key === back) { start = current - 1; step = -1; }
  else if (key === "Home") { start = 0; step = 1; }
  else if (key === "End") { start = count - 1; step = -1; }
  else return null;
  for (let n = 0, i = start; n < count; n++, i += step) {
    const at = ((i % count) + count) % count;
    if (!disabled(at)) return at;
  }
  return null;
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Options containing the query, those where a word starts with it first. */
export function filterOptions<T extends { label: string }>(options: T[], query: string): T[] {
  const q = fold(query.trim());
  if (!q) return options;
  const hits = options.filter((o) => fold(o.label).includes(q));
  const wordStart = (o: T) => fold(o.label).split(/\s+/).some((w) => w.startsWith(q));
  return [...hits.filter(wordStart), ...hits.filter((o) => !wordStart(o))];
}
