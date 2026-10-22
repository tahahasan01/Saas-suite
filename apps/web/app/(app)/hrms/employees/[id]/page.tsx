"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  DOCUMENT_KINDS, EMPLOYMENT_TYPES,
  type Department, type Employee, type EmployeeDocument, type EmployeeProfile, type JobTitle,
  type LeaveBalanceV2, type WorkLocation,
} from "@business-os/types";
import { api, apiUrl } from "@/lib/api";
import { Can, useCan } from "@/lib/can";
import { formatDay } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { useConfirm } from "@/components/Confirm";
import { ExpiryBadge } from "@/components/hrms/ExpiryBadge";
import { PayrollDetailsCard } from "@/components/hrms/PayrollDetailsCard";
import { SalaryCard } from "@/components/hrms/SalaryCard";
import { HeldAssetsCard } from "@/components/hrms/HeldAssetsCard";
import { BoardingCard } from "@/components/hrms/BoardingCard";
import { EncashButton } from "@/components/hrms/CompOff";
import { Badge, Button, Card, ErrorState, Field, Input, LoadingRows, Select } from "@/components/ui";

/* One employee: details, their place in the org, kiosk PIN, documents with
   expiry, leave balances and payroll identity (bank, IBAN, NTN, EOBI and
   social security numbers, masked for HR without pay access). */

const TYPE_LABEL: Record<(typeof EMPLOYMENT_TYPES)[number], string> = {
  permanent: "Permanent", contract: "Contract", probation: "On probation", daily_wage: "Daily wage", intern: "Intern",
};
const DOC_LABEL: Record<(typeof DOCUMENT_KINDS)[number], string> = {
  cnic: "CNIC copy", contract: "Contract", certificate: "Certificate", medical: "Medical / health",
  license: "Licence", passport: "Passport", other: "Other",
};

export default function EmployeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [p, setP] = useState<EmployeeProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api<EmployeeProfile>(`/hrms/employees/${id}`).then(setP).catch((e) => setError(errorText(e, "Couldn't load this employee.")));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!p) return <LoadingRows rows={4} label="Loading employee" />;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link href="/hrms" className="text-sm text-brand hover:underline">← Team</Link>
        <h1 className="font-display text-2xl font-bold tracking-tight">{p.name}</h1>
        <span className="text-sm text-fg-muted">{[p.designation, p.department].filter(Boolean).join(" · ") || "No role yet"}</span>
        {p.has_login && <Badge tone="brand">Portal</Badge>}
        {p.documents_expiring > 0 && <Badge tone="warning">{p.documents_expiring} document(s) expiring</Badge>}
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <Details p={p} onSaved={load} />
        <Job p={p} onSaved={load} />
        <Documents employeeId={p.id} onChanged={load} />
        <div className="space-y-5">
          <Balances employeeId={p.id} />
          <Can perm="hrms.employee.update"><KioskPin p={p} onSaved={load} /></Can>
          <Can perm="payroll.salary.read"><SalaryCard employeeId={p.id} /></Can>
          <Can perm="hrms.asset.read"><HeldAssetsCard employeeId={p.id} /></Can>
          <Can perm="hrms.boarding.read"><BoardingCard employeeId={p.id} exitDate={p.exit_date} onChanged={load} /></Can>
          <PayrollDetailsCard employeeId={p.id} />
        </div>
      </div>
    </div>
  );
}

