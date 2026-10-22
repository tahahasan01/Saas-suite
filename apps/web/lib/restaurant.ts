/* Table service helpers (wave B, study 11). */

const MAX_TABLES = 100;   // the API's limit per request

/** "1-12, Family 1" → ["1", …, "12", "Family 1"]: ranges expand, repeats and blanks drop. */
export function tableLabels(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(",")) {
    const part = raw.trim();
    if (!part) continue;
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])];
      if (to < from) throw new Error(`${part}: the range runs backwards`);
      if (to - from + 1 > MAX_TABLES) throw new Error(`Add at most ${MAX_TABLES} tables at a time`);
      for (let n = from; n <= to; n++) out.push(String(n));
    } else {
      out.push(part);
    }
  }
  const unique = [...new Set(out)];
  if (unique.length > MAX_TABLES) throw new Error(`Add at most ${MAX_TABLES} tables at a time`);
  return unique;
}
