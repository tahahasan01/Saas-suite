"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Sale } from "@business-os/types";
import { api, apiPage } from "@/lib/api";
import { useCan } from "@/lib/can";
import { formatDateTime, money } from "@/lib/format";
import { BUSINESS_TZ } from "@/lib/dates";
import { useSession } from "@/lib/session";
import { errorText, useAction } from "@/lib/useAction";
import { Badge, Button, EmptyState, ErrorState, Field, Input, Select } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { Dialog } from "@/components/Dialog";
import { Receipt } from "@/components/pos/Receipt";
import { DropdownMenu } from "@/components/DropdownMenu";
import { Tooltip } from "@/components/Tooltip";
import { METHOD_LABEL } from "@/components/pos/labels";

type Row = {
  id: string; receipt_no: string | null; created_at: string; total_minor: number; payment_method: string;
  item_count: number; status: string; cashier: string | null; customer: string | null; register_code: string | null;
};

const PAGE = 50;

/* Sales history (3C): find a sale by receipt number, customer or phone;
   reprint it (stamped DUPLICATE) or void it (a full return, then marked
   void; a manager's key). Own-scope cashiers see only their own sales. */
export default function SalesHistoryPage() {
  const { me } = useSession();
  const can = useCan();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<Sale | null>(null);
  const [voiding, setVoiding] = useState<Row | null>(null);
  const seq = useRef(0);

  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 250); return () => clearTimeout(t); }, [q]);

  const load = useCallback((target: number) => {
    const n = ++seq.current;
    setError(null);
    const p = new URLSearchParams({ limit: String(PAGE), offset: String((target - 1) * PAGE) });
    if (query) p.set("q", query);
    if (method) p.set("method", method);
    apiPage<Row>(`/pos/sales?${p}`)
      .then((r) => { if (n === seq.current) { setRows(r.items); setTotal(r.total); setPage(target); } })
      .catch((e) => { if (n === seq.current) setError(errorText(e, "Couldn't load sales.")); });
  }, [query, method]);
  useEffect(() => { load(1); }, [load]);

  async function open(r: Row) {
    try { setShown(await api<Sale>(`/pos/sales/${r.id}`)); } catch (e) { setError(errorText(e, "Couldn't open that sale.")); }
  }

  const columns: Column<Row>[] = [
    { key: "receipt", header: "Receipt", primary: true,
      cell: (r) => <span className="font-mono text-sm">{r.receipt_no ?? "—"}</span> },
    { key: "when", header: "When", cell: (r) => <span className="text-fg-muted">{formatDateTime(r.created_at, BUSINESS_TZ)}</span> },
    { key: "customer", header: "Customer", cell: (r) => r.customer ?? <span className="text-fg-subtle">Walk-in</span> },
    { key: "total", header: "Total", align: "right", cell: (r) => <span className="tabular-nums">{money(r.total_minor)}</span> },
    { key: "method", header: "Paid", cell: (r) => r.payment_method === "split" ? "Split" : (METHOD_LABEL as Record<string, string>)[r.payment_method] ?? r.payment_method },
    { key: "status", header: "Status", cell: (r) => r.status === "void" ? <Badge tone="danger">Void</Badge> : <span className="text-fg-subtle">{r.cashier ?? ""}</span> },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs flex-1"
               placeholder="Receipt number, customer or phone" aria-label="Search sales" />
        <Select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Paid with" className="max-w-[12rem]">
          <option value="">Any method</option>
          {Object.entries(METHOD_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </Select>
      </div>
      {error ? <ErrorState message={error} onRetry={() => load(page)} /> : (
        <DataTable
          columns={columns} rows={rows ?? []} rowKey={(r) => r.id} loading={rows === null} caption="Sales"
          pagination={{ page, pageSize: PAGE, total, onPageChange: load, noun: "sales" }}
          empty={<EmptyState title={query ? `No sale matches "${query}".` : "No sales yet."} />}
          actions={(r) => (
            <>
              <Button size="sm" variant="ghost" onClick={() => void open(r)}>Open<span className="sr-only"> {r.receipt_no}</span></Button>
              {r.status !== "void" && can("pos.sale.void") && (
                <Tooltip content="More actions">
                  <DropdownMenu label={`More actions for ${r.receipt_no ?? "this sale"}`}
                                items={[{ label: "Void sale", danger: true, onSelect: () => setVoiding(r) }]} />
                </Tooltip>
              )}
            </>
          )}
        />
      )}
      <Receipt sale={shown} open={shown !== null} business={me?.tenant?.name ?? ""} title="Sale"
               closeLabel="Close" onClose={() => setShown(null)} />
      {voiding && <VoidDialog row={voiding} onClose={() => setVoiding(null)} onDone={() => { setVoiding(null); load(page); }} />}
    </>
  );
}

function VoidDialog({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const run = useAction(
    () => api(`/pos/sales/${row.id}/void`, { method: "POST", body: JSON.stringify({ reason }) }),
    { success: "Sale voided", failure: "Couldn't void the sale" },
  );
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={`Void ${row.receipt_no ?? "this sale"}?`} size="sm"
            footer={<>
              <Button variant="ghost" onClick={onClose}>Keep it</Button>
              <Button variant="danger" disabled={run.busy || !reason.trim()} onClick={async () => { if ((await run.run()) !== undefined) onDone(); }}>
                {run.busy ? "Voiding…" : "Void sale"}
              </Button>
            </>}>
      <p className="mb-3 text-sm text-fg-muted">
        {money(row.total_minor)} is refunded the way it was paid, the items go back on the shelf, and FBR gets a debit note.
        The sale stays on record, marked void.
      </p>
      <Field label="Why"><Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></Field>
    </Dialog>
  );
}