function Details({ p, onSaved }: { p: EmployeeProfile; onSaved: () => void }) {
  const can = useCan();
  const [f, setF] = useState({ name: p.name, email: p.email, phone: p.phone, date_of_birth: p.date_of_birth ?? "" });
  const save = useAction(
    () => api(`/hrms/employees/${p.id}`, { method: "PATCH", body: JSON.stringify({ ...f, date_of_birth: f.date_of_birth || null }) }),
    { success: "Saved", failure: "Couldn't save" },
  );
  const invite = useAction(
    async () => { await api(`/hrms/employees/${p.id}/invite`, { method: "POST" }); return true; },
    { success: `Invite sent to ${p.name}`, failure: "Couldn't send invite" },
  );
  const editable = can("hrms.employee.update");
  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold">Details</h2>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => { e.preventDefault(); if ((await save.run()) !== undefined) onSaved(); }}
      >
        <Field label="Name"><Input value={f.name} required disabled={!editable} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Phone"><Input type="tel" value={f.phone} disabled={!editable} placeholder="03XX-XXXXXXX" onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Date of birth (for birthdays; the year is never shown)"><Input type="date" value={f.date_of_birth} disabled={!editable} onChange={(e) => setF({ ...f, date_of_birth: e.target.value })} /></Field>
        <div className="sm:col-span-2">
          <Field label="Email (for their own login)"><Input type="email" value={f.email} disabled={!editable} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        </div>
        <p className="text-xs text-fg-subtle sm:col-span-2">CNIC {p.cnic || "—"}{p.join_date && ` · joined ${formatDay(p.join_date)}`}</p>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          {editable && <Button type="submit" disabled={save.busy}>{save.busy ? "Saving…" : "Save details"}</Button>}
          {!p.has_login && (
            <Can perm="hrms.employee.invite">
              <Button type="button" variant="subtle" disabled={invite.busy || !p.email}
                      title={p.email ? undefined : "Add an email first"}
                      onClick={async () => { if (await invite.run()) onSaved(); }}>
                {invite.busy ? "Sending…" : "Enable login"}
              </Button>
            </Can>
          )}
        </div>
      </form>
    </Card>
  );
}

