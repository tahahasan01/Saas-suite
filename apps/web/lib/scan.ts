/* Barcode scans (F19): what a scan is (parseScan), telling a scanner's burst
 * of keys from a person typing (BurstDetector), and who handles each kind
 * (registerScanHandler / dispatchScan). The till's scan field, its global
 * burst listener and the camera fallback all end in dispatchScan. */

export type ScanKind = "ean13" | "ean8" | "upca" | "receipt" | "code";
export interface Scan { kind: ScanKind; value: string; valid: boolean }

// Online receipts {REG}-{FY}-{N} (0078), offline <REG>-<DEV>-NNNNNN (3D).
const RECEIPT = /^[A-Z0-9]{1,6}-(\d{4}-\d{2}-\d{4,}|[A-Z0-9]{1,6}-\d{6})$/;
const GTIN: Record<number, ScanKind> = { 8: "ean8", 12: "upca", 13: "ean13" };

/** GS1 check digit: weights 3,1,3… from the digit next to the check. */
function checkDigitOk(digits: string): boolean {
  let sum = 0;
  for (let i = digits.length - 2, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += Number(digits[i]) * w;
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

export function parseScan(raw: string): Scan {
  const value = raw.trim();
  if (/^\d+$/.test(value) && GTIN[value.length]) {
    return { kind: GTIN[value.length], value, valid: checkDigitOk(value) };
  }
  if (RECEIPT.test(value)) return { kind: "receipt", value, valid: true };
  return { kind: "code", value, valid: true };
}

/** A wedge scanner types a whole code in a few milliseconds per key and ends
 *  with Enter; a person is far slower. feed() each key with its time; it
 *  returns the code when Enter closes a burst, else null. A burst is judged
 *  on its average pace (a busy page can stall one key), and any gap longer
 *  than maxGapMs starts it again. */
export class BurstDetector {
  private buf = "";
  private start = 0;
  private last = -Infinity;
  constructor(private avgGapMs = 35, private maxGapMs = 100, private minLength = 4) {}

  private quick(at: number): boolean {
    return this.buf.length > 0 && (at - this.start) / this.buf.length <= this.avgGapMs;
  }

  feed(key: string, at: number): string | null {
    if (key === "Shift") return null;     // a scanner presses it for each capital: not a break
    const gap = at - this.last;
    this.last = at;
    if (key === "Enter") {
      const code = gap <= this.maxGapMs && this.buf.length >= this.minLength && this.quick(at) ? this.buf : null;
      this.buf = "";
      return code;
    }
    if (key.length !== 1) { this.buf = ""; return null; }      // Shift, arrows…: not a scan
    if (gap > this.maxGapMs || !this.buf) { this.buf = key; this.start = at; }
    else this.buf += key;
    return null;
  }

  /** Whether keys are arriving as a burst right now. */
  inBurst(at: number): boolean {
    return this.buf.length > 1 && at - this.last <= this.maxGapMs && this.quick(at);
  }
}

type Handler = (scan: Scan) => void | Promise<void>;
const handlers: { kinds: ScanKind[]; fn: Handler }[] = [];

/** The handler for these kinds until the returned function is called; the
 *  most recently registered one wins (a dialog can take scans while open). */
export function registerScanHandler(kinds: ScanKind[], fn: Handler): () => void {
  const entry = { kinds, fn };
  handlers.push(entry);
  return () => {
    const i = handlers.indexOf(entry);
    if (i >= 0) handlers.splice(i, 1);
  };
}

/** Parses the text and hands it to its handler; false when nobody takes it. */
export async function dispatchScan(text: string): Promise<boolean> {
  const scan = parseScan(text);
  for (let i = handlers.length - 1; i >= 0; i--) {
    if (handlers[i].kinds.includes(scan.kind)) {
      await handlers[i].fn(scan);
      return true;
    }
  }
  return false;
}
