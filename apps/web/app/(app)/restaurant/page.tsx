"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { Can, useCan } from "@/lib/can";
import { money } from "@/lib/format";
import { errorText, useAction } from "@/lib/useAction";
import { Dialog } from "@/components/Dialog";
import { Tabs } from "@/components/Tabs";
import { Button, EmptyState, ErrorState, Field, Input, LoadingRows } from "@/components/ui";

type Floor = Schema<"FloorOut">;
type Table = Schema<"TableOut">;
type Order = Schema<"OrderOut">;

/* The floor (wave B, study 11): free tables open an order, occupied ones
   show guests and the running bill. Takeaway orders sit beside them by token. */
export default function RestaurantFloor() {
  const router = useRouter();
  const can = useCan();
  const [floors, setFloors] = useState<Floor[] | null>(null);
  const [takeaway, setTakeaway] = useState<Order[]>([]);
  const [current, setCurrent] = useState("");
  const [opening, setOpening] = useState<Table | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api<Floor[]>("/restaurant/floors")
      .then((all) => {
        const inUse = all.filter((f) => f.active);
        setFloors(inUse);
        setCurrent((c) => (inUse.some((f) => f.id === c) ? c : inUse[0]?.id ?? ""));
      })
      .catch((e) => setError(errorText(e, "Couldn't load the floor.")));
    api<Order[]>("/restaurant/orders?status=open")
      .then((all) => setTakeaway(all.filter((o) => o.order_type === "takeaway")))
      .catch(() => setTakeaway([]));
  }, []);
  useEffect(load, [load]);
  // Other waiters open and close tables too: refresh while the floor is on screen.
  useEffect(() => { const id = setInterval(load, 15_000); return () => clearInterval(id); }, [load]);

  const newTakeaway = useAction(
    () => api<Order>("/restaurant/orders", { method: "POST", body: JSON.stringify({ order_type: "takeaway" }) }),
    { failure: "Couldn't start the order" },
  );

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!floors) return <LoadingRows rows={3} label="Loading the floor" />;

  const floor = floors.find((f) => f.id === current) ?? floors[0];
  const tables = floor ? floor.tables.filter((t) => t.active) : [];

  return (
    <div className="space-y-5">
      <Can perm="restaurant.order.create">
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={newTakeaway.busy} onClick={async () => {
            const o = await newTakeaway.run();
            if (o) router.push(`/restaurant/orders/${o.id}`);
          }}>New takeaway</Button>
          {takeaway.map((o) => (
            <Link key={o.id} href={`/restaurant/orders/${o.id}`}
                  className="inline-flex min-h-11 items-center rounded-md border border-line px-3 text-sm hover:border-brand">
              Token {o.token} · {money(o.total_minor)}
            </Link>
          ))}
        </div>
      </Can>

      {floors.length === 0 ? (
        <EmptyState title="No floors yet" hint="Add your floors and tables to start taking table orders."
                    action={<Can perm="restaurant.setup.manage"><Link href="/restaurant/setup" className="text-brand underline">Set up tables</Link></Can>} />
      ) : (
        <Tabs label="Floors" value={floor.id} onChange={setCurrent} items={floors.map((f) => ({ id: f.id, label: f.name }))}>
          {tables.length === 0 ? <EmptyState title="No tables on this floor" /> : (
            <ul aria-label={`Tables on ${floor.name}`} className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3">
              {tables.map((t) => {
                const o = t.open_order;
                const body = (
                  <>
                    <span className="font-display text-2xl font-semibold tabular-nums">{t.label}</span>
                    <span className="text-xs text-fg-muted">{o ? `${o.guests ?? "–"} guests` : `${t.seats} seats`}</span>
                    {o ? <span className="mt-2 text-sm font-semibold tabular-nums">{money(o.total_minor)}</span>
                       : <span className="mt-2 text-xs font-medium text-success">Free</span>}
                  </>
                );
                const cls = `flex min-h-28 w-full flex-col items-start rounded-lg border p-3 text-start ${o ? "border-brand bg-brand-subtle" : "border-line bg-surface hover:border-brand"}`;
                return (
                  <li key={t.id}>
                    {o ? (
                      <Link href={`/restaurant/orders/${o.id}`} className={cls} aria-label={`Table ${t.label}, occupied`}>{body}</Link>
                    ) : can("restaurant.order.create") ? (
                      <button type="button" className={cls} aria-label={`Table ${t.label}, free`} onClick={() => setOpening(t)}>{body}</button>
                    ) : (
                      <div className={cls}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Tabs>
      )}
      {opening && <OpenTable table={opening} onClose={() => setOpening(null)}
                             onOpened={(id) => router.push(`/restaurant/orders/${id}`)} />}
    </div>
  );
}

function OpenTable({ table, onClose, onOpened }: { table: Table; onClose: () => void; onOpened: (id: string) => void }) {
  const [guests, setGuests] = useState(String(Math.min(table.seats, 2)));
  const open = useAction(
    () => api<Order>("/restaurant/orders", { method: "POST", body: JSON.stringify({
      order_type: "dine_in", table_id: table.id, guests: Number(guests) || null }) }),
    { failure: "Couldn't open the table" },
  );
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={`Open table ${table.label}`} size="sm"
            footer={<Button disabled={open.busy} onClick={async () => { const o = await open.run(); if (o) onOpened(o.id); }}>Open</Button>}>
      <Field label="Guests">
        <Input type="number" inputMode="numeric" min={1} max={100} value={guests} onChange={(e) => setGuests(e.target.value)} />
      </Field>
    </Dialog>
  );
}
