"use client";

import { useCallback, useEffect, useState } from "react";
import type { Product } from "@business-os/types";
import { api } from "@/lib/api";
import { money, relativeDate } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { Dialog } from "@/components/Dialog";
import { Button, Field, Input } from "@/components/ui";
import type { Customer } from "@/components/contacts/CustomerPicker";

type Line = { product: Product; qty: number };
export type HeldCart = { lines: Line[]; discount: string; customer: Customer | null };
type Held = { id: string; label: string; cart: HeldCart; held_by: string | null; created_at: string };

/* Hold and park bills (D-27): park the cart while the customer fetches
 * something, serve the next one, then bring it back. A held bill is resumed
 * once — it leaves the list as it returns to the till. */
export function HeldBills({ cart, discount, customer, disabled, onHeld, onResume }: {
  cart: Line[]; discount: string; customer: Customer | null; disabled: boolean;
  onHeld: () => void; onResume: (c: HeldCart) => void;
}) {
  const [held, setHeld] = useState<Held[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Held[]>("/pos/held").then(setHeld).catch((e) => setError(errorText(e, "Couldn't load held bills.")));
  }, []);
  useEffect(load, [load]);

  const hold = useAction(
    () => api<Held>("/pos/held", { method: "POST", body: JSON.stringify({ label, cart: { lines: cart, discount, customer } }) }),
    { success: "Bill held", failure: "Couldn't hold the bill" },
  );
  const resume = useAction(
    (id: string) => api<Held>(`/pos/held/${id}/resume`, { method: "POST" }),
    { failure: "Couldn't bring that bill back" },
  );

  const total = (c: HeldCart) => c.lines.reduce((n, l) => n + l.product.price_minor * l.qty, 0);

  return (
    <>
      <Button size="sm" variant="subtle" disabled={disabled || cart.length === 0} onClick={() => setNaming(true)}>
        Hold bill
      </Button>
      <Button size="sm" variant="ghost" onClick={() => { load(); setListOpen(true); }}>
        Held ({held.length})
      </Button>

      <Dialog open={naming} onOpenChange={setNaming} title="Hold this bill" size="sm"
              footer={<Button disabled={hold.busy} onClick={async () => {
                if (await hold.run()) { setNaming(false); setLabel(""); load(); onHeld(); }
              }}>{hold.busy ? "Holding…" : "Hold"}</Button>}>
        <Field label="Name it (optional)">
          <Input value={label} maxLength={60} placeholder="e.g. Table 4, man in blue shirt" onChange={(e) => setLabel(e.target.value)} />
        </Field>
      </Dialog>

      <Dialog open={listOpen} onOpenChange={setListOpen} title="Held bills" size="sm">
        {error && <p className="text-sm text-danger">{error}</p>}
        {held.length === 0 ? <p className="text-sm text-fg-muted">No bills on hold.</p> : (
          <ul className="divide-y divide-line">
            {held.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{h.label || `${h.cart.lines.length} item(s)`}</span>
                  <span className="text-xs text-fg-subtle">{money(total(h.cart))} · {h.held_by ?? ""} · {relativeDate(h.created_at)}</span>
                </span>
                <Button size="sm" disabled={resume.busy || cart.length > 0} title={cart.length > 0 ? "Finish or hold the current bill first" : undefined}
                        onClick={async () => {
                          const got = await resume.run(h.id);
                          if (got) { onResume(got.cart); setListOpen(false); load(); }
                        }}>
                  Resume<span className="sr-only"> {h.label}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </>
  );
}
