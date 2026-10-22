"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { formatDay } from "@/lib/format";
import { useAction } from "@/lib/useAction";
import { Dialog } from "@/components/Dialog";
import { BoardingDialog, EXIT_REASONS } from "@/components/hrms/Boarding";
import { Button, Card, Field, Input, Select } from "@/components/ui";

type Boarding = Schema<"BoardingOut">;
type Template = Schema<"BoardingTemplateOut">;

/** Joining and leaving on the profile (wave C, H23/H24): the open
 *  checklists, the exit date, and starting either one. */
export function BoardingCard({ employeeId, exitDate, onChanged }: { employeeId: string; exitDate?: string | null; onChanged: () => void }) {
  const [rows, setRows] = useState<Boarding[] | null>(null);
  const [starting, setStarting] = useState<Boarding["kind"] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const load = useCallback(() => {
    api<Boarding[]>("/hrms/boardings?status=open", { notify: false })
      .then((all) => setRows(all.filter((b) => b.employee_id === employeeId))).catch(() => setRows([]));
  }, [employeeId]);
  useEffect(load, [load]);
  const has = (kind: string) => rows?.some((b) => b.kind === kind);

  return (
    <Card className="space-y-2">
      <h2 className="text-sm font-semibold">Joining and leaving</h2>
      {exitDate && (
        <p className="text-sm">
          Leaving on <span className="font-medium">{formatDay(exitDate)}</span>.{" "}
          <Can perm="payroll.settlement.read"><Link href="/hrms/payroll/settlements" className="text-brand hover:underline">Final settlement →</Link></Can>
        </p>
      )}
      {rows && rows.length > 0 && (
        <ul className="text-sm" aria-label="Open checklists">
          {rows.map((b) => (
            <li key={b.id}>
              <button type="button" className="text-brand hover:underline" onClick={() => setOpenId(b.id)}>
                {b.kind === "onboarding" ? "Joining" : "Leaving"} checklist
              </button> <span className="text-fg-muted">· {b.done} of {b.total} done</span>
            </li>
          ))}
        </ul>
      )}
      <Can perm="hrms.boarding.manage">
        <div className="flex flex-wrap gap-2">
          {rows && !has("onboarding") && <Button size="sm" variant="subtle" onClick={() => setStarting("onboarding")}>Start joining checklist</Button>}
          {rows && !has("offboarding") && <Button size="sm" variant="ghost" onClick={() => setStarting("offboarding")}>Record leaving</Button>}
        </div>
      </Can>
      {starting && <StartDialog kind={starting} employeeId={employeeId} onClose={() => setStarting(null)}
                                onStarted={(id) => { load(); onChanged(); setOpenId(id); }} />}
      {openId && <BoardingDialog id={openId} onClose={() => { setOpenId(null); load(); onChanged(); }} />}
    </Card>
  );
}

function StartDialog({ kind, employeeId, onClose, onStarted }: {
  kind: Boarding["kind"]; employeeId: string; onClose: () => void; onStarted: (id: string) => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [f, setF] = useState({ template_id: "", reason: "resigned", notice_date: "", last_working_day: "" });
  useEffect(() => {
    api<Template[]>(`/hrms/boarding-templates?kind=${kind}`, { notify: false })
      .then((t) => setTemplates(t.filter((x) => x.active))).catch(() => setTemplates([]));
  }, [kind]);
  const start = useAction(
    () => api<Boarding>(`/hrms/employees/${employeeId}/${kind}`, { method: "POST", body: JSON.stringify(
      kind === "onboarding"
        ? { template_id: f.template_id || null }
        : { template_id: f.template_id || null, reason: f.reason, notice_date: f.notice_date || null, last_working_day: f.last_working_day },
    ) }),
    { success: kind === "onboarding" ? "Checklist started" : "Leaving recorded", failure: "Couldn't start it" },
  );
  const title = kind === "onboarding" ? "Start joining checklist" : "Record leaving";
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={title}>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        const b = await start.run();
        if (b) { onClose(); onStarted(b.id); }
      }}>
        <Field label="Checklist">
          <Select value={f.template_id} onChange={(e) => setF({ ...f, template_id: e.target.value })}>
            <option value="">Starter list</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        {kind === "offboarding" && (
          <>
            <Field label="Reason">
              <Select value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}>
                {Object.entries(EXIT_REASONS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Notice given on"><Input type="date" value={f.notice_date} onChange={(e) => setF({ ...f, notice_date: e.target.value })} /></Field>
            <Field label="Last working day"><Input type="date" required value={f.last_working_day} min={f.notice_date || undefined}
                                                   onChange={(e) => setF({ ...f, last_working_day: e.target.value })} /></Field>
            <p className="text-xs text-fg-muted">Payroll pays them up to the last working day.</p>
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={start.busy || (kind === "offboarding" && !f.last_working_day)}>{start.busy ? "Starting…" : "Start"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
