"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { dayPKT } from "@/lib/dates";
import { formatDay, money } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { Badge, Button, Card, ErrorState, Field, Input, LoadingRows, Select } from "@/components/ui";

type Fund = Schema<"PfBalance">;

const signed = (minor: number) => (minor < 0 ? `−${money(-minor)}` : money(minor));

/** A member's fund: the two shares, how much of the company's is theirs
 *  yet, and every month and entry behind it (0113). Shared by the profile
 *  card and My provident fund. */
export function FundSummary({ f, self = false }: { f: Fund; self?: boolean }) {
  const unvested = f.employer_minor - f.vested_employer_minor;
  const history = f.history ?? [];
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3" aria-label="Fund balance">
        <div><dt className="text-xs text-fg-muted">{self ? "You paid in" : "Employee share"}</dt><dd className="font-semibold tabular-nums">{money(f.employee_minor)}</dd></div>
        <div><dt className="text-xs text-fg-muted">Company share</dt><dd className="font-semibold tabular-nums">{money(f.employer_minor)}</dd></div>
        <div><dt className="text-xs text-fg-muted">Total</dt><dd className="font-semibold tabular-nums" data-testid="fund-total">{money(f.employee_minor + f.employer_minor)}</dd></div>
      </dl>
      {f.employer_minor > 0 && (
        <p className="text-xs text-fg-muted">
          {unvested > 0
            ? `The company share becomes ${self ? "yours" : "theirs"} after ${f.vesting_months} months in the fund. Leaving before then pays out ${self ? "your" : "their"} own share only.`
            : `All of the company share is ${self ? "yours" : "theirs"}.`}
        </p>
      )}
      {history.length > 0 && (
        <ul className="divide-y divide-line text-xs" aria-label="Fund history">
          {[...history].reverse().map((h, i) => (
            <li key={`${h.on}-${i}`} className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 py-1.5">
              <span>{formatDay(h.on)} · {h.what}</span>
              <span className="tabular-nums">{signed(h.employee_minor)} + {signed(h.employer_minor)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const KINDS: Record<string, string> = { opening: "Opening balance", withdrawal: "Withdrawal", adjustment: "Adjustment" };

/** On the profile: enrol or end membership, record an opening balance or a
 *  withdrawal. Reading needs payroll.salary.read; changes need
 *  payroll.salary.update, and nobody changes their own fund (the server says). */
export function ProvidentFundCard({ employeeId }: { employeeId: string }) {
  const [f, setF] = useState<Fund | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(dayPKT());
  const [entry, setEntry] = useState({ kind: "opening", ee: "", er: "", note: "" });

  const load = useCallback(() => {
    setError(null);
    api<Fund>(`/payroll/pf/${employeeId}`).then(setF).catch((e) => setError(errorText(e)));
  }, [employeeId]);
  useEffect(load, [load]);

  const membership = useAction(
    (member: boolean) => api<Fund>(`/payroll/pf/${employeeId}`, { method: "PUT", body: JSON.stringify(member ? { member, joined_on: joined } : { member }) }),
    { success: (r) => ((r as Fund).member ? "Added to the provident fund" : "Left the provident fund"), failure: "Couldn't change the membership" },
  );
  const record = useAction(
    () => api<Fund>(`/payroll/pf/${employeeId}/entries`, { method: "POST", body: JSON.stringify({
      kind: entry.kind, employee_minor: Math.round(Number(entry.ee || 0) * 100),
      employer_minor: Math.round(Number(entry.er || 0) * 100), note: entry.note,
    }) }),
    { success: "Entry recorded", failure: "Couldn't record that" },
  );

  async function change(member: boolean) {
    const next = await membership.run(member);
    if (next) setF(next);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = await record.run();
    if (next) { setF(next); setEntry({ ...entry, ee: "", er: "", note: "" }); }
  }

  return (
    <section aria-labelledby="pf-h">
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="pf-h" className="text-sm font-semibold">Provident fund</h2>
          {f?.member && <Badge tone="brand">member since {f.joined_on ? formatDay(f.joined_on) : "—"}</Badge>}
        </div>
        {error ? <ErrorState message={error} onRetry={load} /> : f === null ? <LoadingRows rows={2} /> : (
          <>
            {!f.fund_on && !f.member && (
              <p className="text-sm text-fg-muted">This company doesn&apos;t run a provident fund. Turn it on in Payroll → Set-up → Pay policies.</p>
            )}
            {(f.member || f.employee_minor !== 0 || f.employer_minor !== 0) && <FundSummary f={f} />}
            <Can perm="payroll.salary.update">
              {f.member ? (
                <div className="flex justify-end">
                  <Button size="sm" variant="subtle" disabled={membership.busy} onClick={() => void change(false)}>End membership</Button>
                </div>
              ) : f.fund_on && (
                <div className="flex flex-wrap items-end justify-end gap-2">
                  <Field label="Member from"><Input type="date" required value={joined} onChange={(e) => setJoined(e.target.value)} /></Field>
                  <Button size="sm" disabled={membership.busy || !joined} onClick={() => void change(true)}>Add to the fund</Button>
                </div>
              )}
              {(f.member || f.employee_minor !== 0 || f.employer_minor !== 0) && (
                <form onSubmit={submit} aria-label="Record a fund entry" className="grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
                  <Field label="Entry">
                    <Select value={entry.kind} onChange={(e) => setEntry({ ...entry, kind: e.target.value })}>
                      {Object.entries(KINDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </Select>
                  </Field>
                  <Field label="Note"><Input value={entry.note} maxLength={500} onChange={(e) => setEntry({ ...entry, note: e.target.value })} /></Field>
                  <Field label={entry.kind === "withdrawal" ? "From the employee share (PKR)" : "Employee share (PKR)"}>
                    <Input type="number" step="0.01" min={entry.kind === "adjustment" ? undefined : 0} value={entry.ee} onChange={(e) => setEntry({ ...entry, ee: e.target.value })} />
                  </Field>
                  <Field label={entry.kind === "withdrawal" ? "From the company share (PKR)" : "Company share (PKR)"}>
                    <Input type="number" step="0.01" min={entry.kind === "adjustment" ? undefined : 0} value={entry.er} onChange={(e) => setEntry({ ...entry, er: e.target.value })} />
                  </Field>
                  <div className="flex justify-end sm:col-span-2"><Button type="submit" size="sm" disabled={record.busy}>{record.busy ? "Saving…" : "Record entry"}</Button></div>
                </form>
              )}
            </Can>
          </>
        )}
      </Card>
    </section>
  );
}
