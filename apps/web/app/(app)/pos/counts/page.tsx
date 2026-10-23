"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { formatDay } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { useConfirm } from "@/components/Confirm";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingRows, Select } from "@/components/ui";

type Count = Schema<"CountOut">;
type Branch = { id: string; name: string };
type Category = { id: string; name: string };

/* Stock counts (wave B, 0093): open a count for a branch (and maybe one
   category), enter what is on the shelf, then apply. Each line remembers the
   system stock when it was counted, so sales made meanwhile still count. */
export default function CountsPage() {
  const [rows, setRows] = useState<Count[] | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ branch_id: "", category_id: "" });
  const load = useCallback(() => {
    setError(null);
    api<Count[]>("/pos/counts").then(setRows).catch((e) => setError(errorText(e, "Couldn't load counts.")));
  }, []);
  useEffect(() => {
    load();
    api<Branch[]>("/org/branches").then(setBranches).catch(() => setBranches([]));
    api<Category[]>("/pos/categories").then(setCategories).catch(() => setCategories([]));
  }, [load]);
  const start = useAction(
    () => api("/pos/counts", { method: "POST", body: JSON.stringify({ branch_id: f.branch_id || null, category_id: f.category_id || null }) }),
    { success: "Count started", failure: "Couldn't start the count" },
  );

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!rows) return <LoadingRows rows={4} label="Loading counts" />;
  const open = rows.filter((c) => c.status === "open");
  const done = rows.filter((c) => c.status !== "open");

  return (
    <div className="space-y-5">
      <Can perm="products.stock.adjust">
        <Card>
          <form aria-label="Start a count" className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
            e.preventDefault();
            if ((await start.run()) !== undefined) load();
          }}>
            {branches.length > 1 && (
              <Field label="Where">
                <Select value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
                  {branches.map((b, i) => <option key={b.id} value={i === 0 ? "" : b.id}>{b.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label="What">
              <Select value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
                <option value="">Everything</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Button type="submit" disabled={start.busy}>{start.busy ? "Starting…" : "Start a count"}</Button>
          </form>
        </Card>
      </Can>
      {open.length === 0 && <EmptyState title="No count in progress" hint="Start one to check what's really on the shelf." />}
      {open.map((c) => <OpenCount key={c.id} count={c} onChanged={load} />)}
      {done.length > 0 && (
        <section aria-label="Past counts" className="space-y-2">
          <h3 className="text-sm font-semibold">Past counts</h3>
          <ul className="divide-y divide-line rounded-lg border border-line text-sm">
            {done.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span>{c.branch_name}{c.category_name ? ` · ${c.category_name}` : ""}</span>
                <Badge tone={c.status === "applied" ? "success" : "neutral"}>{c.status === "applied" ? "Applied" : "Cancelled"}</Badge>
                <span className="text-fg-muted">{formatDay(c.applied_at ?? c.started_at)} · {c.lines.filter((l) => l.difference !== 0).length} corrected</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function OpenCount({ count, onChanged }: { count: Count; onChanged: () => void }) {
  const confirm = useConfirm();
  const [qty, setQty] = useState<Record<string, string>>({});
  const enter = useAction(
    (product_id: string) => api(`/pos/counts/${count.id}/lines`, { method: "PUT",
      body: JSON.stringify({ product_id, counted_qty: Number(qty[product_id] || 0) }) }),
    { failure: "Couldn't save that count" },
  );
  const close = useAction(
    (what: "apply" | "cancel") => api(`/pos/counts/${count.id}/${what}`, { method: "POST" }),
    { success: "Done", failure: "Couldn't do that" },
  );
  const off = count.lines.filter((l) => l.difference !== 0);

  return (
    <section aria-label={`Count at ${count.branch_name}`}>
      <Card className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">Count at {count.branch_name}{count.category_name ? ` · ${count.category_name}` : ""}</h3>
          <span className="text-fg-muted">{count.lines.length} counted · {count.to_count.length} to go</span>
          <Can perm="products.stock.adjust">
            <span className="ms-auto flex gap-2">
              <Button size="sm" variant="ghost" disabled={close.busy} onClick={async () => { if ((await close.run("cancel")) !== undefined) onChanged(); }}>Cancel count</Button>
              <Button size="sm" disabled={close.busy || count.lines.length === 0} onClick={async () => {
                if (!(await confirm({ title: "Apply this count?", description: `${off.length} product(s) will be corrected at ${count.branch_name}.`, confirmLabel: "Apply" }))) return;
                if ((await close.run("apply")) !== undefined) onChanged();
              }}>Apply count</Button>
            </span>
          </Can>
        </div>

        {count.to_count.length > 0 && (
          <ul aria-label="To count" className="divide-y divide-line rounded-lg border border-line">
            {count.to_count.slice(0, 200).map((p) => (
              <li key={p.product_id} className="flex items-end gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 self-center">{p.product_name}</span>
                <Field label={`Counted (${p.unit})`}>
                  <Input type="number" inputMode="decimal" min={0} step="any" className="w-28" value={qty[p.product_id] ?? ""}
                         aria-label={`Counted ${p.product_name}`}
                         onChange={(e) => setQty({ ...qty, [p.product_id]: e.target.value })} />
                </Field>
                <Button size="sm" variant="subtle" disabled={enter.busy || qty[p.product_id] === undefined || qty[p.product_id] === ""}
                        aria-label={`Save count of ${p.product_name}`}
                        onClick={async () => { if ((await enter.run(p.product_id)) !== undefined) onChanged(); }}>Save</Button>
              </li>
            ))}
          </ul>
        )}

        {count.lines.length > 0 && (
          <ul aria-label="Counted" className="divide-y divide-line rounded-lg border border-line">
            {count.lines.map((l) => (
              <li key={l.product_id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">{l.product_name}</span>
                <span className="tabular-nums text-fg-muted">system {l.system_qty} · counted {l.counted_qty}</span>
                <span className={`tabular-nums font-medium ${l.difference < 0 ? "text-danger" : l.difference > 0 ? "text-success" : "text-fg-muted"}`}>
                  {l.difference > 0 ? "+" : ""}{l.difference}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
