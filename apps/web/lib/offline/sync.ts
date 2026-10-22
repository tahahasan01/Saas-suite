/* The offline till's sync runner (3D, D-20, D-22, St01 P1): one runner per
 * browser (Web Locks), pulls the catalogue delta and pushes the outbox in
 * batches of 100; backs off with jitter (capped at 5 min) after a failure;
 * wakes on `online` and when the tab is shown; tells the other tabs
 * through a BroadcastChannel. Conflicts are never retried by themselves. */
import { api } from "@/lib/api";
import { backoffMs, batches, needsReset, settle, type SyncResult } from "./plan";
import { device, meta, outbox, resetCatalogue, saveFeed, settleOutbox, type CatalogFeed } from "./store";

export const CHANNEL = "bos-pos";
type Locks = { request: (name: string, opts: { ifAvailable: boolean }, cb: (lock: unknown) => Promise<unknown>) => Promise<unknown> };
const locks = (): Locks | undefined => (typeof navigator !== "undefined" ? (navigator as unknown as { locks?: Locks }).locks : undefined);

export function announce() {
  try { new BroadcastChannel(CHANNEL).postMessage("changed"); } catch { /* old browser: this tab only */ }
}

async function pullCatalogue(registerId: string): Promise<void> {
  let since = (await meta<number>("cursor")) ?? 0;
  const storedConfig = await meta<number>("config_version");
  let restarted = false;
  for (let page = 0; page < 50; page++) {
    const feed = await api<CatalogFeed>(`/pos/catalog/delta?since=${since}&register_id=${registerId}`, { notify: false });
    if (!restarted && needsReset(storedConfig, feed)) {
      restarted = true;
      await resetCatalogue();
      // A server reset already restarted this page from 0; a config change asks again from the start.
      if (!feed.reset && since !== 0) { since = 0; continue; }
    }
    await saveFeed(feed);
    if (!feed.more) return;
    since = feed.next;
  }
}

async function pushOutbox(): Promise<{ flagged: number; conflicts: number }> {
  const d = device();
  if (!d) return { flagged: 0, conflicts: 0 };
  const pending = (await outbox()).filter((o) => o.status === "pending");
  let flagged = 0, conflicts = 0;
  for (const batch of batches(pending, 100)) {
    const orders = batch.map(({ status: _s, error: _e, attempts: _a, ...o }) => o);
    const r = await api<{ results: SyncResult[] }>("/pos/sync/orders", {
      method: "POST", notify: false, headers: { "X-Device-Token": d.token },
      body: JSON.stringify({ device_id: d.device_id, orders }),
    });
    const out = settle(batch.map((o) => o.client_uuid), r.results);
    await settleOutbox(out.done, out.conflicts, out.unanswered);
    flagged += out.flagged.length;
    conflicts += out.conflicts.length;
  }
  return { flagged, conflicts };
}

async function heartbeat(): Promise<void> {
  const d = device();
  if (!d) return;
  const pending = (await outbox()).filter((o) => o.status === "pending");
  await api(`/pos/devices/${d.device_id}/heartbeat`, {
    method: "POST", notify: false, headers: { "X-Device-Token": d.token },
    body: JSON.stringify({ outbox_count: pending.length, oldest_pending_at: pending[0]?.created_at ?? null }),
  });
}

/** One round: push what's waiting first (money before menus), then pull. */
export async function syncOnce(): Promise<{ flagged: number; conflicts: number }> {
  const d = device();
  if (!d) return { flagged: 0, conflicts: 0 };
  const run = async () => {
    const res = await pushOutbox();
    await pullCatalogue(d.register_id);
    await heartbeat().catch(() => {});
    announce();
    return res;
  };
  const l = locks();
  if (!l) return run();
  // Another tab holds the runner: it will sync; this one just listens.
  let result = { flagged: 0, conflicts: 0 };
  await l.request("bos-pos-sync", { ifAvailable: true }, async (lock) => { if (lock) result = await run(); });
  return result;
}

/** Runs syncOnce now, on `online`, when the tab is shown and every minute;
 *  after a failure waits backoffMs(attempt). Returns a stop function. */
export function startSync(onState: (s: { ok: boolean; at: number }) => void): () => void {
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const schedule = (ms: number) => { clearTimeout(timer); if (!stopped) timer = setTimeout(tick, ms); };
  async function tick() {
    if (!navigator.onLine) { onState({ ok: false, at: Date.now() }); schedule(60_000); return; }
    try {
      await syncOnce();
      attempt = 0;
      onState({ ok: true, at: Date.now() });
      schedule(60_000);
    } catch {
      onState({ ok: false, at: Date.now() });
      schedule(backoffMs(attempt++));
    }
  }
  const wake = () => schedule(0);
  const shown = () => { if (document.visibilityState === "visible") wake(); };
  window.addEventListener("online", wake);
  document.addEventListener("visibilitychange", shown);
  schedule(0);
  return () => {
    stopped = true;
    clearTimeout(timer);
    window.removeEventListener("online", wake);
    document.removeEventListener("visibilitychange", shown);
  };
}
