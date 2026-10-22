/* What the till does when the server can't be reached (3D): find products
 * in the cached catalogue, and record a sale in the outbox priced by
 * pos-core exactly as the server would price it (D-21). */
import type { Product, Sale } from "@business-os/types";
import { cashDue, priceSale } from "@business-os/pos-core";
import { api, NetworkError } from "@/lib/api";
import { buildIndex, searchIndex, type SearchIndex } from "./search";
import { cachedProducts, device, meta, queueSale, type Pricing } from "./store";
import { announce } from "./sync";

let local: { cursor: number; index: SearchIndex } | null = null;

/** The saved catalogue's index, rebuilt whenever a sync moved the cursor. */
async function localIndex(cursor: number): Promise<SearchIndex> {
  if (local?.cursor !== cursor) local = { cursor, index: buildIndex(await cachedProducts()) };
  return local.index;
}

/** A registered till searches its own saved catalogue (F21: no 200-product
 *  cap, the same answer online or off; stock is as of the last sync, which
 *  runs every minute and after each sale). Any other browser asks the API,
 *  falling back to the cache only when it can't be reached. */
export async function productsOrCached(text: string): Promise<Product[]> {
  const cursor = device() ? await meta<number>("cursor") : undefined;
  if (cursor !== undefined) return searchIndex(await localIndex(cursor), text);
  try {
    return await api<Product[]>(`/pos/products${text ? `?q=${encodeURIComponent(text)}` : ""}`, { notify: false });
  } catch (e) {
    if (!(e instanceof NetworkError) || !device()) throw e;
    const q = text.toLowerCase();
    return (await cachedProducts()).filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku?.toLowerCase() === q || p.barcode === text);
  }
}

/** A barcode's product: the API, else the cached catalogue. null = no such product. */
export async function lookupOrCached(barcode: string): Promise<Product | null> {
  try {
    return await api<Product>(`/pos/products/lookup?barcode=${encodeURIComponent(barcode)}`, { notify: false });
  } catch (e) {
    if (e instanceof NetworkError && device()) return (await cachedProducts()).find((p) => p.barcode === barcode) ?? null;
    if (e instanceof Error && "status" in e && (e as { status: number }).status === 404) return null;
    throw e;
  }
}

export interface OfflineCart {
  clientUuid: string;
  lines: { product: Product; qty: number }[];
  discountMinor: number;
  paidMinor: number;
  method: string;
  contactId: string | null;
  cashierToken: string | null;
}

/** Saves the sale in this till's outbox and returns the receipt to print.
 *  Throws if the till isn't set up for offline selling. */
export async function sellOffline(cart: OfflineCart): Promise<Sale> {
  const d = device();
  const pricing = await meta<Pricing>("pricing");
  if (!d || !pricing) throw new Error("This till isn't set up to sell offline. Register it on the Registers page while online.");
  const priced = priceSale(cart.lines.map((l) => ({ unit_price_minor: l.product.price_minor, qty: l.qty, tax_rate_pct: l.product.tax_rate ?? 0 })),
                           cart.discountMinor, { taxOn: pricing.tax_on, inclusive: pricing.inclusive });
  const [due, rounding] = cart.method === "cash" ? cashDue(priced.total_minor, pricing.cash_rounding_minor) : [priced.total_minor, 0];
  if (cart.paidMinor > 0 && cart.paidMinor < due) throw new Error(`Payment is short: Rs ${(due / 100).toFixed(2)} is due.`);
  const paid = cart.paidMinor || due;
  const createdAt = new Date().toISOString();
  const ref = await queueSale(d, {
    client_uuid: cart.clientUuid, created_at: createdAt,
    items: cart.lines.map((l) => ({ product_id: l.product.id, qty: l.qty })),
    discount_minor: cart.discountMinor, paid_minor: cart.paidMinor, payment_method: cart.method,
    contact_id: cart.contactId, client_total_minor: due, cashier_token: cart.cashierToken,
  });
  announce();
  return {
    id: cart.clientUuid, receipt_no: ref, created_at: createdAt, status: "completed",
    subtotal_minor: priced.subtotal_minor, discount_minor: priced.discount_minor, tax_minor: priced.tax_minor,
    total_minor: priced.total_minor, rounding_minor: rounding, amount_due_minor: due,
    paid_minor: paid, change_minor: paid - due, payment_method: cart.method, item_count: cart.lines.length,
    items: cart.lines.map((l, i) => ({ name: l.product.name, qty: l.qty, price_minor: l.product.price_minor,
                                      line_total_minor: priced.lines[i].gross_minor })),
    // FBR is sent when the sale syncs; the receipt says so meanwhile (D-25).
    fbr_invoice_number: null, fbr_status: pricing.tax_on ? "pending" : null,
    contact_id: cart.contactId, offline: true,
  } as Sale;
}
