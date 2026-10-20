"use client";

import { useCallback, useEffect, useState } from "react";
import type { Invoice } from "@business-os/types";
import { api, apiUrl } from "@/lib/api";
import { Can } from "@/lib/can";
import { money, relativeDate } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { Badge, Button, EmptyState, ErrorState } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { useConfirm } from "@/components/Confirm";

const tone = { pending: "warning", approved: "success", rejected: "danger" } as const;

export default function InvoicesPage() {
  // null = loading; "No invoice requests yet" while loading read as "they're gone".
  const [items, setItems] = useState<Invoice[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const confirm = useConfirm();

  const load = useCallback(() => {
    setLoadError(null);
    api<Invoice[]>("/crm/invoices")
      .then(setItems)
      .catch((e) => setLoadError(errorText(e, "Couldn't load invoice requests.")));
  }, []);
  useEffect(load, [load]);

  // One guarded action per decision, so a double tap can't approve twice and
  // a failure says so instead of quietly reloading the same list.
  const approve = useAction(
    (id: string) => api(`/crm/invoices/${id}/approve`, { method: "POST" }),
    { success: "Invoice approved", failure: "Couldn't approve the invoice" },
  );
  const reject = useAction(
    (id: string) => api(`/crm/invoices/${id}/reject`, { method: "POST" }),
    { success: "Invoice rejected", failure: "Couldn't reject the invoice" },
  );
  const deciding = approve.busy || reject.busy;

  async function onApprove(inv: Invoice) {
    // Approving issues a real invoice for real money, so it asks first and
    // names the client and amount.
    const done = await confirm({
      title: "Approve this invoice?",
      body: (
        <>
          <span className="font-medium text-fg">{money(inv.total_minor)}</span> for{" "}
          <span className="font-medium text-fg">{inv.lead_name}</span>
          {inv.discount_pct > 0 && ` (after a ${inv.discount_pct}% discount)`}. Once approved it can be
          downloaded and sent to the client.
        </>
      ),
      confirmLabel: "Approve",
      busyLabel: "Approving…",
      run: () => approve.run(inv.id),
    });
    if (done) load();
  }
  async function doReject(inv: Invoice) {
    if ((await reject.run(inv.id)) !== undefined) load();
  }

  const columns: Column<Invoice>[] = [
    { key: "client", header: "Client", primary: true, cell: (i) => <span className="font-medium">{i.lead_name}</span> },
    { key: "total", header: "Total", align: "right", cell: (i) => money(i.total_minor) },
    { key: "discount", header: "Discount", align: "right", cell: (i) => <span className="text-fg-muted">{i.discount_pct}%</span> },
    { key: "status", header: "Status", cell: (i) => <Badge tone={tone[i.status]}>{i.status}</Badge> },
    { key: "requested", header: "Requested", cell: (i) => <span className="text-fg-subtle">{relativeDate(i.created_at)}</span> },
  ];

  return (
    <>
      <p className="mb-6 text-sm text-fg-muted">Quotation & invoice requests from sales, approved by accounts.</p>

      {loadError ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : (
        <DataTable
          columns={columns}
          rows={items ?? []}
          rowKey={(i) => i.id}
          loading={items === null}
          caption="Invoice requests"
          empty={<EmptyState title="No invoice requests yet" hint="Sales request invoices from a lead's details on the CRM board." />}
          actions={(inv) => (
            <>
              {inv.status === "pending" && (
                // Whoever holds the approval key, not whoever is called "Owner" (P1-13).
                <Can perm="invoicing.invoice.approve">
                  <Button size="sm" disabled={deciding} onClick={() => onApprove(inv)}>Approve</Button>
                  <Button size="sm" variant="subtle" disabled={deciding} onClick={() => doReject(inv)}>
                    {reject.busy ? "Rejecting…" : "Reject"}
                  </Button>
                </Can>
              )}
              {inv.status === "approved" && (
                <a href={apiUrl(`/crm/invoices/${inv.id}/pdf`)} target="_blank" rel="noreferrer"
                   className="relative inline-flex items-center text-xs text-brand hover:underline pointer-coarse:min-h-11">
                  Download PDF<span className="sr-only"> for {inv.lead_name}</span>
                </a>
              )}
            </>
          )}
        />
      )}
    </>
  );
}
