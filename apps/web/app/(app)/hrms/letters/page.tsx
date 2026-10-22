"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { formatDay } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { Dialog } from "@/components/Dialog";
import { Tabs } from "@/components/Tabs";
import { IssueLetterDialog, LETTER_KINDS, REQUEST_KINDS } from "@/components/hrms/Letters";
import { Badge, Button, EmptyState, ErrorState, Field, Input, LoadingRows, Select, Textarea } from "@/components/ui";

type Request = Schema<"LetterRequestOut">;
type Template = Schema<"LetterTemplateOut">;

/** Letters (wave C, H17/H37): staff requests to answer, and the templates. */
export default function LettersPage() {
  const [tab, setTab] = useState("requests");
  return (
    <Tabs label="Show" value={tab} onChange={setTab} items={[{ id: "requests", label: "Requests" }, { id: "templates", label: "Templates" }]}>
      <div className="pt-3">{tab === "requests" ? <Requests /> : <Templates />}</div>
    </Tabs>
  );
}

function Requests() {
  const [rows, setRows] = useState<Request[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("pending");
  const [issuing, setIssuing] = useState<Request | null>(null);
  const [declining, setDeclining] = useState<Request | null>(null);
  const [done, setDone] = useState<Request | null>(null);
  const load = useCallback(() => {
    setError(null);
    api<Request[]>(`/hrms/letter-requests${status ? `?status=${status}` : ""}`).then(setRows).catch((e) => setError(errorText(e)));
  }, [status]);
  useEffect(load, [load]);
  return (
    <div className="space-y-3">
      <div className="w-44">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="pending">Waiting</option><option value="issued">Issued</option><option value="declined">Declined</option><option value="">All</option>
        </Select>
      </div>
      {error ? <ErrorState message={error} onRetry={load} /> : rows === null ? <LoadingRows rows={2} /> : rows.length === 0 ? (
        <EmptyState title="No requests here" hint="Staff ask for letters from My space > Letters." />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface text-sm" aria-label="Letter requests">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <span><span className="font-medium">{r.employee_name}</span>
                <span className="block text-xs text-fg-muted">{REQUEST_KINDS[r.kind]}{r.purpose ? ` · ${r.purpose}` : ""} · {formatDay(r.created_at.slice(0, 10))}</span></span>
              {r.status === "pending" ? (
                <Can perm="hrms.letter.manage">
                  <span className="flex gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setDeclining(r)}>Decline</Button>
                    {r.kind !== "id_card" && <Button size="sm" onClick={() => setIssuing(r)} aria-label={`Issue letter for ${r.employee_name}`}>Issue</Button>}
                    <Button size="sm" variant={r.kind === "id_card" ? "primary" : "subtle"} onClick={() => setDone(r)}>Mark done</Button>
                  </span>
                </Can>
              ) : <Badge tone={r.status === "issued" ? "success" : "neutral"}>{r.status}</Badge>}
            </li>
          ))}
        </ul>
      )}
      {issuing && <IssueLetterDialog employeeId={issuing.employee_id} employeeName={issuing.employee_name} kind={issuing.kind}
                                     requestId={issuing.id} onClose={() => { setIssuing(null); load(); }} onIssued={() => {}} />}
      {declining && <AnswerDialog r={declining} to="decline" onClose={() => setDeclining(null)} onDone={() => { setDeclining(null); load(); }} />}
      {done && <AnswerDialog r={done} to="done" onClose={() => setDone(null)} onDone={() => { setDone(null); load(); }} />}
    </div>
  );
}

function AnswerDialog({ r, to, onClose, onDone }: { r: Request; to: "decline" | "done"; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState(to === "done" ? "Ready to collect from the office" : "");
  const go = useAction(() => api(`/hrms/letter-requests/${r.id}/${to}`, { method: "POST", body: JSON.stringify({ note }) }),
                       { success: "Answered", failure: "Couldn't save it" });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={to === "done" ? `Done for ${r.employee_name}` : `Decline for ${r.employee_name}`}>
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if ((await go.run()) !== undefined) onDone(); }}>
        <Field label="Note to them"><Input value={note} required={to === "decline"} maxLength={500} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Back</Button>
          <Button type="submit" disabled={go.busy || (to === "decline" && !note.trim())}>Send</Button>
        </div>
      </form>
    </Dialog>
  );
}

function Templates() {
  const [rows, setRows] = useState<Template[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Template | "new" | null>(null);
  const load = useCallback(() => {
    setError(null);
    api<Template[]>("/hrms/letter-templates").then(setRows).catch((e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);
  return (
    <div className="space-y-3">
      <Can perm="hrms.letter.manage"><Button variant="subtle" onClick={() => setEditing("new")}>New template</Button></Can>
      {error ? <ErrorState message={error} onRetry={load} /> : rows === null ? <LoadingRows rows={2} /> : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface text-sm" aria-label="Letter templates">
          {rows.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <span><span className="font-medium">{t.name}</span><span className="block text-xs text-fg-muted">{LETTER_KINDS[t.kind]}</span></span>
              <span className="flex items-center gap-2">
                {!t.active && <Badge>off</Badge>}
                <Can perm="hrms.letter.manage"><Button size="sm" variant="ghost" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`}>Edit</Button></Can>
              </span>
            </li>
          ))}
        </ul>
      )}
      {editing && <TemplateDialog t={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}

function TemplateDialog({ t, onClose, onSaved }: { t: Template | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ kind: t?.kind ?? "other", name: t?.name ?? "", title: t?.title ?? "", body: t?.body ?? "", active: t?.active ?? true });
  const [fields, setFields] = useState<Record<string, string>>({});
  useEffect(() => { api<Record<string, string>>("/hrms/letter-placeholders", { notify: false }).then(setFields).catch(() => setFields({})); }, []);
  const save = useAction(() => t
    ? api(`/hrms/letter-templates/${t.id}`, { method: "PATCH", body: JSON.stringify({ name: f.name, title: f.title, body: f.body, active: f.active }) })
    : api("/hrms/letter-templates", { method: "POST", body: JSON.stringify({ kind: f.kind, name: f.name, title: f.title, body: f.body }) }),
  { success: "Template saved", failure: "Couldn't save it" });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={t ? `Edit ${t.name}` : "New letter template"} size="lg">
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if ((await save.run()) !== undefined) { onSaved(); onClose(); } }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><Input value={f.name} required maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          {t ? (
            <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> In use</label>
          ) : (
            <Field label="Kind">
              <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Template["kind"] })}>
                {Object.entries(LETTER_KINDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
          )}
        </div>
        <Field label="Title on the letter"><Input value={f.title} required maxLength={160} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Text"><Textarea rows={12} required maxLength={20000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <details className="text-xs text-fg-muted">
          <summary className="cursor-pointer">Fields you can use</summary>
          <ul className="mt-1 grid gap-0.5 sm:grid-cols-2">
            {Object.entries(fields).map(([k, label]) => <li key={k}><code>{`{{${k}}}`}</code> {label}</li>)}
          </ul>
        </details>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.busy || !f.name.trim() || !f.body.trim()}>Save</Button>
        </div>
      </form>
    </Dialog>
  );
}