function Job({ p, onSaved }: { p: EmployeeProfile; onSaved: () => void }) {
  const can = useCan();
  const [depts, setDepts] = useState<Department[]>([]);
  const [titles, setTitles] = useState<JobTitle[]>([]);
  const [locs, setLocs] = useState<WorkLocation[]>([]);
  const [staff, setStaff] = useState<Employee[]>([]);
  const [f, setF] = useState({
    department_id: p.department_id ?? "", job_title_id: p.job_title_id ?? "", location_id: p.location_id ?? "",
    manager_id: p.manager_id ?? "", employment_type: p.employment_type, code: p.code ?? "", probation_end: p.probation_end ?? "",
  });
  useEffect(() => {
    api<Department[]>("/hrms/departments").then(setDepts).catch(() => setDepts([]));
    api<JobTitle[]>("/hrms/job-titles").then(setTitles).catch(() => setTitles([]));
    api<WorkLocation[]>("/hrms/locations").then(setLocs).catch(() => setLocs([]));
    api<Employee[]>("/hrms/employees").then(setStaff).catch(() => setStaff([]));
  }, []);
  // Changing someone's manager decides who approves their requests, so it is
  // the org key, not plain employee editing (the server checks too).
  const canManager = can("hrms.org.manage");
  const save = useAction(
    () => {
      const body: Record<string, unknown> = {
        department_id: f.department_id || null, job_title_id: f.job_title_id || null, location_id: f.location_id || null,
        employment_type: f.employment_type, code: f.code || null, probation_end: f.probation_end || null,
      };
      if (canManager) body.manager_id = f.manager_id || null;
      return api(`/hrms/employees/${p.id}/job`, { method: "PATCH", body: JSON.stringify(body) });
    },
    { success: "Job saved", failure: "Couldn't save the job details" },
  );
  const editable = can("hrms.employee.update");
  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Job</h2>
        <Can perm="hrms.org.manage"><Link href="/hrms/employees/setup" className="text-xs text-brand hover:underline">Departments and titles</Link></Can>
      </div>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); if ((await save.run()) !== undefined) onSaved(); }}>
        <Field label="Department">
          <Select value={f.department_id} disabled={!editable} onChange={(e) => setF({ ...f, department_id: e.target.value })}>
            <option value="">—</option>
            {depts.filter((d) => d.active || d.id === f.department_id).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        <Field label="Job title">
          <Select value={f.job_title_id} disabled={!editable} onChange={(e) => setF({ ...f, job_title_id: e.target.value })}>
            <option value="">—</option>
            {titles.filter((t) => t.active || t.id === f.job_title_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Reports to">
          <Select value={f.manager_id} disabled={!editable || !canManager} onChange={(e) => setF({ ...f, manager_id: e.target.value })}>
            <option value="">No manager</option>
            {staff.filter((s) => s.id !== p.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Works at">
          <Select value={f.location_id} disabled={!editable} onChange={(e) => setF({ ...f, location_id: e.target.value })}>
            <option value="">No fixed site</option>
            {locs.filter((l) => l.active || l.id === f.location_id).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </Field>
        <Field label="Employment">
          <Select value={f.employment_type} disabled={!editable} onChange={(e) => setF({ ...f, employment_type: e.target.value as typeof f.employment_type })}>
            {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </Select>
        </Field>
        <Field label="Employee code"><Input value={f.code} disabled={!editable} maxLength={40} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
        {f.employment_type === "probation" && (
          <Field label="Probation ends"><Input type="date" value={f.probation_end} disabled={!editable} onChange={(e) => setF({ ...f, probation_end: e.target.value })} /></Field>
        )}
        {editable && (
          <div className="sm:col-span-2">
            <Button type="submit" disabled={save.busy}>{save.busy ? "Saving…" : "Save job"}</Button>
          </div>
        )}
      </form>
    </Card>
  );
}

function KioskPin({ p, onSaved }: { p: EmployeeProfile; onSaved: () => void }) {
  const [pin, setPin] = useState("");
  const save = useAction(
    async () => { await api(`/hrms/employees/${p.id}/kiosk-pin`, { method: "PUT", body: JSON.stringify({ pin }) }); return true; },
    { success: "Kiosk PIN set", failure: "Couldn't set the PIN" },
  );
  return (
    <Card className="space-y-2">
      <h2 className="text-sm font-semibold">Kiosk PIN</h2>
      <p className="text-xs text-fg-muted">
        {p.has_kiosk_pin ? "A PIN is set. Setting a new one replaces it." : "No PIN yet. They need one to clock in on a shared kiosk."}
      </p>
      <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); if (await save.run()) { setPin(""); onSaved(); } }}>
        <Field label="New PIN (4–6 digits)">
          <Input value={pin} inputMode="numeric" autoComplete="off" pattern="\d{4,6}" maxLength={6} className="w-32"
                 onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Button type="submit" variant="subtle" disabled={save.busy || pin.length < 4}>{save.busy ? "Saving…" : "Set PIN"}</Button>
      </form>
    </Card>
  );
}

function Balances({ employeeId }: { employeeId: string }) {
  const [rows, setRows] = useState<LeaveBalanceV2[] | null>(null);
  const load = useCallback(() => {
    api<LeaveBalanceV2[]>(`/hrms/leave/balances?employee_id=${employeeId}`).then(setRows).catch(() => setRows([]));
  }, [employeeId]);
  useEffect(load, [load]);
  if (!rows?.length) return null;
  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Leave left</h2>
        <EncashButton employeeId={employeeId} balances={rows} onDone={load} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {rows.map((b) => (
          <div key={b.leave_type} className="rounded-lg border border-line px-2 py-1.5 text-center">
            <p className="text-sm font-semibold tabular-nums">{b.remaining}<span className="text-fg-subtle">/{b.quota}</span></p>
            <p className="truncate text-[10px] text-fg-subtle">{b.name}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Documents({ employeeId, onChanged }: { employeeId: string; onChanged: () => void }) {
  const [rows, setRows] = useState<EmployeeDocument[] | null>(null);
  const [f, setF] = useState({ kind: "cnic" as (typeof DOCUMENT_KINDS)[number], title: "", number: "", expires_on: "" });
  // The scan (PDF or photo, up to 10 MB): uploaded first, then claimed by the document.
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const confirm = useConfirm();
  const load = useCallback(() => {
    api<EmployeeDocument[]>(`/hrms/employees/${employeeId}/documents`).then(setRows).catch(() => setRows([]));
  }, [employeeId]);
  useEffect(load, [load]);
  const add = useAction(
    async () => {
      const file_id = file
        ? (await api<{ id: string }>(`/files?name=${encodeURIComponent(file.name)}`, { method: "POST", body: file })).id
        : null;
      return api(`/hrms/employees/${employeeId}/documents`, {
        method: "POST",
        body: JSON.stringify({ ...f, title: f.title || DOC_LABEL[f.kind], expires_on: f.expires_on || null, file_id }),
      });
    },
    { success: "Document added", failure: "Couldn't add the document" },
  );
  const del = useAction(
    async (d: EmployeeDocument) => { await api(`/hrms/documents/${d.id}`, { method: "DELETE" }); return true; },
    { success: "Document removed", failure: "Couldn't remove it" },
  );
  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Documents</h2>
        <Link href="/hrms/employees/documents" className="text-xs text-brand hover:underline">Expiring soon</Link>
      </div>
      {rows === null ? <LoadingRows rows={2} label="Loading documents" /> : rows.length === 0 ? (
        <p className="text-xs text-fg-subtle">No documents recorded.</p>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {rows.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1 basis-40">
                {d.title}{d.number && <span className="text-fg-subtle"> · {d.number}</span>}
                <span className="block text-xs text-fg-subtle">{DOC_LABEL[d.kind]}{d.expires_on && ` · expires ${formatDay(d.expires_on)}`}</span>
              </span>
              {d.file_id && (
                <a href={apiUrl(`/files/${d.file_id}`)} target="_blank" rel="noopener noreferrer"
                   className="text-xs text-brand hover:underline">Open scan<span className="sr-only"> of {d.title}</span></a>
              )}
              <ExpiryBadge days={d.days_left} />
              <Can perm="hrms.document.manage">
                <Button size="sm" variant="ghost" aria-label={`Remove ${d.title}`} onClick={() => void confirm({
                  title: `Remove ${d.title}?`, confirmLabel: "Remove", tone: "danger", busyLabel: "Removing…",
                  run: async () => { const ok = await del.run(d); load(); onChanged(); return ok; },
                })}>Remove</Button>
              </Can>
            </li>
          ))}
        </ul>
      )}
      <Can perm="hrms.document.manage">
        <form className="grid gap-2 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault();
          if ((await add.run()) !== undefined) {
            setF({ kind: "cnic", title: "", number: "", expires_on: "" });
            setFile(null);
            setFileKey((k) => k + 1);   // clears the file input
            load(); onChanged();
          }
        }}>
          <Field label="Kind">
            <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as typeof f.kind })}>
              {DOCUMENT_KINDS.map((k) => <option key={k} value={k}>{DOC_LABEL[k]}</option>)}
            </Select>
          </Field>
          <Field label="Title"><Input value={f.title} placeholder={DOC_LABEL[f.kind]} maxLength={160} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Number"><Input value={f.number} maxLength={80} onChange={(e) => setF({ ...f, number: e.target.value })} /></Field>
          <Field label="Expires on"><Input type="date" value={f.expires_on} onChange={(e) => setF({ ...f, expires_on: e.target.value })} /></Field>
          <Field label="Scan (PDF or photo, optional)">
            <Input key={fileKey} type="file" accept="application/pdf,image/png,image/jpeg,image/webp"
                   onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" variant="subtle" disabled={add.busy}>{add.busy ? "Adding…" : "Add document"}</Button>
          </div>
        </form>
      </Can>
    </Card>
  );
}
