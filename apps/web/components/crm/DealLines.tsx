"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { Button, ErrorState, Field, Input, LoadingRows, Select, Switch } from "@/components/ui";

type DealLines = Schema<"DealLines">;
type DealProduct = Schema<"DealProductOut">;
type TaxRate = { code: string; name: string; rate_pct: number; applies_to: string };

/** A line while it is being edited: money as typed rupees, so "12.5" survives. */
type Draft = {
  key: number;
  product_id: string | null;
  description: string;
  qty: string;
  price: string;
  discount: string;
  tax_code: string;
};

let nextKey = 1;
const rupees = (minor: number) => (minor / 100).toString();
const paisa = (s: string) => Math.round(Number(s || 0) * 100);

/** Products on a deal (wave D): priced on the server by the one pricing
 *  function; while there are lines, the deal's value is their pre-tax total. */
export function DealLinesPanel({ leadId, open, mayEdit, onChanged }: {
  leadId: string; open: boolean; mayEdit: boolean; onChanged: () => void;
}) {
  const [data, setData] = useState<DealLines | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api<DealLines>(`/crm/leads/${leadId}/lines`)
      .then(setData)
      .catch((e) => setError(errorText(e, "Couldn't load the products.")));
  }, [leadId]);
  useEffect(load, [load]);

  const reprice = useAction(
    () => api<DealLines>(`/crm/leads/${leadId}/lines/update-prices`, { method: "POST" }),
    { success: "Prices updated from the catalog", failure: "Couldn't update the prices" },
  );

  const canChange = mayEdit && open;
  const hasProducts = !!data?.lines.some((l) => l.product_id);
  return (
    <section className="mb-6 space-y-3 rounded-lg border border-line p-3" aria-labelledby={`lines-${leadId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`lines-${leadId}`} className="text-xs font-semibold text-fg">Products</h3>
        {canChange && data && !editing && (
          <span className="flex gap-2">
            {hasProducts && (
              <Button size="sm" variant="ghost" disabled={reprice.busy}
                      onClick={async () => { const r = await reprice.run(); if (r) { setData(r as DealLines); onChanged(); } }}>
                Update prices
              </Button>
            )}
            <Button size="sm" variant="subtle" onClick={() => setEditing(true)}>
              {data.lines.length ? "Edit products" : "Add products"}
            </Button>
          </span>
        )}
      </div>
      {error ? <ErrorState message={error} onRetry={load} /> : !data ? <LoadingRows rows={2} label="Loading products" /> : editing ? (
        <LinesEditor
          leadId={leadId}
          initial={data}
          onCancel={() => setEditing(false)}
          onSaved={(d) => { setData(d); setEditing(false); onChanged(); }}
        />
      ) : data.lines.length === 0 ? (
        <p className="text-sm text-fg-subtle">
          No products yet. {canChange ? "Add them and the deal value is worked out from them." : ""}
        </p>
      ) : (
        <LinesView data={data} />
      )}
    </section>
  );
}

function LinesView({ data }: { data: DealLines }) {
  return (
    <>
      <ul className="divide-y divide-line text-sm">
        {data.lines.map((l) => (
          <li key={l.id} className="flex items-start justify-between gap-3 py-1.5">
            <span className="min-w-0">
              <span className="block break-words">{l.description}</span>
              <span className="text-xs text-fg-subtle tabular-nums">
                {l.qty} {l.unit} × {money(l.unit_price_minor)}
                {l.line_discount_minor > 0 && ` − ${money(l.line_discount_minor)}`}
                {l.tax_code && ` · tax ${l.tax_rate_pct}%`}
                {l.price_overridden && " · price set by hand"}
              </span>
            </span>
            <span className="shrink-0 tabular-nums">{money(l.net_excl_minor)}</span>
          </li>
        ))}
      </ul>
      <Totals data={data} />
    </>
  );
}

function Totals({ data }: { data: Pick<DealLines, "net_minor" | "tax_minor" | "total_minor" | "tax_inclusive"> }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 border-t border-line pt-2 text-sm tabular-nums">
      <dt className="text-fg-muted">Before tax{data.tax_inclusive ? " (prices include tax)" : ""}</dt>
      <dd className="text-right">{money(data.net_minor)}</dd>
      <dt className="text-fg-muted">Tax</dt>
      <dd className="text-right">{money(data.tax_minor)}</dd>
      <dt className="font-medium">Total</dt>
      <dd className="text-right font-medium">{money(data.total_minor)}</dd>
    </dl>
  );
}

function LinesEditor({ leadId, initial, onCancel, onSaved }: {
  leadId: string; initial: DealLines; onCancel: () => void; onSaved: (d: DealLines) => void;
}) {
  const [rows, setRows] = useState<Draft[]>(() => initial.lines.map((l) => ({
    key: nextKey++, product_id: l.product_id, description: l.description, qty: String(l.qty),
    price: rupees(l.unit_price_minor), discount: l.line_discount_minor ? rupees(l.line_discount_minor) : "",
    tax_code: l.tax_code ?? "",
  })));
  const [inclusive, setInclusive] = useState(initial.tax_inclusive);
  const [rates, setRates] = useState<TaxRate[]>([]);
  const [ceiling, setCeiling] = useState<number | null>(null);

  useEffect(() => {
    api<{ rates: TaxRate[] }>("/tax/rates")
      .then((r) => {
        const seen = new Set<string>();
        setRates(r.rates.filter((t) => t.applies_to !== "purchase" && !seen.has(t.code) && seen.add(t.code)));
      })
      .catch(() => setRates([]));   // lines without tax still work
    api<{ max_discount_pct: number | null }>("/crm/settings")
      .then((s) => setCeiling(s.max_discount_pct)).catch(() => setCeiling(null));
  }, []);

  const save = useAction(
    () => api<DealLines>(`/crm/leads/${leadId}/lines`, {
      method: "PUT",
      body: JSON.stringify({
        tax_inclusive: inclusive,
        lines: rows.map((r) => ({
          product_id: r.product_id, description: r.description.trim(), qty: Number(r.qty),
          unit_price_minor: paisa(r.price), line_discount_minor: paisa(r.discount), tax_code: r.tax_code || null,
        })),
      }),
    }),
    { success: "Products saved", failure: "Couldn't save the products" },
  );

  const set = (key: number, patch: Partial<Draft>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = (p?: DealProduct) => setRows((rs) => [...rs, {
    key: nextKey++, product_id: p?.id ?? null, description: p?.name ?? "", qty: "1",
    price: p ? rupees(p.price_minor) : "", discount: "", tax_code: "",
  }]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const done = await save.run();
    if (done) onSaved(done as DealLines);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <ProductSearch onPick={add} />
      {rows.length === 0 && <p className="text-sm text-fg-subtle">Find a product above, or add a line of your own.</p>}
      <ol className="space-y-3">
        {rows.map((r, i) => (
          <li key={r.key} className="space-y-2 rounded-md border border-line p-2">
            <Field label={`Line ${i + 1}`}>
              <Input value={r.description} required maxLength={300}
                     onChange={(e) => set(r.key, { description: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Field label="Qty">
                <Input type="number" inputMode="decimal" min={0.001} step="0.001" required value={r.qty}
                       onChange={(e) => set(r.key, { qty: e.target.value })} />
              </Field>
              <Field label="Price (PKR)">
                <Input type="number" inputMode="decimal" min={0} step="0.01" required value={r.price}
                       onChange={(e) => set(r.key, { price: e.target.value })} />
              </Field>
              <Field label="Discount (PKR)">
                <Input type="number" inputMode="decimal" min={0} step="0.01" value={r.discount}
                       onChange={(e) => set(r.key, { discount: e.target.value })} />
              </Field>
              <Field label="Tax">
                <Select value={r.tax_code} onChange={(e) => set(r.key, { tax_code: e.target.value })}>
                  <option value="">No tax</option>
                  {rates.map((t) => <option key={t.code} value={t.code}>{t.name} ({t.rate_pct}%)</option>)}
                </Select>
              </Field>
            </div>
            <Button size="sm" variant="ghost" type="button"
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
              Remove line {i + 1}
            </Button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="subtle" type="button" onClick={() => add()}>Add a line</Button>
        <span className="flex items-center gap-1 text-sm text-fg-muted">
          <Switch checked={inclusive} onChange={setInclusive} label="Prices include tax" />
          <span aria-hidden>Prices include tax</span>
        </span>
      </div>
      {ceiling !== null && (
        <p className="text-xs text-fg-muted">Discounts above {ceiling}% of a line need a manager.</p>
      )}
      {save.error && <p className="text-xs text-danger" role="alert">{save.error}</p>}
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={save.busy}>{save.busy ? "Saving…" : "Save products"}</Button>
        <Button size="sm" variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

/** Search the catalog by name, SKU or barcode; picking adds a line priced from it. */
function ProductSearch({ onPick }: { onPick: (p: DealProduct) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<DealProduct[]>([]);
  useEffect(() => {
    const term = q.trim();
    if (!term) { setHits([]); return; }
    const t = setTimeout(() => {
      api<DealProduct[]>(`/crm/products?q=${encodeURIComponent(term)}`).then(setHits).catch(() => setHits([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div>
      <Field label="Find a product">
        <Input type="search" value={q} placeholder="Name, SKU or barcode" onChange={(e) => setQ(e.target.value)} />
      </Field>
      {hits.length > 0 && (
        <ul className="mt-1 max-h-48 overflow-auto rounded-md border border-line" aria-label="Matching products">
          {hits.map((p) => (
            <li key={p.id}>
              <button type="button"
                      className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm hover:bg-elevated"
                      onClick={() => { onPick(p); setQ(""); setHits([]); }}>
                <span className="min-w-0 truncate">{p.name}</span>
                <span className="shrink-0 tabular-nums text-fg-muted">{money(p.price_minor)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
