/* ESC/POS for 58mm and 80mm roll printers (3C). Text mode for Latin
 * receipts; `raster` turns a 1-bit bitmap into GS v 0 for what the printer's
 * code page can't show (Urdu, logos). Pure functions: the bytes go out
 * through lib/printer.ts. */

export type Paper = 58 | 80;

/** Characters per line in the printer's standard font (Font A, 12x24). */
export const COLUMNS: Record<Paper, number> = { 58: 32, 80: 48 };

export const DRAWER_KICK = [0x1b, 0x70, 0x00, 0x19, 0xfa]; // pulse pin 2: 50ms on, 500ms off

const INIT = [0x1b, 0x40];
const CENTER = [0x1b, 0x61, 0x01];
const LEFT = [0x1b, 0x61, 0x00];
const BOLD_ON = [0x1b, 0x45, 0x01];
const BOLD_OFF = [0x1b, 0x45, 0x00];
const FEED_CUT = [0x1d, 0x56, 0x42, 0x03]; // feed 3 lines, then a partial cut

export interface ReceiptRow { left: string; right: string; bold?: boolean }

export interface ReceiptDoc {
  header: string[];
  stamp?: string;          // DUPLICATE or VOID, boxed under the header
  meta: string[];          // receipt number, date
  lines: ReceiptRow[];
  totals: ReceiptRow[];
  footer: string[];
}

/** The printer's default code page is ASCII-safe only; anything else prints
 *  as "?" rather than as garbage from the wrong code page. */
function ascii(s: string): string {
  return s.normalize("NFC").replace(/[^\x20-\x7e]/g, "?");
}

function wrap(s: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of s.split(/\s+/).filter(Boolean)) {
    for (let w = word; w.length > 0; w = w.slice(width)) {
      const piece = w.slice(0, width);
      if (!line) line = piece;
      else if (line.length + 1 + piece.length <= width) line += " " + piece;
      else { out.push(line); line = piece; }
      if (w.length <= width) break;
    }
  }
  if (line || out.length === 0) out.push(line);
  return out;
}

/** An item name on the left (wrapped, never cut) and its amount on the
 *  right of the first row. */
export function twoColumns(left: string, right: string, width: number): string[] {
  const r = ascii(right);
  const rows = wrap(ascii(left), Math.max(8, width - r.length - 1));
  rows[0] = rows[0].padEnd(width - r.length) + r;
  return rows;
}

const center = (s: string, width: number) => wrap(ascii(s), width);

export function encodeReceipt(doc: ReceiptDoc, paper: Paper, opts: { kick?: boolean } = {}): Uint8Array {
  const width = COLUMNS[paper];
  const out: number[] = [...INIT];
  const text = (s: string) => { for (const ch of s) out.push(ch.charCodeAt(0)); out.push(0x0a); };
  const rule = () => text("-".repeat(width));

  out.push(...CENTER, ...BOLD_ON);
  doc.header.forEach((h) => center(h, width).forEach(text));
  out.push(...BOLD_OFF);
  if (doc.stamp) {
    text("*".repeat(Math.min(width, doc.stamp.length + 4)));
    out.push(...BOLD_ON); text(ascii(doc.stamp)); out.push(...BOLD_OFF);
    text("*".repeat(Math.min(width, doc.stamp.length + 4)));
  }
  doc.meta.forEach((m) => center(m, width).forEach(text));
  out.push(...LEFT);
  rule();
  doc.lines.forEach((l) => twoColumns(l.left, l.right, width).forEach(text));
  rule();
  doc.totals.forEach((t) => {
    if (t.bold) out.push(...BOLD_ON);
    twoColumns(t.left, t.right, width).forEach(text);
    if (t.bold) out.push(...BOLD_OFF);
  });
  if (doc.footer.length) {
    rule();
    out.push(...CENTER);
    doc.footer.forEach((f) => center(f, width).forEach(text));
    out.push(...LEFT);
  }
  out.push(...FEED_CUT);
  if (opts.kick) out.push(...DRAWER_KICK);
  return Uint8Array.from(out);
}

/** A 1-bit bitmap (1 = black, row-major) as GS v 0, most significant bit
 *  leftmost. 576 dots wide fits 80mm, 384 fits 58mm. */
export function raster(px: Uint8Array, width: number, height: number): Uint8Array {
  const bytesPerRow = Math.ceil(width / 8);
  const out = new Uint8Array(8 + bytesPerRow * height);
  out.set([0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, bytesPerRow >> 8, height & 0xff, height >> 8]);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (px[y * width + x]) out[8 + y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return out;
}

/** Whether any text would print as "?" in text mode (Urdu, ₨…): such a
 *  receipt goes out as an image instead (D-26). */
export function needsRaster(doc: ReceiptDoc): boolean {
  const all = [...doc.header, doc.stamp ?? "", ...doc.meta, ...doc.footer,
               ...[...doc.lines, ...doc.totals].flatMap((r) => [r.left, r.right])];
  return all.some((s) => /[^\x20-\x7e]/.test(s.normalize("NFC")));
}

/** Canvas pixels (RGBA) to 1-bit dots: dark enough is ink; transparent is paper. */
export function monochrome(rgba: Uint8ClampedArray, width: number, height: number, threshold = 160): Uint8Array {
  const px = new Uint8Array(width * height);
  for (let i = 0; i < px.length; i++) {
    const [r, g, b, a] = [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2], rgba[i * 4 + 3]];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    px[i] = a > 127 && lum < threshold ? 1 : 0;
  }
  return px;
}

export type Bitmap = { px: Uint8Array; width: number; height: number };
/** 384 dots across a 58mm roll, 576 across 80mm (203 dpi heads). */
export const DOTS: Record<Paper, number> = { 58: 384, 80: 576 };
const BAND = 256;

/** The receipt as one image (lib/receipt-bitmap draws it in the browser). */
export function encodeReceiptRaster(doc: ReceiptDoc, paper: Paper, render: (doc: ReceiptDoc, width: number) => Bitmap,
                                    opts: { kick?: boolean } = {}): Uint8Array {
  const img = render(doc, DOTS[paper]);
  const out: number[] = [...INIT];
  // Bands of 256 rows: many printers cap one GS v 0 block's height.
  for (let y = 0; y < img.height; y += BAND) {
    const h = Math.min(BAND, img.height - y);
    out.push(...raster(img.px.subarray(y * img.width, (y + h) * img.width), img.width, h));
  }
  out.push(...FEED_CUT, ...(opts.kick ? DRAWER_KICK : []));
  return Uint8Array.from(out);
}
