"use client";

import { useEffect, useRef, useState } from "react";
import type { Sale } from "@business-os/types";
import { api } from "@/lib/api";
import { formatDateTime, money } from "@/lib/format";
import { BUSINESS_TZ } from "@/lib/dates";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/ui";
import { FbrStamp } from "./FbrStamp";
import { Row } from "./CartPanel";
import { methodLabel } from "./labels";
import { encodeReceipt, type ReceiptDoc } from "@/lib/escpos";
import { printerSettings, sendToPrinter } from "@/lib/printer";

const when = (iso: string) => formatDateTime(iso, BUSINESS_TZ);

/* The receipt is a real dialog (P11): Escape and ✕ close it, it scrolls inside
 * itself on a landscape phone, and Print / New sale sit in the footer so they
 * are always on screen. Only `.receipt-print` reaches paper (globals.css). */
export function Receipt({ sale, open, business, onClose, onCloseAutoFocus, title = "Sale complete", closeLabel = "New sale" }: {
  /** Kept after closing, so the dialog doesn't empty out while it animates away. */
  sale: Sale | null;
  open: boolean;
  business: string;
  onClose: () => void;
  onCloseAutoFocus?: (e: Event) => void;
  title?: string;
  closeLabel?: string;
}) {
  // Every print is counted by the server: the first is the original, later
  // ones print a DUPLICATE stamp (0078).
  const [duplicate, setDuplicate] = useState(false);
  // The roll printer didn't answer: offer a retry or the browser's print.
  const [printFailed, setPrintFailed] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  useEffect(() => { setDuplicate(false); setPrintFailed(null); }, [sale?.id]);

  async function toPrinter(dup: boolean) {
    if (!sale) return;
    const { paper } = printerSettings();
    setPrinting(true);
    setPrintFailed(null);
    try {
      // The drawer opens with the original cash receipt, never a reprint.
      await sendToPrinter(encodeReceipt(receiptDoc(sale, business, dup), paper,
                                        { kick: !dup && sale.payment_method === "cash" }));
    } catch (e) {
      setPrintFailed(e instanceof Error ? e.message : "The printer didn't answer");
    } finally {
      setPrinting(false);
    }
  }

  async function print() {
    let dup = duplicate;
    if (sale) {
      try {
        const r = await api<{ duplicate: boolean }>(`/pos/sales/${sale.id}/print`, { method: "POST", notify: false });
        dup = r.duplicate;
        setDuplicate(dup);
        await new Promise((ok) => setTimeout(ok, 0));   // let the stamp render before the print dialog
      } catch { /* printing still works offline; the count catches up later */ }
    }
    if (printerSettings().kind === "browser") window.print();
    else await toPrinter(dup);
  }
  return (
    <Dialog
      open={open && sale !== null}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={title}
      size="sm"
      onCloseAutoFocus={onCloseAutoFocus}
      footer={
        <>
          <Button variant="subtle" onClick={() => void print()} disabled={printing} className="flex-1">
            {printing ? "Printing…" : "Print"}
          </Button>
          <Button onClick={onClose} className="flex-1">{closeLabel}</Button>
        </>
      }
    >
      {printFailed && (
        <div role="alert" className="mb-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <p className="font-medium">{printFailed}.</p>
          <p className="mt-0.5 text-xs text-fg-muted">Check it&apos;s on, has paper and is plugged in.</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => void toPrinter(duplicate)} disabled={printing}>Try again</Button>
            <Button size="sm" variant="subtle" onClick={() => { setPrintFailed(null); window.print(); }}>
              Print with browser
            </Button>
          </div>
        </div>
      )}
      {sale && <ReceiptBody sale={sale} business={business} duplicate={duplicate} />}
    </Dialog>
  );
}

/** The same receipt as ESC/POS text, for a roll printer (lib/escpos.ts). */
export function receiptDoc(sale: Sale, business: string, duplicate: boolean): ReceiptDoc {
  const due = sale.amount_due_minor || sale.total_minor;
  const totals = [
    ...(sale.discount_minor > 0 ? [{ left: "Subtotal", right: money(sale.subtotal_minor) },
                                   { left: "Discount", right: `-${money(sale.discount_minor)}` }] : []),
    ...(sale.rounding_minor !== 0 ? [{ left: "Total", right: money(sale.total_minor) },
                                     { left: "Cash rounding", right: money(sale.rounding_minor) }] : []),
    { left: sale.rounding_minor !== 0 ? "Amount due" : "Total", right: money(due), bold: true },
    ...(sale.tax_minor > 0 ? [{ left: "incl. sales tax", right: money(sale.tax_minor) }] : []),
    { left: `Paid (${methodLabel(sale.payment_method)})`, right: money(sale.paid_minor) },
    { left: "Change", right: money(sale.change_minor) },
  ];
  return {
    header: business ? [business] : [],
    stamp: sale.status === "void" ? "VOID" : duplicate ? "DUPLICATE" : undefined,
    meta: [sale.receipt_no ?? "", when(sale.created_at), sale.id].filter(Boolean),
    lines: sale.items.map((it) => ({ left: `${it.qty} x ${it.name}`, right: money(it.line_total_minor) })),
    totals,
    footer: sale.fbr_invoice_number ? [`FBR invoice ${sale.fbr_invoice_number}`] : [],
  };
}

