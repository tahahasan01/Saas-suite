"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { relativeDate } from "@/lib/format";
import { device, forgetDevice, saveDevice, type Device } from "@/lib/offline/store";
import { syncOnce } from "@/lib/offline/sync";
import { Badge, Button, Card, Field, Input } from "@/components/ui";

type TillDevice = Schema<"DeviceOut">;
type Persist = "kept" | "may-clear" | "unknown";

/** Asks the browser to keep this till's saved catalogue and unsent sales even
 *  when the device runs low on space (3D), and says what it answered. */
async function keepStorage(): Promise<Persist> {
  const st = typeof navigator !== "undefined" ? navigator.storage : undefined;
  if (!st?.persist) return "unknown";
  try {
    return (await st.persisted()) || (await st.persist()) ? "kept" : "may-clear";
  } catch {
    return "unknown";
  }
}

const PERSIST_TEXT: Record<Persist, string> = {
  kept: "The browser keeps this till's saved products and unsent sales, even when space runs low.",
  "may-clear": "The browser may clear this till's saved data when space runs low. Install the app or keep space free.",
  unknown: "This browser doesn't say whether it keeps the till's saved data.",
};

/** Sets this browser up as a till that keeps selling offline (3D): it gets a
 *  device code and a token (shown once, kept on this device only), then
 *  downloads the catalogue. A manager does it once per till. */
export function TillDeviceCard({ register }: { register: { id: string; code: string; name: string } }) {
  const [dev, setDev] = useState<Device | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [persist, setPersist] = useState<Persist | null>(null);
  const [tills, setTills] = useState<TillDevice[] | null>(null);
  useEffect(() => {
    const d = device();
    setDev(d);
    if (d) void keepStorage().then(setPersist);
  }, []);
  const loadTills = useCallback(() => {
    api<TillDevice[]>(`/pos/devices?register_id=${register.id}`, { notify: false }).then(setTills).catch(() => setTills(null));
  }, [register.id]);
  useEffect(loadTills, [loadTills]);

  async function register_(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ id: string; token: string; device_code: string }>("/pos/devices", {
        method: "POST", body: JSON.stringify({ register_id: register.id, device_code: code, name: `Till ${code}` }) });
      const d = { device_id: r.id, token: r.token, device_code: r.device_code, register_id: register.id, register_code: register.code };
      saveDevice(d);
      setDev(d);
      setPersist(await keepStorage());
      await syncOnce();
      loadTills();
      setMsg("This till can now sell offline. Its products are saved on it.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Couldn't set up this till");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold">Selling offline</h2>
      {dev ? (
        <>
          <p className="text-sm">This browser is till <span className="font-mono font-medium">{dev.register_code}-{dev.device_code}</span>.
            It keeps selling when the internet drops and sends the sales when it&apos;s back.</p>
          {persist && <p className="text-xs text-fg-muted" data-testid="till-storage">{PERSIST_TEXT[persist]}</p>}
          <Button size="sm" variant="ghost" onClick={() => { forgetDevice(); setDev(null); }}>Stop using this browser as a till</Button>
        </>
      ) : (
        <Can perm="pos.register.manage" fallback={<p className="text-sm text-fg-muted">A manager sets a till up for offline selling here.</p>}>
          <p className="text-xs text-fg-muted">Give this till a short code (for example T1). Its offline receipts are numbered {register.code}-T1-000001 and up.</p>
          {/* D-25 is open: FBR/PRAL haven't confirmed late filing of offline sales. */}
          <p className="rounded-lg border border-warning/40 bg-warning/5 p-2 text-xs">
            If FBR invoicing is on: sales made offline are sent to FBR when the till is back online, so their
            receipts say &ldquo;FBR pending&rdquo; until then. FBR hasn&apos;t confirmed that late filing is accepted;
            turn this on only if you accept that.
          </p>
          <form onSubmit={register_} className="flex items-end gap-2">
            <Field label="Till code">
              <Input value={code} required maxLength={6} pattern="[A-Z0-9]{1,6}" placeholder="T1"
                     onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
            </Field>
            <Button type="submit" variant="subtle" disabled={busy || !code}>{busy ? "Setting up…" : "Use this browser as a till"}</Button>
          </form>
        </Can>
      )}
      {msg && <p role="status" className="text-xs text-fg-muted">{msg}</p>}
      {tills && tills.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-semibold text-fg-muted">Tills on this register</h3>
          <ul className="divide-y divide-line text-sm" aria-label="Tills on this register">
            {tills.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span className="font-mono">{register.code}-{t.device_code}</span>
                <span className="flex items-center gap-2 text-xs text-fg-muted">
                  {t.outbox_count > 0
                    ? <Badge tone={t.ageing ? "danger" : "warning"}>{t.outbox_count} unsent{t.ageing ? " for over 30 min" : ""}</Badge>
                    : <Badge tone="success">all sent</Badge>}
                  <span>{t.last_seen_at ? `seen ${relativeDate(t.last_seen_at)}` : "never synced"}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
