"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { errorText, useAction } from "@/lib/useAction";
import { Badge, Button, Card, ErrorState, Field, Input, LoadingRows } from "@/components/ui";

type Branch = { id: string; code: string; name: string; address: string; is_default: boolean; active: boolean };

/* Branches and warehouses (wave B, 0091): each holds its own stock. A
   warehouse is just a branch without tills. */
export function BranchesCard({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<Branch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ code: "", name: "", address: "" });
  const load = useCallback(() => {
    setError(null);
    api<Branch[]>("/org/branches").then(setRows).catch((e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);
  const add = useAction(
    () => api("/org/branches", { method: "POST", body: JSON.stringify({ ...f, code: f.code.trim().toUpperCase() }) }),
    { success: "Added", failure: "Couldn't add it" },
  );

  return (
    <section aria-label="Branches and warehouses">
      <Card className="space-y-3">
        <div>
          <h3 className="font-semibold">Branches and warehouses</h3>
          <p className="text-sm text-fg-muted">Each one holds its own stock. A warehouse is a branch without tills.</p>
        </div>
        {error ? <ErrorState message={error} onRetry={load} /> : !rows ? <LoadingRows rows={2} /> : (
          <ul aria-label="Branches" className="divide-y divide-line text-sm">
            {rows.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-medium">{b.name}</span>
                <span className="text-xs tabular-nums text-fg-subtle">{b.code}</span>
                {b.is_default && <Badge tone="brand">Main</Badge>}
                {!b.active && <Badge>Closed</Badge>}
                {b.address && <span className="basis-full text-xs text-fg-muted">{b.address}</span>}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <form aria-label="Add a branch or warehouse" className="grid gap-2 sm:grid-cols-[8rem_1fr_1fr_auto] sm:items-end"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if ((await add.run()) !== undefined) { setF({ code: "", name: "", address: "" }); load(); }
                }}>
            <Field label="Code"><Input value={f.code} required maxLength={8} placeholder="WH1"
                                       onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
            <Field label="Name"><Input value={f.name} required maxLength={120} placeholder="Main warehouse"
                                       onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Address"><Input value={f.address} maxLength={500}
                                          onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
            <Button type="submit" variant="subtle" disabled={add.busy}>{add.busy ? "Adding…" : "Add"}</Button>
          </form>
        )}
      </Card>
    </section>
  );
}
