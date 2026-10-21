"use client";

import { useCallback, useEffect, useState } from "react";
import { PROVINCES, PROVINCE_NAMES, type GeoMode, type Kiosk, type Province, type WorkLocation } from "@business-os/types";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { formatDateTime } from "@/lib/format";
import { currentFix } from "@/lib/geo";
import { errorText, useAction } from "@/lib/useAction";
import { useConfirm } from "@/components/Confirm";
import { Dialog } from "@/components/Dialog";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingRows, Select, Textarea } from "@/components/ui";

/* Where people work, and the shared devices they clock in on. A site's point
   and radius are the geofence the server checks staff punches against; its
   networks are where punches (and its kiosks) must come from. "Record" keeps
   the punch and flags it; "Require" refuses it. */

const MODE: Record<GeoMode, string> = { off: "Off", record: "Record and flag", require: "Require" };

type Draft = {
  name: string; kind: WorkLocation["kind"]; address: string; lat: string; lng: string; radius_m: string;
  cidrs: string; province: Province | ""; geo_mode: GeoMode; ip_mode: GeoMode;
};
const blank: Draft = { name: "", kind: "store", address: "", lat: "", lng: "", radius_m: "150", cidrs: "", province: "", geo_mode: "record", ip_mode: "off" };
const toDraft = (l: WorkLocation): Draft => ({
  name: l.name, kind: l.kind, address: l.address, lat: l.lat?.toString() ?? "", lng: l.lng?.toString() ?? "",
  radius_m: String(l.radius_m), cidrs: l.allowed_cidrs.join("\n"), province: l.province ?? "", geo_mode: l.geo_mode, ip_mode: l.ip_mode,
});
const toBody = (d: Draft) => ({
  name: d.name, kind: d.kind, address: d.address,
  lat: d.lat ? Number(d.lat) : null, lng: d.lng ? Number(d.lng) : null, radius_m: Number(d.radius_m || 150),
  allowed_cidrs: d.cidrs.split(/[\s,]+/).filter(Boolean), province: d.province || null,
  geo_mode: d.geo_mode, ip_mode: d.ip_mode,
});

