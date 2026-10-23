"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { formatDateTime } from "@/lib/format";
import { fileUrl, uploadFile } from "@/lib/org";
import { errorText, useAction } from "@/lib/useAction";
import { Dialog } from "@/components/Dialog";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingRows, Select, Textarea } from "@/components/ui";

type Notice = Schema<"NoticeOut">;
type Ack = Schema<"NoticeAck">;
type Named = { id: string; name: string };

/** The notice board (wave A, H18/H19): post notices and policies for
 *  everyone, a department or a location; see who has acknowledged a policy. */
export default function NoticesPage() {
  const [rows, setRows] = useState<Notice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [who, setWho] = useState<Notice | null>(null);

  const load = useCallback(() => {
    setError(null);
    api<Notice[]>(`/hrms/notices${showArchived ? "?archived=true" : ""}`).then(setRows).catch((e) => setError(errorText(e)));
  }, [showArchived]);
  useEffect(load, [load]);

  const patch = useAction(
    (n: Notice, body: object) => api(`/hrms/notices/${n.id}`, { method: "PATCH", body: JSON.stringify(body) }),
    { failure: "Couldn't change it" },
  );
  async function change(n: Notice, body: object) {
    if ((await patch.run(n, body)) !== undefined) load();
  }
  const remind = useAction(
    (n: Notice) => api<{ reminded: number }>(`/hrms/notices/${n.id}/remind`, { method: "POST" }),
    { success: (r) => `Reminded ${(r as { reminded: number }).reminded} person(s)`, failure: "Couldn't send reminders" },
  );

  return (
    <div className="space-y-4">
      <Can perm="hrms.notice.manage"><NewNotice onPosted={load} /></Can>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
      </label>
      {error ? <ErrorState message={error} onRetry={load} /> : rows === null ? <LoadingRows rows={3} /> : rows.length === 0 ? (
        <EmptyState title="No notices yet" hint="Post holidays, rules and policies here. Staff see them in their own space." />
      ) : (
        <ul className="space-y-3" aria-label="Notices">
          {rows.map((n) => (
            <li key={n.id}>
              <Card className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold">{n.title}</h3>
                    <p className="text-xs text-fg-muted">{formatDateTime(n.published_at)} · {n.audience_label}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {n.pinned && <Badge tone="brand">pinned</Badge>}
                    {n.archived_at && <Badge>archived</Badge>}
                    {n.requires_ack && (
                      <button type="button" onClick={() => setWho(n)} className="rounded-md hover:underline"
                              aria-label={`Who acknowledged ${n.title}`}>
                        <Badge tone={n.acknowledged >= n.audience_size ? "success" : "warning"}>
                          {n.acknowledged} of {n.audience_size} acknowledged
                        </Badge>
                      </button>
                    )}
                  </div>
                </div>
                {n.body && <p className="whitespace-pre-line text-sm">{n.body}</p>}
                {n.file_id && <a href={fileUrl(n.file_id)} className="text-sm text-brand hover:underline">Open the attachment</a>}
                {n.requires_ack && (n.reminders_sent ?? 0) > 0 && (
                  <p className="text-xs text-fg-muted">Reminded {n.reminders_sent} time(s), last {formatDateTime(n.last_reminded_at!)}. Weekly reminders stop after 4.</p>
                )}
                <Can perm="hrms.notice.manage">
                  <div className="flex justify-end gap-2">
                    {n.requires_ack && !n.archived_at && n.acknowledged < n.audience_size && (
                      <Button size="sm" variant="subtle" disabled={remind.busy} aria-label={`Remind about ${n.title}`}
                              onClick={async () => { if ((await remind.run(n)) !== undefined) load(); }}>Remind</Button>
                    )}
                    <Button size="sm" variant="ghost" disabled={patch.busy} onClick={() => void change(n, { pinned: !n.pinned })}>
                      {n.pinned ? "Unpin" : "Pin"}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={patch.busy} onClick={() => void change(n, { archived: !n.archived_at })}>
                      {n.archived_at ? "Restore" : "Archive"}
                    </Button>
                  </div>
                </Can>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {who && <WhoAcknowledged notice={who} onClose={() => setWho(null)} />}
    </div>
  );
}

function NewNotice({ onPosted }: { onPosted: () => void }) {
  const blank = { title: "", body: "", audience: "all", department_id: "", location_id: "", requires_ack: false, pinned: false };
  const [f, setF] = useState(blank);
  const [file, setFile] = useState<File | null>(null);
  const [depts, setDepts] = useState<Named[]>([]);
  const [locs, setLocs] = useState<Named[]>([]);
  useEffect(() => {
    api<Named[]>("/hrms/departments", { notify: false }).then(setDepts).catch(() => setDepts([]));
    api<Named[]>("/hrms/locations", { notify: false }).then(setLocs).catch(() => setLocs([]));
  }, []);
  const post = useAction(
    async () => {
      const file_id = file ? (await uploadFile(file)).id : null;
      return api("/hrms/notices", { method: "POST", body: JSON.stringify({
        title: f.title, body: f.body, audience: f.audience, requires_ack: f.requires_ack, pinned: f.pinned, file_id,
        department_id: f.audience === "department" ? f.department_id || null : null,
        location_id: f.audience === "location" ? f.location_id || null : null,
      }) });
    },
    { success: "Posted. Everyone it's for has been told.", failure: "Couldn't post it" },
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((await post.run()) !== undefined) { setF(blank); setFile(null); onPosted(); }
  }
  return (
    <Card>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" aria-label="Post a notice">
        <Field label="Title"><Input value={f.title} required maxLength={160} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="For">
          <Select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>
            <option value="all">Everyone</option>
            <option value="department" disabled={depts.length === 0}>A department</option>
            <option value="location" disabled={locs.length === 0}>A location</option>
          </Select>
        </Field>
        {f.audience === "department" && (
          <Field label="Department">
            <Select value={f.department_id} required onChange={(e) => setF({ ...f, department_id: e.target.value })}>
              <option value="">Pick one…</option>
              {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
        )}
        {f.audience === "location" && (
          <Field label="Location">
            <Select value={f.location_id} required onChange={(e) => setF({ ...f, location_id: e.target.value })}>
              <option value="">Pick one…</option>
              {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
        )}
        <div className="sm:col-span-2">
          <Field label="Message"><Textarea rows={4} maxLength={10000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        </div>
        <Field label="Attachment (optional)">
          <Input type="file" accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        <div className="flex flex-col justify-end gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={f.requires_ack} onChange={(e) => setF({ ...f, requires_ack: e.target.checked })} />
            Staff must read and acknowledge it (a policy)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} /> Pin to the top
          </label>
        </div>
        <div className="flex justify-end sm:col-span-2"><Button type="submit" disabled={post.busy}>{post.busy ? "Posting…" : "Post notice"}</Button></div>
      </form>
    </Card>
  );
}

function WhoAcknowledged({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const [rows, setRows] = useState<Ack[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Ack[]>(`/hrms/notices/${notice.id}/acknowledgements`).then(setRows).catch((e) => setError(errorText(e)));
  }, [notice.id]);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={`Who acknowledged “${notice.title}”`}>
      {error ? <ErrorState message={error} /> : rows === null ? <LoadingRows rows={3} /> : (
        <ul className="max-h-96 divide-y divide-line overflow-y-auto text-sm" aria-label="Acknowledgements">
          {rows.map((a) => (
            <li key={a.employee_id} className="flex justify-between gap-2 py-2">
              <span>{a.name}</span>
              {a.acknowledged_at
                ? <span className="text-xs text-success">{formatDateTime(a.acknowledged_at)}</span>
                : <Badge tone="warning">not yet</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
