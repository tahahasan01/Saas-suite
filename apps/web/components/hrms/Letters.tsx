"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api, apiUrl } from "@/lib/api";
import { Can } from "@/lib/can";
import { formatDay } from "@/lib/format";
import { useAction } from "@/lib/useAction";
import { Dialog } from "@/components/Dialog";
import { Button, Card, Field, Input, LoadingRows, Select, Textarea } from "@/components/ui";

export type Letter = Schema<"LetterOut">;
type Template = Schema<"LetterTemplateOut">;

export const LETTER_KINDS: Record<string, string> = {
  offer: "Offer", appointment: "Appointment", experience: "Experience", salary: "Salary certificate", noc: "NOC",
  employment: "Employment", relieving: "Relieving", warning: "Warning", other: "Other",
};
export const REQUEST_KINDS: Record<string, string> = {
  experience: "Experience letter", salary: "Salary certificate", noc: "No objection certificate (NOC)",
  employment: "Employment letter", id_card: "ID card", other: "Something else",
};

/** Letters on the profile (wave C, H37): what was issued, and a new one. */
export function LettersCard({ employeeId }: { employeeId: string }) {
  const [rows, setRows] = useState<Letter[] | null>(null);
  const [issuing, setIssuing] = useState(false);
  const load = useCallback(() => {
    api<Letter[]>(`/hrms/employees/${employeeId}/letters`, { notify: false }).then(setRows).catch(() => setRows([]));
  }, [employeeId]);
  useEffect(load, [load]);
  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Letters</h2>
        <Can perm="hrms.letter.manage"><Button size="sm" variant="ghost" onClick={() => setIssuing(true)}>Issue a letter</Button></Can>
      </div>
      {rows === null ? null : rows.length === 0 ? <p className="text-sm text-fg-muted">None issued yet.</p> : (
        <ul className="text-sm" aria-label="Letters issued">
          {rows.map((l) => (
            <li key={l.id} className="flex justify-between gap-2">
              <a href={apiUrl(`/hrms/letters/${l.id}/pdf`)} className="text-brand hover:underline">{l.title}</a>
              <span className="text-xs text-fg-muted">{l.number} · {formatDay(l.issued_at.slice(0, 10))}</span>
            </li>
          ))}
        </ul>
      )}
      {issuing && <IssueLetterDialog employeeId={employeeId} onClose={() => setIssuing(false)} onIssued={load} />}
    </Card>
  );
}

/** Pick a template, see it filled in for this person, edit if needed, issue. */
export function IssueLetterDialog({ employeeId, employeeName, kind, requestId, onClose, onIssued }: {
  employeeId: string; employeeName?: string; kind?: string; requestId?: string; onClose: () => void; onIssued: (l: Letter) => void;
}) {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [issued, setIssued] = useState<Letter | null>(null);
  useEffect(() => {
    api<Template[]>("/hrms/letter-templates", { notify: false }).then((t) => {
      const on = t.filter((x) => x.active);
      setTemplates(on);
      setTemplateId((on.find((x) => x.kind === kind) ?? on[0])?.id ?? "");
    }).catch(() => setTemplates([]));
  }, [kind]);
  useEffect(() => {
    if (!templateId) return;
    api<Schema<"LetterPreview">>(`/hrms/employees/${employeeId}/letters/preview`, { method: "POST", body: JSON.stringify({ template_id: templateId }) })
      .then((p) => { setTitle(p.title); setBody(p.body); }).catch(() => { setTitle(""); setBody(""); });
  }, [employeeId, templateId]);
  const issue = useAction(() => api<Letter>(`/hrms/employees/${employeeId}/letters`, { method: "POST", body: JSON.stringify({
    template_id: templateId, title, body, request_id: requestId ?? null }) }), { success: "Letter issued", failure: "Couldn't issue it" });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={`Issue a letter${employeeName ? ` to ${employeeName}` : ""}`} size="lg">
      {issued ? (
        <div className="space-y-3 text-sm">
          <p role="status">Issued as {issued.number}.</p>
          <div className="flex justify-end gap-2">
            <a href={apiUrl(`/hrms/letters/${issued.id}/pdf`)} className="text-brand hover:underline">Download PDF</a>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : templates === null ? <LoadingRows rows={3} /> : (
        <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const l = await issue.run(); if (l) { setIssued(l); onIssued(l); } }}>
          <Field label="Template">
            <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="Title"><Input value={title} required maxLength={160} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Text (edit for this person if needed)"><Textarea rows={12} required maxLength={20000} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
          <p className="text-xs text-fg-muted">The number is added when you issue it. An issued letter can't be changed.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={issue.busy || !templateId || !body.trim()}>Issue</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
