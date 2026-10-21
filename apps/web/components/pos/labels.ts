import { PAYMENT_METHODS } from "@business-os/types";

/** What a cashier and a customer call each method — the select showed the raw
 *  keys ("jazzcash", "bank") before. */
export const METHOD_LABEL: Record<(typeof PAYMENT_METHODS)[number], string> = {
  cash: "Cash",
  card: "Card",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  raast: "Raast",
  bank: "Bank transfer",
  khata: "Khata (on credit)",
};

export function methodLabel(m: string): string {
  return METHOD_LABEL[m as keyof typeof METHOD_LABEL] ?? m;
}

/** Number fields: a mouse wheel over a focused field silently changed the
 *  amount (Rs 500 paid became Rs 497). Blur instead, so the page scrolls. */
export function blurOnWheel(e: React.WheelEvent<HTMLInputElement>) {
  e.currentTarget.blur();
}
