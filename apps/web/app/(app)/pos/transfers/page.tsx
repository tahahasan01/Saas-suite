"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { formatDay } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { Combobox } from "@/components/Combobox";
import { Dialog } from "@/components/Dialog";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingRows, Select } from "@/components/ui";

type Transfer = Schema<"TransferOut">;
type Branch = { id: string; name: string };
type Product = { id: string; name: string; unit: string; track_stock: boolean };

const STATUS: Record<string, { label: string; tone: "neutral" | "brand" | "success" | "warning" }> = {
  draft: { label: "Draft", tone: "neutral" }, dispatched: { label: "On the way", tone: "warning" },
  received: { label: "Received", tone: "success" }, cancelled: { label: "Cancelled", tone: "neutral" },
};

/* Stock transfers between branches or warehouses (wave B, 0092): draft,
   dispatch (stock leaves the sender), receive (what arrived goes in; a
   shortfall is shown). Each end does only its own part. */
export default function TransfersPage() {
  const [rows, setRows] = useState<Transfer[] | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [receiving, setReceiving] = useState<Transfer | null>(null);
  const load = useCallback(() => {
    setError(null);
    api<Transfer[]>("/pos/transfers").then(setRows).catch((e) => setError(errorText(e, "Couldn't load transfers.")));
    api<Branch[]>("/org/branches").then(setBranches).catch(() => setBranches([]));
  }, []);
  useEffect(load, [load]);
  const act = useAction(
    (t: Transfer, what: "dispatch" | "cancel") => api(`/pos/transfers/${t.id}/${what}`, { method: "POST" }),
    { success: "Done", failure: "Couldn't do that" },
  );

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!rows) return <LoadingRows rows={4} label="Loading transfers" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg-muted">Move stock between your branches and warehouses.</p>
        <Can perm="products.transfer.manage">
          <Button onClick={() => setCreating(true)} disabled={branches.length < 2}>New transfer</Button>
        </Can>
      </div>
      {branches.length < 2 && (
        <p className="text-sm text-fg-muted">Add a second branch or a warehouse under Settings › Company first.</p>
      )}
      {rows.length === 0 ? <EmptyState title="No transfers yet" /> : (
        <ul aria-label="Transfers" className="space-y-3">
          {rows.map((t) => (
            <li key={t.id}>
              <Card className="space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold tabular-nums">{t.number}</span>
                  <Badge tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Badge>
                  <span className="text-fg-muted">{t.from_branch} → {t.to_branch} · {formatDay(t.created_at)}</span>
                  <span className="ms-auto flex gap-2">
                    {t.status === "draft" && (
                      <Can perm="products.transfer.manage">
                        <Button size="sm" variant="ghost" disabled={act.busy} onClick={async () => { if ((await act.run(t, "cancel")) !== undefined) load(); }}>Cancel</Button>
                        <Button size="sm" disabled={act.busy} aria-label={`Dispatch ${t.number}`}
                                onClick={async () => { if ((await act.run(t, "dispatch")) !== undefined) load(); }}>Dispatch</Button>
                      </Can>
                    )}
                    {t.status === "dispatched" && (
                      <Can perm="products.transfer.receive">
                        <Button size="sm" aria-label={`Receive ${t.number}`} onClick={() => setReceiving(t)}>Receive</Button>
                      </Can>
                    )}
                  </span>
                </div>
                <ul className="text-fg-muted">
                  {t.lines.map((l) => (
                    <li key={l.id}>
                      {l.product_name}: {l.qty_sent} {l.unit}
                      {l.qty_received != null && <> · received {l.qty_received}{l.variance ? <span className="text-danger"> · {l.variance} short</span> : ""}</>}
                    </li>
                  ))}
                </ul>
                {t.note && <p className="text-xs text-fg-subtle">{t.note}</p>}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {creating && <NewTransfer branches={branches} onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} />}
      {receiving && <Receive t={receiving} onClose={() => setReceiving(null)} onDone={() => { setReceiving(null); load(); }} />}
    </div>
  );
}

function NewTransfer({ branches, onClose, onDone }: { branches: Branch[]; onClose: () => void; onDone: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [from, setFrom] = useState(branches[0]?.id ?? "");
  const [to, setTo] = useState(branches[1]?.id ?? "");
  const [lines, setLines] = useState<{ product_id: string; qty: string }[]>([{ product_id: "", qty: "" }]);
  const [note, setNote] = useState("");
  useEffect(() => { api<Product[]>("/pos/products").then((p) => setProducts(p.filter((x) => x.track_stock))).catch(() => setProducts([])); }, []);
  const save = useAction(
    () => api("/pos/transfers", { method: "POST", body: JSON.stringify({
      from_branch_id: from, to_branch_id: to, note,
      lines: lines.filter((l) => l.product_id && Number(l.qty) > 0).map((l) => ({ product_id: l.product_id, qty: Number(l.qty) })) }) }),
    { success: "Transfer saved as a draft", failure: "Couldn't save the transfer" },
  );
  const options = products.map((p) => ({ value: p.id, label: p.name, hint: p.unit }));
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title="New transfer" size="lg"
            footer={<Button disabled={save.busy || from === to} onClick={async () => { if ((await save.run()) !== undefined) onDone(); }}>Save draft</Button>}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="From">
            <Select value={from} onChange={(e) => setFrom(e.target.value)}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
          </Field>
          <Field label="To">
            <Select value={to} onChange={(e) => setTo(e.target.value)}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
          </Field>
        </div>
        {from === to && <p role="alert" className="text-sm text-danger">Pick two different branches.</p>}
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_7rem] gap-2">
            <Combobox label={`Product ${i + 1}`} options={options} value={l.product_id}
                      onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, product_id: v } : x)))} />
            <Field label="Quantity">
              <Input type="number" inputMode="decimal" min={0} step="any" value={l.qty}
                     onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
            </Field>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={() => setLines([...lines, { product_id: "", qty: "" }])}>Add a line</Button>
        <Field label="Note"><Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}

function Receive({ t, onClose, onDone }: { t: Transfer; onClose: () => void; onDone: () => void }) {
  const [got, setGot] = useState<Record<string, string>>(Object.fromEntries(t.lines.map((l) => [l.id, String(l.qty_sent)])));
  const save = useAction(
    () => api(`/pos/transfers/${t.id}/receive`, { method: "POST", body: JSON.stringify({
      lines: t.lines.map((l) => ({ line_id: l.id, qty_received: Number(got[l.id] || 0) })) }) }),
    { success: "Received", failure: "Couldn't receive it" },
  );
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={`Receive ${t.number}`}
            footer={<Button disabled={save.busy} onClick={async () => { if ((await save.run()) !== undefined) onDone(); }}>Receive</Button>}>
      <p className="mb-3 text-sm text-fg-muted">Enter what actually arrived. Anything short is recorded on the transfer.</p>
      <div className="space-y-2">
        {t.lines.map((l) => (
          <Field key={l.id} label={`${l.product_name} (sent ${l.qty_sent} ${l.unit})`}>
            <Input type="number" inputMode="decimal" min={0} max={l.qty_sent} step="any" value={got[l.id]}
                   onChange={(e) => setGot({ ...got, [l.id]: e.target.value })} />
          </Field>
        ))}
      </div>
    </Dialog>
  );
}