export default function SitesAndKiosks() {
  const [locs, setLocs] = useState<WorkLocation[] | null>(null);
  const [kiosks, setKiosks] = useState<Kiosk[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WorkLocation | "new" | null>(null);
  const [created, setCreated] = useState<Kiosk | null>(null);
  const confirm = useConfirm();

  const load = useCallback(() => {
    setError(null);
    api<WorkLocation[]>("/hrms/locations").then(setLocs).catch((e) => setError(errorText(e, "Couldn't load sites.")));
    api<Kiosk[]>("/hrms/kiosks").then(setKiosks).catch(() => setKiosks([]));
  }, []);
  useEffect(load, [load]);

  const newKiosk = useAction(
    (l: WorkLocation) => api<Kiosk>("/hrms/kiosks", { method: "POST", body: JSON.stringify({ location_id: l.id, name: `${l.name} kiosk` }) }),
    { success: "Kiosk created", failure: "Couldn't create the kiosk" },
  );
  const revoke = useAction(
    (k: Kiosk) => api<Kiosk>(`/hrms/kiosks/${k.id}/revoke`, { method: "POST" }),
    { success: "Kiosk switched off", failure: "Couldn't switch it off" },
  );

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!locs) return <LoadingRows rows={3} label="Loading sites" />;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Sites</h2>
          <Can perm="hrms.org.manage"><Button size="sm" onClick={() => setEditing("new")}>Add site</Button></Can>
        </div>
        {locs.length === 0 ? (
          <EmptyState title="No sites yet" hint="Add your shop or office to check where staff clock in from, and to set up a kiosk." />
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {locs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1 basis-56">
                  <span className="font-medium">{l.name}</span>
                  {l.province && <span className="text-fg-subtle"> · {PROVINCE_NAMES[l.province]}</span>}
                  <span className="block text-xs text-fg-subtle">
                    Location {l.lat !== null ? `${MODE[l.geo_mode].toLowerCase()} within ${l.radius_m} m` : "not set"}
                    {" · "}network {l.allowed_cidrs.length ? MODE[l.ip_mode].toLowerCase() : "any"}
                  </span>
                </span>
                {!l.active && <Badge>off</Badge>}
                <Can perm="hrms.kiosk.manage">
                  <Button size="sm" variant="subtle" disabled={newKiosk.busy || !l.active}
                          onClick={async () => { const k = await newKiosk.run(l); if (k) { setCreated(k); load(); } }}>
                    New kiosk
                  </Button>
                </Can>
                <Can perm="hrms.org.manage">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(l)} aria-label={`Edit ${l.name}`}>Edit</Button>
                </Can>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Can perm="hrms.kiosk.manage">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Kiosks</h2>
          <p className="text-xs text-fg-subtle">A kiosk is a tablet or PC at the site where staff clock in with their PIN. It can do nothing else.</p>
          {kiosks.length === 0 ? <p className="text-sm text-fg-muted">No kiosks yet.</p> : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {kiosks.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 basis-48">
                    {k.name} <span className="text-fg-subtle">· {k.location_name}</span>
                    <span className="block text-xs text-fg-subtle">
                      {k.revoked_at ? "Switched off" : k.last_seen_at ? `Last used ${formatDateTime(k.last_seen_at)}` : "Not used yet"}
                    </span>
                  </span>
                  {!k.revoked_at && (
                    <Button size="sm" variant="ghost" onClick={() => void confirm({
                      title: `Switch off ${k.name}?`, body: "Its link stops working at once. Make a new kiosk to replace it.",
                      confirmLabel: "Switch off", tone: "danger", busyLabel: "Switching off…",
                      run: async () => { const ok = (await revoke.run(k)) !== undefined; load(); return ok; },
                    })}>Switch off</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </Can>

      {editing && <SiteDialog site={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={load} />}
      {created && <KioskLink kiosk={created} onClose={() => setCreated(null)} />}
    </div>
  );
}

function SiteDialog({ site, onClose, onSaved }: { site: WorkLocation | null; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(site ? toDraft(site) : blank);
  const [locating, setLocating] = useState(false);
  const save = useAction(
    () => site
      ? api(`/hrms/locations/${site.id}`, { method: "PATCH", body: JSON.stringify(toBody(d)) })
      : api("/hrms/locations", { method: "POST", body: JSON.stringify(toBody(d)) }),
    { success: "Site saved", failure: "Couldn't save the site" },
  );
  async function here() {
    setLocating(true);
    const fix = await currentFix();
    setLocating(false);
    if (fix) setD({ ...d, lat: fix.lat.toFixed(6), lng: fix.lng.toFixed(6) });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((await save.run()) === undefined) return;
    onSaved();
    onClose();
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={site ? `Edit ${site.name}` : "Add a site"}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="site" disabled={save.busy || !d.name.trim()}>{save.busy ? "Saving…" : "Save site"}</Button>
        </>
      }
    >
      <form id="site" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={d.name} required maxLength={120} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
        <Field label="Kind">
          <Select value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as Draft["kind"] })}>
            <option value="store">Shop / store</option><option value="office">Office</option>
            <option value="warehouse">Warehouse</option><option value="factory">Factory</option><option value="remote">Remote</option>
          </Select>
        </Field>
        <Field label="Province">
          <Select value={d.province} onChange={(e) => setD({ ...d, province: e.target.value as Province | "" })}>
            <option value="">—</option>
            {PROVINCES.map((p) => <option key={p} value={p}>{PROVINCE_NAMES[p]}</option>)}
          </Select>
        </Field>
        <Field label="Address"><Input value={d.address} maxLength={400} onChange={(e) => setD({ ...d, address: e.target.value })} /></Field>
        <Field label="Latitude"><Input inputMode="decimal" value={d.lat} onChange={(e) => setD({ ...d, lat: e.target.value })} /></Field>
        <Field label="Longitude"><Input inputMode="decimal" value={d.lng} onChange={(e) => setD({ ...d, lng: e.target.value })} /></Field>
        <div className="sm:col-span-2">
          <Button type="button" size="sm" variant="subtle" onClick={here} disabled={locating}>
            {locating ? "Finding your location…" : "Use where I am now"}
          </Button>
        </div>
        <Field label="Radius (metres)"><Input type="number" min={10} max={5000} value={d.radius_m} onChange={(e) => setD({ ...d, radius_m: e.target.value })} /></Field>
        <Field label="Location check">
          <Select value={d.geo_mode} onChange={(e) => setD({ ...d, geo_mode: e.target.value as GeoMode })}>
            {(Object.keys(MODE) as GeoMode[]).map((m) => <option key={m} value={m}>{MODE[m]}</option>)}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Office networks (one per line, e.g. 203.0.113.0/24)">
            <Textarea rows={2} value={d.cidrs} onChange={(e) => setD({ ...d, cidrs: e.target.value })} className="font-mono text-xs" />
          </Field>
        </div>
        <Field label="Network check">
          <Select value={d.ip_mode} onChange={(e) => setD({ ...d, ip_mode: e.target.value as GeoMode })}>
            {(Object.keys(MODE) as GeoMode[]).map((m) => <option key={m} value={m}>{MODE[m]}</option>)}
          </Select>
        </Field>
        <p className="text-xs text-fg-subtle sm:col-span-2">
          Kiosks only work from these networks when any are listed. Phones on mobile data won&apos;t match an office network.
        </p>
      </form>
    </Dialog>
  );
}

/* The token is shown once: the server keeps only a hash. */
function KioskLink({ kiosk, onClose }: { kiosk: Kiosk; onClose: () => void }) {
  const url = typeof window === "undefined" ? `/kiosk/${kiosk.token}` : `${window.location.origin}/kiosk/${kiosk.token}`;
  const [copied, setCopied] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Open this link on the kiosk"
      description="It's shown only now. Open it on the shop's tablet or PC and bookmark it. If it's lost, switch this kiosk off and make a new one."
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <Card className="space-y-2">
        <p className="break-all font-mono text-xs" data-testid="kiosk-url">{url}</p>
        <Button size="sm" variant="subtle" onClick={async () => { await navigator.clipboard?.writeText(url); setCopied(true); }}>
          {copied ? "Copied" : "Copy link"}
        </Button>
      </Card>
    </Dialog>
  );
}
