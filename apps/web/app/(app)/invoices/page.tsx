"use client";

import { useCallback, useEffect, useState } from "react";
import type { Invoice } from "@business-os/types";
import { api } from "@/lib/api";
import { money, relativeDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Badge, Button, Card } from "@/components/ui";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const tone = { pending: "warning", approved: "success", rejected: "danger" } as const;

export default function InvoicesPage() {
  const { me } = useSession();
  const [items, setItems] = useState<Invoice[]>([]);
  const canApprove = me?.user.role === "Owner"; // accounts approver

  const load = useCallback(() => {
    api<Invoice[]>("/crm/invoices").then(setItems).catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  async function decide(id: string, action: "approve" | "reject") {
    await api(`/crm/invoices/${id}/${action}`, { method: "POST" }).catch(() => {});
    load();
  }

  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">Invoices</h1>
      <p className="mb-6 text-sm text-fg-muted">Quotation & invoice requests from sales, approved by accounts.</p>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-subtle">
              <th className="p-3">Client</th>
              <th className="p-3">Total</th>
              <th className="p-3">Discount</th>
              <th className="p-3">Status</th>
              <th className="p-3">Requested</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-fg-subtle">No invoice requests yet.</td></tr>
            )}
            {items.map((inv) => (
              <tr key={inv.id} className="border-b border-line/60">
                <td className="p-3 font-medium">{inv.lead_name}</td>
                <td className="p-3">{money(inv.total_minor)}</td>
                <td className="p-3 text-fg-muted">{inv.discount_pct}%</td>
                <td className="p-3"><Badge tone={tone[inv.status]}>{inv.status}</Badge></td>
                <td className="p-3 text-fg-subtle">{relativeDate(inv.created_at)}</td>
                <td className="p-3 text-right">
                  {inv.status === "pending" && canApprove && (
                    <span className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => decide(inv.id, "approve")}>Approve</Button>
                      <Button size="sm" variant="subtle" onClick={() => decide(inv.id, "reject")}>Reject</Button>
                    </span>
                  )}
                  {inv.status === "approved" && (
                    <a href={`${API}/crm/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer"
                       className="text-xs text-brand hover:underline">Download PDF</a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
