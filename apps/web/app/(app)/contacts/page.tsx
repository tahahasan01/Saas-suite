"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Contact, Tag } from "@business-os/types";
import { api, apiPage } from "@/lib/api";
import { Can } from "@/lib/can";
import { errorText } from "@/lib/useAction";
import { Badge, Button, cx, EmptyState, ErrorState, Input, Select } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { ContactForm, TagChip } from "@/components/contacts/ContactForm";
import { MergeDialog } from "@/components/contacts/MergeDialog";
import { useContactLabels } from "@/components/contacts/labels";

const PAGE = 50;
const MAX_MERGE = 5;

export default function ContactsPage() {
  const router = useRouter();
  const { one, many } = useContactLabels();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"" | "person" | "company">("");
  const [tag, setTag] = useState("");
  const [archived, setArchived] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [rows, setRows] = useState<Contact[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [merging, setMerging] = useState(false);

  const load = useCallback((target = 1) => {
    setError(null);
    setBusy(true);
    const p = new URLSearchParams({ limit: String(PAGE), offset: String((target - 1) * PAGE) });
    if (q.trim()) p.set("q", q.trim());
    if (kind) p.set("kind", kind);
    if (tag) p.set("tag", tag);
    if (archived) p.set("include_archived", "true");
    apiPage<Contact>(`/contacts?${p}`)
      .then((r) => { setRows(r.items); setTotal(r.total); setPage(target); })
      .catch((e) => setError(errorText(e, `Couldn't load your ${many.toLowerCase()}.`)))
      .finally(() => setBusy(false));
  }, [q, kind, tag, archived, many]);

  // Search as you type, a beat after the last key.
  useEffect(() => {
    const timer = setTimeout(() => load(1), 250);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => { api<Tag[]>("/tags").then(setTags).catch(() => setTags([])); }, []);

  const toggle = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < MAX_MERGE ? [...cur, id] : cur));

  const columns: Column<Contact>[] = [
    {
      key: "name", header: "Name", primary: true,
      cell: (c) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-medium">{c.name}</span>
          {c.kind === "company" && <Badge>Company</Badge>}
          {c.archived_at && <Badge tone="warning">Archived</Badge>}
        </span>
      ),
    },
    { key: "phone", header: "Phone", cell: (c) => <span className="tabular-nums">{c.phone || "—"}</span> },
    { key: "email", header: "Email", cell: (c) => <span className="text-fg-muted">{c.email || "—"}</span> },
    { key: "company", header: "Company", cell: (c) => <span className="text-fg-muted">{c.company_name || "—"}</span> },
    {
      key: "tags", header: "Tags", wrap: true,
      cell: (c) => c.tags.length ? <span className="flex flex-wrap gap-1">{c.tags.map((t) => <TagChip key={t.id} tag={t} />)}</span> : <span className="text-fg-subtle">—</span>,
    },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">Everyone you sell to, in one list — shared by the pipeline, the till and invoices.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Can perm="contacts.contact.merge">
            <Button variant="subtle" disabled={picked.length < 2} onClick={() => setMerging(true)}>
              Merge selected{picked.length ? ` (${picked.length})` : ""}
            </Button>
          </Can>
          <Can perm="contacts.contact.create">
            <Button onClick={() => setAdding(true)}>+ New {one.toLowerCase()}</Button>
          </Can>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-72">
          <Input type="search" placeholder="Search name, phone, email or NTN" aria-label={`Search ${many.toLowerCase()}`}
                 value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div role="group" aria-label="Kind" className="inline-flex rounded-lg border border-line p-0.5">
          {([["", "All"], ["person", "People"], ["company", "Companies"]] as const).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
                    className={cx("rounded-md px-3 py-1.5 text-sm pointer-coarse:min-h-11",
                      kind === k ? "bg-brand text-brand-fg" : "text-fg-muted hover:text-fg")}>
              {label}
            </button>
          ))}
        </div>
        {tags.length > 0 && (
          <div className="w-40">
            <Select aria-label="Tag" value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">All tags</option>
              {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
        )}
        <label className="inline-flex items-center gap-1.5 text-sm text-fg-muted pointer-coarse:min-h-11">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          Show archived
        </label>
      </div>

      {error ? <ErrorState message={error} onRetry={() => load(page)} /> : (
        <DataTable
          columns={columns}
          rows={rows ?? []}
          rowKey={(c) => c.id}
          loading={rows === null}
          caption={many}
          onRowClick={(c) => router.push(`/contacts/${c.id}`)}
          rowLabel={(c) => `Open ${c.name}`}
          actionsHeader="Merge"
          actions={(c) => (
            <Can perm="contacts.contact.merge">
              <label className="inline-flex items-center gap-1.5 text-xs text-fg-muted pointer-coarse:min-h-11">
                <input type="checkbox" checked={picked.includes(c.id)} disabled={!!c.merged_into_id}
                       onChange={() => toggle(c.id)} aria-label={`Select ${c.name} to merge`} />
                Select
              </label>
            </Can>
          )}
          pagination={{ page, pageSize: PAGE, total, onPageChange: load, noun: many.toLowerCase(), busy }}
          empty={
            <EmptyState
              title={q || kind || tag ? "Nothing matches" : `No ${many.toLowerCase()} yet`}
              hint={q || kind || tag ? "Try another search or clear the filters." : `Add one here, qualify a lead, or add a ${one.toLowerCase()} at the till.`}
            />
          }
        />
      )}

      <ContactForm open={adding} onClose={() => setAdding(false)}
                   onSaved={(c) => { setAdding(false); router.push(`/contacts/${c.id}`); }} />
      {merging && (
        <MergeDialog ids={picked} onClose={() => setMerging(false)}
                     onMerged={(winner) => { setMerging(false); setPicked([]); router.push(`/contacts/${winner}`); }} />
      )}
    </>
  );
}
