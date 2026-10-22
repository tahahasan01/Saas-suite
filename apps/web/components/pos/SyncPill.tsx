"use client";

import { useCallback, useEffect, useState } from "react";
import { device, outbox, retryConflict, type Device, type OutboxOrder } from "@/lib/offline/store";
import { CHANNEL, startSync, syncOnce } from "@/lib/offline/sync";
import { Dialog } from "@/components/Dialog";
import { Button, cx } from "@/components/ui";

/* The offline till's state (3D, D-22, St01 P1): is it online, how much is
 * waiting to sync and since when, conflicts for a manager, and whether
 * another tab is already the till. */

export interface TillState {
  device: Device | null;
  online: boolean;
  reachable: boolean;
  pending: number;
  oldestAt: string | null;
  conflicts: OutboxOrder[];
  /** Another tab of this browser is the till: this one is read-only (D-22). */
  otherTab: boolean;
  refresh: () => void;
}

type Locks = { request: (n: string, o: { ifAvailable?: boolean; signal?: AbortSignal }, cb: (l: unknown) => Promise<unknown>) => Promise<unknown> };

export function useTill(): TillState {
  const [dev, setDev] = useState<Device | null>(null);
  const [online, setOnline] = useState(true);
  const [reachable, setReachable] = useState(true);
  const [items, setItems] = useState<OutboxOrder[]>([]);
  const [otherTab, setOtherTab] = useState(false);

  const refresh = useCallback(() => {
    setDev(device());
    outbox().then(setItems).catch(() => setItems([]));
  }, []);

  useEffect(() => {
    refresh();
    setOnline(navigator.onLine);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    let ch: BroadcastChannel | null = null;
    try { ch = new BroadcastChannel(CHANNEL); ch.onmessage = refresh; } catch { /* this tab only */ }
    const every = setInterval(refresh, 15_000);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); ch?.close(); clearInterval(every); };
  }, [refresh]);

  // One till per browser: the tab holding the lock is the till for as long as
  // it lives. Another tab waits its turn and takes over when that one closes.
  useEffect(() => {
    const locks = (navigator as unknown as { locks?: Locks }).locks;
    if (!locks) return;
    let cancelled = false;
    let release: () => void = () => {};
    const ac = new AbortController();
    // Granted after this effect was cleaned up (a fast remount): give it back.
    const hold = () => (cancelled ? Promise.resolve()
      : new Promise<void>((done) => { release = done; setOtherTab(false); }));
    void locks.request("bos-pos-till", { ifAvailable: true }, (lock) => {
      if (lock) return hold();
      if (!cancelled) setOtherTab(true);
      void locks.request("bos-pos-till", { signal: ac.signal }, hold).catch(() => {});
      return Promise.resolve();
    });
    return () => { cancelled = true; ac.abort(); release(); };
  }, []);

  useEffect(() => {
    if (!dev) return;
    // The app's pages load offline on a registered till (public/sw.js). Not
    // in development: unhashed dev chunks would be served stale.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* still sells; a reload just needs the network */ });
    }
    return startSync(({ ok }) => { setReachable(ok); refresh(); });
  }, [dev, refresh]);

  const pendingItems = items.filter((o) => o.status === "pending");
  // Don't let the tab close on unsent sales without a warning.
  useEffect(() => {
    if (!pendingItems.length) return;
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [pendingItems.length]);

  return { device: dev, online, reachable, pending: pendingItems.length, oldestAt: pendingItems[0]?.created_at ?? null,
           conflicts: items.filter((o) => o.status === "conflict"), otherTab, refresh };
}

const ago = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return min < 1 ? "just now" : min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`;
};

export function SyncPill({ till }: { till: TillState }) {
  const [busy, setBusy] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);
  if (!till.device) return null;
  const state = !till.online ? "offline" : !till.reachable ? "degraded" : "online";
  const label = { online: "Online", offline: "Offline", degraded: "Can't reach the server" }[state];

  async function now() {
    setBusy(true);
    try { await syncOnce(); } catch { /* the pill shows it */ } finally { setBusy(false); till.refresh(); }
  }

  return (
    <span role="status" aria-live="polite"
          className={cx("inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-sm",
                        state === "online" ? "border-line bg-surface" : "border-warning/40 bg-warning/5")}>
      <span aria-hidden="true" className={cx("h-2 w-2 rounded-full", state === "online" ? "bg-success" : state === "offline" ? "bg-danger" : "bg-warning")} />
      <span className="font-medium">{label}</span>
      {till.pending > 0 && (
        <span className="text-fg-muted">· {till.pending} waiting{till.oldestAt && ` (oldest ${ago(till.oldestAt)})`}</span>
      )}
      {till.conflicts.length > 0 && (
        <button type="button" onClick={() => setShowConflicts(true)} className="font-medium text-danger underline">
          {till.conflicts.length} need a manager
        </button>
      )}
      {till.online && (till.pending > 0 || state === "degraded") && (
        <Button size="sm" variant="ghost" onClick={() => void now()} disabled={busy}>{busy ? "Syncing…" : "Sync now"}</Button>
      )}
      <Dialog open={showConflicts} onOpenChange={setShowConflicts} title="Sales that didn't sync" size="md">
        <p className="mb-3 text-sm text-fg-muted">The server couldn&apos;t take these as they were. Fix the cause (for example a product
          or a khata limit), then send again, or remove one that shouldn&apos;t count.</p>
        <ul className="space-y-2">
          {till.conflicts.map((o) => (
            <li key={o.client_uuid} className="rounded-lg border border-line p-3 text-sm">
              <p className="font-mono font-medium">{o.offline_ref}</p>
              <p className="text-danger">{o.error}</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={async () => { await retryConflict(o.client_uuid); till.refresh(); void now(); }}>Send again</Button>
                <Button size="sm" variant="ghost" onClick={async () => { await retryConflict(o.client_uuid, true); till.refresh(); }}>Remove</Button>
              </div>
            </li>
          ))}
        </ul>
      </Dialog>
    </span>
  );
}