/** While the receipt prints, the page is exactly the roll's width by its own
 *  height, so a roll printer feeds no blank paper after it. CSS can't say
 *  "80mm by whatever fits" (`size: 80mm auto` is invalid and dropped), so the
 *  height is measured at the print width just before printing — Ctrl+P too. */
function usePrintPageSize(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    let style: HTMLStyleElement | null = null;
    const after = () => { style?.remove(); style = null; };
    const before = () => {
      const el = ref.current;
      if (!el) return;
      after();
      const width = el.style.width;
      const paper = printerSettings().paper;
      el.dataset.paper = String(paper);
      el.style.width = paper === 58 ? "48mm" : "72mm"; // .receipt-print's print width (globals.css)
      const mm = Math.ceil((el.scrollHeight * 25.4) / 96) + 12; // + its 3mm top/bottom padding, + slack
      el.style.width = width;
      style = document.createElement("style");
      style.textContent = `@page { size: ${paper}mm ${mm}mm; margin: 0; }`;
      document.head.appendChild(style);
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
      after();
    };
  }, [ref]);
}

function ReceiptBody({ sale, business, duplicate }: { sale: Sale; business: string; duplicate: boolean }) {
  const due = sale.amount_due_minor || sale.total_minor;
  const ref = useRef<HTMLDivElement>(null);
  usePrintPageSize(ref);
  return (
    <div ref={ref} className="receipt-print space-y-2 text-sm">
      <div className="text-center">
        {business && <p className="text-base font-semibold break-words">{business}</p>}
        {duplicate && <p className="my-1 border-y border-dashed border-fg py-0.5 text-sm font-bold tracking-widest">DUPLICATE</p>}
        {sale.status === "void" && <p className="my-1 text-sm font-bold tracking-widest text-danger">VOID</p>}
        {sale.receipt_no && <p className="font-mono text-sm font-semibold">{sale.receipt_no}</p>}
        <p className="text-xs text-fg-muted">{when(sale.created_at)}</p>
        {/* Full id, not a slice: this is what Returns looks the sale up by. */}
        <p className="font-mono text-[10px] break-all text-fg-subtle">{sale.id}</p>
      </div>
      <div className="space-y-1 border-t border-line pt-2">
        {sale.items.map((it, i) => (
          <div key={i} className="flex justify-between gap-3">
            {/* Wraps, never truncates: a long name on paper must stay legible. */}
            <span className="min-w-0 break-words">
              {it.qty} × {it.name}
              {it.qty !== 1 && <span className="block text-xs text-fg-subtle">{money(it.price_minor)} each</span>}
            </span>
            <span className="shrink-0 tabular-nums">{money(it.line_total_minor)}</span>
          </div>
        ))}
      </div>
      <div className="space-y-0.5 border-t border-line pt-2">
        {sale.discount_minor > 0 && (
          <>
            <Row label="Subtotal" value={money(sale.subtotal_minor)} />
            <Row label="Discount" value={`−${money(sale.discount_minor)}`} />
          </>
        )}
        {sale.rounding_minor !== 0 && <Row label="Total" value={money(sale.total_minor)} />}
        {sale.rounding_minor !== 0 && <Row label="Cash rounding" value={money(sale.rounding_minor)} />}
        <Row label={sale.rounding_minor !== 0 ? "Amount due" : "Total"} value={money(due)} bold />
        {sale.tax_minor > 0 && <Row label="incl. sales tax" value={money(sale.tax_minor)} />}
        <Row label={`Paid (${methodLabel(sale.payment_method)})`} value={money(sale.paid_minor)} />
        <Row label="Change" value={money(sale.change_minor)} />
      </div>

      <FbrStamp invoiceNumber={sale.fbr_invoice_number} status={sale.fbr_status} />
    </div>
  );
}
