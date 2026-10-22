"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { formatDay, money } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { Combobox } from "@/components/Combobox";
import { Dialog } from "@/components/Dialog";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingRows, Select } from "@/components/ui";

type Asset = Schema<"AssetOut">;
type Assignment = Schema<"AssetAssignmentOut">;
type Employee = { id: string; name: string };

const CATEGORIES: Record<string, string> = {
  laptop: "Laptop", desktop: "Desktop", phone: "Phone", tablet: "Tablet", sim: "SIM", vehicle: "Vehicle",
  furniture: "Furniture", tool: "Tool", uniform: "Uniform", other: "Other",
};
const CONDITIONS: Record<string, string> = { new: "New", good: "Good", fair: "Fair", damaged: "Damaged" };
const TONE = { available: "success", issued: "brand", retired: "neutral", lost: "danger" } as const;

/** Assets issued to staff (wave A, H22): the register, who holds what, and
 *  each asset's history. Value shows only to asset managers. */
export default function AssetsPage() {
  const [rows, setRows] = useState<Asset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<Employee[]>([]);
  const [issuing, setIssuing] = useState<Asset | null>(null);
  const [returning, setReturning] = useState<Asset | null>(null);
  const [history, setHistory] = useState<Asset | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(() => {
    setError(null);
    api<Asset[]>("/hrms/assets").then(setRows).catch((e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    api<Employee[]>("/hrms/employees", { notify: false }).then(setPeople).catch(() => setPeople([]));
  }, []);

  const retire = useAction(
    (a: Asset, status: string) => api(`/hrms/assets/${a.id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    { failure: "Couldn't change it" },
  );
  const shown = (rows ?? []).filter((a) => !filter || a.status === filter);

  return (
    <div className="space-y-4">
      <Can perm="hrms.asset.manage"><NewAsset onAdded={load} /></Can>
      <div className="w-44">
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Show">
          <option value="">All assets</option><option value="available">Available</option>
          <option value="issued">Issued</option><option value="retired">Retired</option><option value="lost">Lost</option>
        </Select>
      </div>
      {error ? <ErrorState message={error} onRetry={load} /> : rows === null ? <LoadingRows rows={4} /> : shown.length === 0 ? (
        <EmptyState title="No assets yet" hint="Add laptops, phones, SIMs and the like, then issue them to staff." />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface text-sm" aria-label="Assets">
          {shown.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <span className="min-w-0">
                <span className="font-medium">{a.name}</span>{a.tag && <span className="ms-1.5 font-mono text-xs text-fg-subtle">{a.tag}</span>}
                <span className="block text-xs text-fg-muted">
                  {CATEGORIES[a.category]} · {CONDITIONS[a.condition]}{a.serial_no ? ` · S/N ${a.serial_no}` : ""}
                  {a.value_minor != null ? ` · ${money(a.value_minor)}` : ""}
                  {a.holder_name && ` · with ${a.holder_name} since ${formatDay(a.issued_at!.slice(0, 10))}`}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge tone={TONE[a.status]}>{a.status}</Badge>
                <Button size="sm" variant="ghost" onClick={() => setHistory(a)} aria-label={`History of ${a.name}`}>History</Button>
                <Can perm="hrms.asset.manage">
                  {a.status === "available" && <Button size="sm" variant="subtle" onClick={() => setIssuing(a)} aria-label={`Issue ${a.name}`}>Issue</Button>}
                  {a.status === "issued" && <Button size="sm" variant="subtle" onClick={() => setReturning(a)} aria-label={`Take back ${a.name}`}>Take back</Button>}
                  {a.status === "available" && (
                    <Button size="sm" variant="ghost" disabled={retire.busy}
                            onClick={async () => { if ((await retire.run(a, "retired")) !== undefined) load(); }}>Retire</Button>
                  )}
                </Can>
              </span>
            </li>
          ))}
        </ul>
      )}
      {issuing && <IssueDialog asset={issuing} people={people} onClose={() => setIssuing(null)} onDone={load} />}
      {returning && <ReturnDialog asset={returning} onClose={() => setReturning(null)} onDone={load} />}
      {history && <HistoryDialog asset={history} onClose={() => setHistory(null)} />}
    </div>
  );
}

function NewAsset({ onAdded }: { onAdded: () => void }) {
  const blank = { name: "", category: "laptop", tag: "", serial_no: "", value: "", condition: "good" };
  const [f, setF] = useState(blank);
  const add = useAction(
    () => api("/hrms/assets", { method: "POST", body: JSON.stringify({
      name: f.name, category: f.category, tag: f.tag || null, serial_no: f.serial_no, condition: f.condition,
      value_minor: f.value ? Math.round(Number(f.value) * 100) : null,
    }) }),
    { success: "Asset added", failure: "Couldn't add it" },
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((await add.run()) !== undefined) { setF(blank); onAdded(); }
  }
  return (
    <Card>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3" aria-label="Add an asset">
        <Field label="Name"><Input value={f.name} required maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Dell Latitude 5420" /></Field>
        <Field label="Category">
          <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {Object.entries(CATEGORIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Tag (sticker)"><Input value={f.tag} maxLength={40} onChange={(e) => setF({ ...f, tag: e.target.value })} placeholder="LT-001" /></Field>
        <Field label="Serial number"><Input value={f.serial_no} maxLength={80} onChange={(e) => setF({ ...f, serial_no: e.target.value })} /></Field>
        <Field label="Value (PKR)"><Input type="number" min={0} step="0.01" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>
        <Field label="Condition">
          <Select value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value })}>
            {Object.entries(CONDITIONS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <div className="flex justify-end sm:col-span-3"><Button type="submit" disabled={add.busy}>{add.busy ? "Adding…" : "Add asset"}</Button></div>
      </form>
    </Card>
  );
}

function IssueDialog({ asset, people, onClose, onDone }: { asset: Asset; people: Employee[]; onClose: () => void; onDone: () => void }) {
  const [who, setWho] = useState("");
  const [note, setNote] = useState("");
  const issue = useAction(
    () => api(`/hrms/assets/${asset.id}/issue`, { method: "POST", body: JSON.stringify({ employee_id: who, note }) }),
    { success: "Issued", failure: "Couldn't issue it" },
  );
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={`Issue ${asset.name}`}>
      <form onSubmit={async (e) => { e.preventDefault(); if ((await issue.run()) !== undefined) { onDone(); onClose(); } }} className="space-y-3">
        <Combobox label="To" options={people.map((p) => ({ value: p.id, label: p.name }))} value={who} onChange={setWho} />
        <Field label="Note"><Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="With charger and bag" /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={issue.busy || !who}>{issue.busy ? "Issuing…" : "Issue"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function ReturnDialog({ asset, onClose, onDone }: { asset: Asset; onClose: () => void; onDone: () => void }) {
  const [condition, setCondition] = useState(asset.condition);
  const [note, setNote] = useState("");
  const back = useAction(
    () => api(`/hrms/assets/${asset.id}/return`, { method: "POST", body: JSON.stringify({ condition, note }) }),
    { success: "Taken back", failure: "Couldn't record it" },
  );
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={`Take back ${asset.name}`}>
      <form onSubmit={async (e) => { e.preventDefault(); if ((await back.run()) !== undefined) { onDone(); onClose(); } }} className="space-y-3">
        <p className="text-sm text-fg-muted">From {asset.holder_name}.</p>
        <Field label="Condition now">
          <Select value={condition} onChange={(e) => setCondition(e.target.value as Asset["condition"])}>
            {Object.entries(CONDITIONS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Note"><Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={back.busy}>{back.busy ? "Saving…" : "Take back"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function HistoryDialog({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const [rows, setRows] = useState<Assignment[] | null>(null);
  useEffect(() => { api<Assignment[]>(`/hrms/assets/${asset.id}/history`).then(setRows).catch(() => setRows([])); }, [asset.id]);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={`History of ${asset.name}`}>
      {rows === null ? <LoadingRows rows={2} /> : rows.length === 0 ? <p className="text-sm text-fg-muted">Never issued.</p> : (
        <ul className="divide-y divide-line text-sm" aria-label="Asset history">
          {rows.map((h) => (
            <li key={h.id} className="py-2">
              <span className="font-medium">{h.employee_name}</span>
              <span className="block text-xs text-fg-muted">
                {formatDay(h.issued_at.slice(0, 10))} → {h.returned_at ? `${formatDay(h.returned_at.slice(0, 10))}${h.return_condition ? `, back ${CONDITIONS[h.return_condition].toLowerCase()}` : ""}` : "still with them"}
                {h.return_note && ` · ${h.return_note}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
