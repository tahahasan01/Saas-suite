/* Draws a receipt on a canvas for raster printing (D-26): the browser shapes
 * Urdu and other scripts the printer's own fonts can't, and the result goes
 * out as GS v 0 (lib/escpos encodeReceiptRaster). Browser-only. */
import { monochrome, type Bitmap, type ReceiptDoc, type ReceiptRow } from "./escpos";

const RTL = /[\p{Script=Arabic}\p{Script=Hebrew}]/u;    // right-to-left scripts (Urdu is Arabic script)
const FONT = '"IBM Plex Sans", "Noto Naskh Arabic", "Noto Nastaliq Urdu", system-ui, sans-serif';

export function renderReceiptBitmap(doc: ReceiptDoc, width: number): Bitmap {
  const size = width >= 576 ? 24 : 20;
  const line = Math.round(size * 1.45);
  const pad = 4;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw the receipt");

  // Lay out first (wrapping needs the font's widths), then draw.
  type Op = { text: string; right?: string; align: "center" | "start"; bold?: boolean; rule?: boolean };
  const ops: Op[] = [];
  const font = (bold = false) => `${bold ? "700" : "400"} ${size}px ${FONT}`;
  const wrap = (text: string, max: number, bold = false): string[] => {
    ctx.font = font(bold);
    const out: string[] = [];
    let cur = "";
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(next).width <= max || !cur) cur = next;
      else { out.push(cur); cur = word; }
    }
    out.push(cur);
    return out;
  };
  const inner = width - pad * 2;
  const centered = (s: string, bold = false) => wrap(s, inner, bold).forEach((t) => ops.push({ text: t, align: "center", bold }));
  const row = (r: ReceiptRow) => {
    ctx.font = font(r.bold);
    const amount = ctx.measureText(r.right).width;
    wrap(r.left, inner - amount - size, r.bold).forEach((t, i) =>
      ops.push({ text: t, right: i === 0 ? r.right : undefined, align: "start", bold: r.bold }));
  };
  doc.header.forEach((h) => centered(h, true));
  if (doc.stamp) centered(`** ${doc.stamp} **`, true);
  doc.meta.forEach((m) => centered(m));
  ops.push({ text: "", align: "start", rule: true });
  doc.lines.forEach(row);
  ops.push({ text: "", align: "start", rule: true });
  doc.totals.forEach(row);
  if (doc.footer.length) {
    ops.push({ text: "", align: "start", rule: true });
    doc.footer.forEach((f) => centered(f));
  }

  canvas.width = width;
  canvas.height = pad * 2 + ops.length * line;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  ctx.textBaseline = "middle";
  ops.forEach((op, i) => {
    const y = pad + i * line + line / 2;
    if (op.rule) { ctx.fillRect(pad, Math.round(y), inner, 2); return; }
    ctx.font = font(op.bold);
    const rtl = RTL.test(op.text);
    ctx.direction = rtl ? "rtl" : "ltr";
    if (op.align === "center") { ctx.textAlign = "center"; ctx.fillText(op.text, width / 2, y); }
    else if (op.right !== undefined) {
      // The name on its reading side, the amount on the other.
      ctx.textAlign = rtl ? "right" : "left";
      ctx.fillText(op.text, rtl ? width - pad : pad, y);
      ctx.direction = "ltr";
      ctx.textAlign = rtl ? "left" : "right";
      ctx.fillText(op.right, rtl ? pad : width - pad, y);
    } else {
      ctx.textAlign = rtl ? "right" : "left";
      ctx.fillText(op.text, rtl ? width - pad : pad, y);
    }
  });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { px: monochrome(img.data, canvas.width, canvas.height), width: canvas.width, height: canvas.height };
}
