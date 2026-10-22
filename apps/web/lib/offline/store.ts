/* The offline till's storage (3D, F17): IndexedDB for the catalogue, the
 * pricing settings and the outbox; localStorage for this till's device
 * identity. Raw IndexedDB behind a few promises (no new dependency). */
import type { Product } from "@business-os/types";
import { offlineRef } from "./plan";

const DB = "bos-pos";
const VERSION = 1;

export interface Device { device_id: string; token: string; device_code: string; register_id: string; register_code: string }
export interface Pricing { tax_on: boolean; inclusive: boolean; cash_rounding_minor: number }
export interface OutboxOrder {
  client_uuid: string;
  offline_ref: string;
  created_at: string;
  items: { product_id: string; qty: number }[];
  discount_minor: number;
  paid_minor: number;
  payment_method: string;
  contact_id: string | null;
  client_total_minor: number;
  cashier_token: string | null;
  status: "pending" | "conflict";
  error?: string;
  attempts: number;
}

const DEVICE_KEY = "bos.device";

export function device(): Device | null {
  try { return JSON.parse(localStorage.getItem(DEVICE_KEY) ?? "null"); } catch { return null; }
}
export function saveDevice(d: Device) {
  try { localStorage.setItem(DEVICE_KEY, JSON.stringify(d)); } catch { /* private window: not kept */ }
}
export function forgetDevice() {
  try { localStorage.removeItem(DEVICE_KEY); } catch { /* nothing kept */ }
}

let opening: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise((ok, no) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("products", { keyPath: "id" });
      db.createObjectStore("meta");
      db.createObjectStore("outbox", { keyPath: "client_uuid" });
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => { opening = null; no(req.error); };
  });
  return opening;
}

const done = (tx: IDBTransaction) => new Promise<void>((ok, no) => {
  tx.oncomplete = () => ok();
  tx.onerror = () => no(tx.error);
  tx.onabort = () => no(tx.error ?? new Error("The till's storage refused the write"));
});
const got = <T>(req: IDBRequest<T>) => new Promise<T>((ok, no) => { req.onsuccess = () => ok(req.result); req.onerror = () => no(req.error); });

export async function meta<T>(key: string): Promise<T | undefined> {
  const db = await open();
  return got(db.transaction("meta").objectStore("meta").get(key)) as Promise<T | undefined>;
}

export interface CatalogFeed { products: (Product & { row_version: number })[]; next: number; more: boolean; pricing: Pricing;
                               register: { id: string; code: string; payment_methods: string[] } }

export async function saveFeed(feed: CatalogFeed): Promise<void> {
  const db = await open();
  const tx = db.transaction(["products", "meta"], "readwrite");
  for (const p of feed.products) tx.objectStore("products").put(p);
  tx.objectStore("meta").put(feed.next, "cursor");
  tx.objectStore("meta").put(feed.pricing, "pricing");
  tx.objectStore("meta").put(feed.register, "register");
  await done(tx);
}

export async function cachedProducts(): Promise<Product[]> {
  const db = await open();
  const all = (await got(db.transaction("products").objectStore("products").getAll())) as Product[];
  return all.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name));
}

/** Writes the sale to the outbox and takes its receipt number in ONE
 *  transaction (St01 §6.5): awaited before the receipt prints or the cart
 *  clears, so a crash can't print a number that isn't saved. */
export async function queueSale(d: Device, order: Omit<OutboxOrder, "offline_ref" | "status" | "attempts">): Promise<string> {
  const db = await open();
  const tx = db.transaction(["meta", "outbox"], "readwrite");
  const metaStore = tx.objectStore("meta");
  const n = ((await got(metaStore.get("receipt_counter"))) as number | undefined ?? 0) + 1;
  const ref = offlineRef(d.register_code, d.device_code, n);
  metaStore.put(n, "receipt_counter");
  tx.objectStore("outbox").put({ ...order, offline_ref: ref, status: "pending", attempts: 0 } satisfies OutboxOrder);
  await done(tx);
  return ref;
}

export async function outbox(): Promise<OutboxOrder[]> {
  const db = await open();
  const all = (await got(db.transaction("outbox").objectStore("outbox").getAll())) as OutboxOrder[];
  return all.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function settleOutbox(doneIds: string[], conflicts: { id: string; error: string }[], retry: string[]): Promise<void> {
  const db = await open();
  const tx = db.transaction("outbox", "readwrite");
  const store = tx.objectStore("outbox");
  for (const id of doneIds) store.delete(id);
  for (const c of conflicts) {
    const o = (await got(store.get(c.id))) as OutboxOrder | undefined;
    if (o) store.put({ ...o, status: "conflict", error: c.error });
  }
  for (const id of retry) {
    const o = (await got(store.get(id))) as OutboxOrder | undefined;
    if (o) store.put({ ...o, attempts: o.attempts + 1 });
  }
  await done(tx);
}

/** A conflict a manager has looked at goes back in the queue (or is dropped). */
export async function retryConflict(id: string, drop = false): Promise<void> {
  const db = await open();
  const tx = db.transaction("outbox", "readwrite");
  const store = tx.objectStore("outbox");
  if (drop) store.delete(id);
  else {
    const o = (await got(store.get(id))) as OutboxOrder | undefined;
    if (o) store.put({ ...o, status: "pending", error: undefined, attempts: 0 });
  }
  await done(tx);
}
