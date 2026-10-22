"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useCan } from "@/lib/can";
import { formatDateTime, money } from "@/lib/format";
import { BUSINESS_TZ } from "@/lib/dates";
import { errorText, useAction } from "@/lib/useAction";
import { Badge, Button, EmptyState, ErrorState, Field, Input, LoadingRows, Select } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { Sheet } from "@/components/Dialog";

type Row = { contact_id: string; name: string; phone: string; balance_minor: number; credit_limit_minor: number | null;
             last_entry_at: string };
type Entry = { id: string; kind: string; amount_minor: number; balance_after_minor: number; receipt_no: string | null;
               method: string | null; note: string; created_at: string };
type Account = { contact_id: string; name: string; balance_minor: number; credit_limit_minor: number | null; entries: Entry[] };

const KIND: Record<string, string> = { sale: "Bought on khata", refund: "Returned", payment: "Paid", adjustment: "Adjusted" };
const toMinor = (v: string) => Math.round(Number(v || 0) * 100);

/* Khata (3C): customers who buy on credit. The ledger is append-only: a
   khata sale adds to what they owe, a payment or a return takes it off. */
export default function KhataPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api<Row[]>("/khata").then(setRows).catch((e) => setError(errorText(e, "Couldn't load khata balances.")));
  }, []);
  useEffect(load, [load]);

  const total = (rows ?? []).reduce((n, r) => n + Math.max(r.balance_minor, 0), 0);
  const columns: Column<Row>[] = [
    { key: "name", header: "Customer", primary: true, cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: "phone", header: "Phone", cell: (r) => <span className="text-fg-muted">{r.phone}</span> },
    { key: "owes", header: "Owes", align: "right", cell: (r) => (
      <span className="tabular-nums">
        {money(r.balance_minor)}
        {r.credit_limit_minor !== null && r.balance_minor > r.credit_limit_minor && <Badge tone="danger">over limit</Badge>}
      </span>) },
    { key: "limit", header: "Limit", align: "right", cell: (r) => r.credit_limit_minor === null
      ? <span className="text-fg-subtle">None</span> : <span className="tabular-nums">{money(r.credit_limit_minor)}</span> },
  ];

  return (
    <>
      <p className="mb-4 text-sm text-fg-muted">
        Customers who buy on credit. Total owed to you: <span className="font-semibold text-fg tabular-nums">{money(total)}</span>
      </p>
      {error ? <ErrorState message={error} onRetry={load} /> : (
        <DataTable columns={columns} rows={rows ?? []} rowKey={(r) => r.contact_id} loading={rows === null} caption="Khata"
                   empty={<EmptyState title="Nobody owes you anything." hint="Ring up a sale with Khata as the payment to put it on a customer's account." />}
                   actions={(r) => <Button size="sm" variant="subtle" onClick={() => setOpen(r.contact_id)}>Open<span className="sr-only"> {r.name}</span></Button>} />
      )}
      <AccountSheet id={open} onClose={() => setOpen(null)} onChanged={load} />
    </>
  );
}

function AccountSheet({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const can = useCan();
  const [acct, setAcct] = useState<Account | null>(null);
  const [pay, setPay] = useState({ amount: "", method: "cash", note: "" });
  const [limit, setLimit] = useState("");
  const load = useCallback(() => {
    if (!id) return;
    api<Account>(`/khata/${id}`).then((a) => { setAcct(a); setLimit(a.credit_limit_minor === null ? "" : String(a.credit_limit_minor / 100)); })
      .catch(() => setAcct(null));
  }, [id]);
  useEffect(() => { setAcct(null); load(); }, [load]);

  const receive = useAction(
    () => api<Account>(`/khata/${id}/payments`, { method: "POST", body: JSON.stringify({
      amount_minor: toMinor(pay.amount), method: pay.method, note: pay.note }) }),
    { success: "Payment recorded", failure: "Couldn't record the payment" });
  const saveLimit = useAction(
    () => api<Account>(`/khata/${id}`, { method: "PATCH", body: JSON.stringify({
      credit_limit_minor: limit.trim() === "" ? null : toMinor(limit) }) }),
    { success: "Limit saved", failure: "Couldn't save the limit" });

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()} title={acct ? `Khata · ${acct.name}` : "Khata"}>
      {!acct ? <LoadingRows rows={4} label="Loading account" /> : (
        <div className="space-y-5 text-sm">
          <p>Owes <span className="text-lg font-semibold tabular-nums">{money(acct.balance_minor)}</span></p>
          {can("khata.payment.record") && acct.balance_minor > 0 && (
            <form className="space-y-2 rounded-lg border border-line p-3" onSubmit={async (e) => {
              e.preventDefault();
              const a = await receive.run();
              if (a) { setAcct(a); setPay({ amount: "", method: "cash", note: "" }); onChanged(); }
            }}>
              <h3 className="font-semibold">Take a payment</h3>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Amount (PKR)"><Input type="number" inputMode="decimal" min={0.01} step="0.01" max={acct.balance_minor / 100}
                                                   value={pay.amount} required onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
                <Field label="How">
                  <Select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                    <option value="cash">Cash</option><option value="bank">Bank transfer</option><option value="jazzcash">JazzCash</option>
                    <option value="easypaisa">Easypaisa</option><option value="raast">Raast</option><option value="cheque">Cheque</option>
                  </Select>
                </Field>
              </div>
              <Field label="Note"><Input value={pay.note} maxLength={300} onChange={(e) => setPay({ ...pay, note: e.target.value })} /></Field>
              <Button type="submit" size="sm" disabled={receive.busy}>{receive.busy ? "Saving…" : "Record payment"}</Button>
            </form>
          )}
          {can("khata.limit.manage") && (
            <form className="flex items-end gap-2" onSubmit={async (e) => { e.preventDefault(); const a = await saveLimit.run(); if (a) { setAcct(a); onChanged(); } }}>
              <div className="flex-1"><Field label="Credit limit (PKR, blank = none)">
                <Input type="number" inputMode="decimal" min={0} step="1" value={limit} onChange={(e) => setLimit(e.target.value)} />
              </Field></div>
              <Button type="submit" size="sm" variant="subtle" disabled={saveLimit.busy}>Save limit</Button>
            </form>
          )}
          <div>
            <h3 className="mb-2 font-semibold">Statement</h3>
            <ul className="divide-y divide-line">
              {[...acct.entries].reverse().map((e) => (
                <li key={e.id} className="flex justify-between gap-2 py-1.5">
                  <span className="min-w-0">
                    <span>{KIND[e.kind] ?? e.kind}{e.receipt_no ? ` · ${e.receipt_no}` : ""}</span>
                    <span className="block truncate text-xs text-fg-subtle">{[e.note, formatDateTime(e.created_at, BUSINESS_TZ)].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="text-right tabular-nums">
                    <span className={e.amount_minor < 0 ? "text-success" : ""}>{e.amount_minor > 0 ? "+" : "−"}{money(Math.abs(e.amount_minor))}</span>
                    <span className="block text-xs text-fg-subtle">{money(e.balance_after_minor)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Sheet>
  );
}
