"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Product } from "@business-os/types";
import { api, apiPage } from "@/lib/api";
import { money } from "@/lib/format";
import { useSession } from "@/lib/session";
import { errorText, useAction } from "@/lib/useAction";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input } from "@/components/ui";
import { Dialog } from "@/components/Dialog";
import { useConfirm } from "@/components/Confirm";
import { DataTable, type Column } from "@/components/DataTable";
import { ImportCsv } from "@/components/ImportCsv";
import { blurOnWheel } from "@/components/pos/labels";

const blank = { name: "", price: "", stock: "", barcode: "", low: "", hs_code: "", tax_rate: "" };

/** Minor units in the API, rupees in the input — convert at the boundary only. */
const toMinor = (rupees: string) => Math.round(Number(rupees || 0) * 100);

/** Rows per page: a screenful or two, so Edit/Archive stay a short scroll away. */
const PAGE = 50;

/** Shared by every number field here: the wheel doesn't change amounts. */
const num = { type: "number", inputMode: "decimal", min: 0, onWheel: blurOnWheel } as const;

export default function ProductsPage() {
  const { t } = useSession();
  const [items, setItems] = useState<Product[] | null>(null); // null = loading
  const [total, setTotal] = useState(0); // how many match, loaded or not
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<Product | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [filter, setFilter] = useState("");
  // What's been asked of the server: the search box, settled.
  const [query, setQuery] = useState("");
  const confirm = useConfirm();
  const word = t("products");
  const one = t("product");

  useEffect(() => {
    const id = setTimeout(() => setQuery(filter.trim()), 250);
    return () => clearTimeout(id);
  }, [filter]);

  // Search and paging happen on the server: the list used to be the first 200
  // products filtered in the browser, so the 201st onwards could never be
  // found, edited or archived here. One page at a time (DataTable pagination,
  // the total from X-Total-Count). Only the newest request may write.
  const [page, setPage] = useState(1);
  const [paging, setPaging] = useState(false);
  const seq = useRef(0);

  const load = useCallback((target: number) => {
    const n = ++seq.current;
    setLoadError(null);
    setPaging(true);
    const p = new URLSearchParams({
      include_archived: String(showArchived), limit: String(PAGE), offset: String((target - 1) * PAGE),
    });
    if (query) p.set("q", query);
    apiPage<Product>(`/pos/products?${p}`)
      .then((r) => {
        if (n !== seq.current) return;
        // Archiving the last row of the last page leaves that page empty: step back.
        const last = Math.max(1, Math.ceil(r.total / PAGE));
        if (r.items.length === 0 && target > last) { load(last); return; }
        setItems(r.items); setTotal(r.total); setPage(target);
      })
      .catch((e) => { if (n === seq.current) setLoadError(errorText(e, `Couldn't load ${word.toLowerCase()}.`)); })
      .finally(() => { if (n === seq.current) setPaging(false); });
  }, [showArchived, query, word]);
  // A new search or the archived toggle starts again from the first page (the
  // old rows stay up until the new ones arrive, rather than flashing a skeleton).
  useEffect(() => { load(1); }, [load]);
  // After a save, the same page again: an edit on page 4 shouldn't snap back to page 1.
  const reload = () => load(page);

  // Every write says when it fails — a failed save used to look like a good one (I2).
  const create = useAction(
    (body: Record<string, unknown>) => api("/pos/products", { method: "POST", body: JSON.stringify(body) }),
    { success: `${one} added`, failure: `Couldn't add the ${one.toLowerCase()}` });
  const patch = useAction(
    (id: string, body: Partial<Product>) =>
      api(`/pos/products/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }),
    { failure: "Couldn't save" });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const ok = await create.run({
      name: form.name,
      barcode: form.barcode,
      price_minor: toMinor(form.price),
      stock_qty: Number(form.stock || 0),
      low_stock_at: Number(form.low || 0),
      hs_code: form.hs_code,
      tax_rate: Number(form.tax_rate || 0),
    });
    if (ok !== undefined) { setForm(blank); reload(); }
  }

  async function save(id: string, body: Partial<Product>) {
    const ok = await patch.run(id, body);
    if (ok !== undefined) { setEditing(null); reload(); }
  }

  async function onArchive(p: Product) {
    // Archiving rather than deleting: a sold product is referenced by past
    // sales, so removing the row would rewrite history. Still asked first —
    // it vanishes from the till.
    const done = await confirm({
      title: `Archive ${p.name}?`,
      description: 'It disappears from the till and search. Past sales keep it, and you can restore it from "Show archived".',
      body: <p>{p.stock_qty} {p.unit} in stock.</p>,
      confirmLabel: "Archive",
      busyLabel: "Archiving…",
      cancelLabel: "Keep it",
      tone: "danger",
      run: () => patch.run(p.id, { active: false }),
    });
    if (done) reload();
  }

  const columns: Column<Product>[] = [
    {
      key: "name", header: "Name", primary: true,
      cell: (p) => (
        <div className="min-w-0">
          <p className="font-medium break-words">{p.name}</p>
          <p className="text-xs text-fg-subtle">
            {p.barcode && <span>{p.barcode}</span>}
            {p.barcode && p.hs_code && " · "}
            {p.hs_code && <span>HS {p.hs_code}</span>}
          </p>
        </div>
      ),
    },
    {
      key: "price", header: "Price", align: "right",
      cell: (p) => (
        <span className="tabular-nums">
          {money(p.price_minor)}
          {p.tax_rate > 0 && <span className="ml-1 text-xs text-fg-subtle">+{p.tax_rate}%</span>}
        </span>
      ),
    },
    {
      key: "stock", header: "Stock",
      cell: (p) => {
        const low = p.active && p.low_stock_at > 0 && p.stock_qty <= p.low_stock_at;
        return (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span className="tabular-nums">{p.stock_qty} {p.unit}</span>
            {low && <Badge tone="warning">low</Badge>}
            {!p.active && <Badge>archived</Badge>}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">Manage your catalog and stock levels.</p>
        <ImportCsv path="/pos/products" onDone={reload} />
      </div>

      {/* Stacks below xl: beside a 248px sidebar at 1024 the side card pushed
          the page sideways. minmax(0,1fr) lets the table shrink, not overflow. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Input
              type="search" value={filter} onChange={(e) => setFilter(e.target.value)}
              placeholder={`Search ${word.toLowerCase()}…`} aria-label={`Search ${word.toLowerCase()}`}
              className="max-w-xs flex-1"
            />
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-fg-muted">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="size-6 accent-[var(--color-brand)]"
              />
              Show archived
            </label>
          </div>

          {loadError ? (
            <ErrorState message={loadError} onRetry={reload} />
          ) : (
            <>
              <DataTable
                pagination={{ page, pageSize: PAGE, total, onPageChange: load, noun: word.toLowerCase(), busy: paging }}
                columns={columns}
                rows={items ?? []}
                rowKey={(p) => p.id}
                loading={items === null}
                caption={word}
                empty={<EmptyState title={query ? `Nothing matches "${query}".` : `No ${word.toLowerCase()} yet.`}
                                   hint={query ? undefined : `Add your first ${one.toLowerCase()} or import a CSV.`} />}
                actions={(p) => (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}>Edit</Button>
                    {p.active ? (
                      <Button size="sm" variant="ghost" onClick={() => void onArchive(p)} aria-label={`Archive ${p.name}`}>Archive</Button>
                    ) : (
                      <Button size="sm" variant="ghost" disabled={patch.busy} onClick={() => void save(p.id, { active: true })} aria-label={`Restore ${p.name}`}>
                        Restore
                      </Button>
                    )}
                  </>
                )}
              />
            </>
          )}
        </div>

        <Card className="h-fit space-y-3">
          <h2 className="text-sm font-semibold">Add {one}</h2>
          <form onSubmit={add} className="space-y-3">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price (PKR)"><Input {...num} step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required /></Field>
              <Field label="Stock"><Input {...num} step="any" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Barcode"><Input inputMode="numeric" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></Field>
              <Field label="Low-stock at"><Input {...num} step="any" value={form.low} onChange={(e) => setForm({ ...form, low: e.target.value })} /></Field>
            </div>
            {/* Required on every FBR line item — a wrong HS code is the most
                common rejection (error 0052). */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="HS code"><Input value={form.hs_code} placeholder="0101.2100" onChange={(e) => setForm({ ...form, hs_code: e.target.value })} /></Field>
              <Field label="Tax rate %"><Input {...num} max={100} step="0.01" value={form.tax_rate} placeholder="18" onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} /></Field>
            </div>
            <Button type="submit" disabled={create.busy} className="w-full">{create.busy ? "Adding…" : `Add ${one}`}</Button>
          </form>
        </Card>
      </div>

      {editing && (
        <EditDialog p={editing} busy={patch.busy} onCancel={() => setEditing(null)} onSave={(b) => void save(editing.id, b)} />
      )}
    </>
  );
}

function EditDialog({ p, busy, onCancel, onSave }: {
  p: Product; busy: boolean; onCancel: () => void; onSave: (b: Partial<Product>) => void;
}) {
  const [f, setF] = useState({
    name: p.name,
    price: (p.price_minor / 100).toString(),
    stock: p.stock_qty.toString(),
    hs_code: p.hs_code,
    tax_rate: p.tax_rate.toString(),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      name: f.name,
      price_minor: toMinor(f.price),
      stock_qty: Number(f.stock || 0),
      hs_code: f.hs_code,
      tax_rate: Number(f.tax_rate || 0),
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => { if (!o) onCancel(); }}
      title={`Edit ${p.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="submit" form="edit-product" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </>
      }
    >
      <form id="edit-product" onSubmit={submit} className="space-y-3">
        <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price (PKR)"><Input {...num} step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} required /></Field>
          <Field label="Stock"><Input {...num} step="any" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="HS code"><Input value={f.hs_code} onChange={(e) => setF({ ...f, hs_code: e.target.value })} placeholder="0101.2100" /></Field>
          <Field label="Tax rate %"><Input {...num} max={100} step="0.01" value={f.tax_rate} onChange={(e) => setF({ ...f, tax_rate: e.target.value })} /></Field>
        </div>
      </form>
    </Dialog>
  );
}
