"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { formatDay, money } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { Combobox } from "@/components/Combobox";
import { Dialog } from "@/components/Dialog";
import { type Claim, ClaimForm, ClaimLines, ClaimStatus } from "@/components/hrms/Expenses";
import { Button, EmptyState, ErrorState, Field, Input, LoadingRows, Select } from "@/components/ui";

type Employee = { id: string; name: string };

/** Expense claims (wave C, H13): approve to pay them with the next
 *  salary, or reject with a reason. HR can claim for someone too. */
export default function ExpensesPage() {
  const [rows, setRows] = useState<Claim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("submitted");
  const [open, setOpen] = useState<Claim | null>(null);
  const [claiming, setClaiming] = useState(false);
  const load = useCallback(() => {
    setError(null);
    api<Claim[]>(`/hrms/expenses${status ? `?status=${status}` : ""}`).then(setRows).catch((e) => setError(errorText(e)));
  }, [status]);
  useEffect(load, [load]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Show">
            <option value="submitted">Waiting</option><option value="approved">Approved</option>
            <option value="rejected">Rejected</option><option value="">All</option>
          </Select>
        </div>
        <Can perm="hrms.expense.manage"><Button variant="subtle" onClick={() => setClaiming(true)}>Claim for someone</Button></Can>
      </div>
      {error ? <ErrorState message={error} onRetry={load} /> : rows === null ? <LoadingRows rows={3} /> : rows.length === 0 ? (
        <EmptyState title="No claims here" hint="Staff claim from My space > Expenses." />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface text-sm" aria-label="Expense claims">
          {rows.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setOpen(c)} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-start hover:bg-elevated">
                <span><span className="font-medium">{c.employee_name}</span>
                  <span className="block text-xs text-fg-muted">{c.title} · {formatDay(c.created_at.slice(0, 10))} · {(c.lines ?? []).length} line(s)</span></span>
                <span className="flex items-center gap-2"><span className="tabular-nums">{money(c.approved_minor ?? c.total_minor)}</span><ClaimStatus c={c} /></span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <Decide claim={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); load(); }} />}
      {claiming && <ClaimFor onClose={() => setClaiming(false)} onDone={() => { setClaiming(false); load(); }} />}
    </div>
  );
}

function Decide({ claim, onClose, onDone }: { claim: Claim; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(String(claim.total_minor / 100));
  const [note, setNote] = useState("");
  const approve = useAction(
    () => api(`/hrms/expenses/${claim.id}/approve`, { method: "POST", body: JSON.stringify({ approved_minor: Math.round(Number(amount) * 100), note }) }),
    { success: "Approved: it's paid with the next salary", failure: "Couldn't approve it" },
  );
  const reject = useAction(
    () => api(`/hrms/expenses/${claim.id}/reject`, { method: "POST", body: JSON.stringify({ note }) }),
    { success: "Rejected", failure: "Couldn't reject it" },
  );
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={`${claim.employee_name}: ${claim.title}`} size="lg">
      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between"><span>Claimed {money(claim.total_minor)}</span><ClaimStatus c={claim} /></div>
        <ClaimLines c={claim} />
        {claim.decision_note && <p className="text-fg-muted">Note: {claim.decision_note}</p>}
        {claim.status === "submitted" && (
          <Can perm="hrms.expense.approve">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Approve (PKR)"><Input type="number" min={0.01} step="0.01" max={claim.total_minor / 100} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
              <Field label="Note (needed to reject)"><Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={reject.busy || !note.trim()} onClick={async () => { if ((await reject.run()) !== undefined) onDone(); }}>Reject</Button>
              <Button disabled={approve.busy || !(Number(amount) > 0)} onClick={async () => { if ((await approve.run()) !== undefined) onDone(); }}>Approve</Button>
            </div>
          </Can>
        )}
      </div>
    </Dialog>
  );
}

function ClaimFor({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [people, setPeople] = useState<Employee[]>([]);
  const [who, setWho] = useState("");
  useEffect(() => { api<Employee[]>("/hrms/employees", { notify: false }).then(setPeople).catch(() => setPeople([])); }, []);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title="Claim for someone" size="lg">
      <div className="space-y-3">
        <Combobox label="For" options={people.map((p) => ({ value: p.id, label: p.name }))} value={who} onChange={setWho} />
        {who && <ClaimForm url="/hrms/expenses" employeeId={who} onDone={onDone} />}
      </div>
    </Dialog>
  );
}
