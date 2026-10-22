"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { device, forgetDevice, saveDevice, type Device } from "@/lib/offline/store";
import { syncOnce } from "@/lib/offline/sync";
import { Button, Card, Field, Input } from "@/components/ui";

/** Sets this browser up as a till that keeps selling offline (3D): it gets a
 *  device code and a token (shown once, kept on this device only), then
 *  downloads the catalogue. A manager does it once per till. */
export function TillDeviceCard({ register }: { register: { id: string; code: string; name: string } }) {
  const [dev, setDev] = useState<Device | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { setDev(device()); }, []);

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
      await syncOnce();
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
          <Button size="sm" variant="ghost" onClick={() => { forgetDevice(); setDev(null); }}>Stop using this browser as a till</Button>
        </>
      ) : (
        <Can perm="pos.register.manage" fallback={<p className="text-sm text-fg-muted">A manager sets a till up for offline selling here.</p>}>
          <p className="text-xs text-fg-muted">Give this till a short code (for example T1). Its offline receipts are numbered {register.code}-T1-000001 and up.</p>
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
    </Card>
  );
}
