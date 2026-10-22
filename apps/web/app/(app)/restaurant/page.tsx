"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { errorText } from "@/lib/useAction";
import { Tabs } from "@/components/Tabs";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui";

type Floor = Schema<"FloorOut">;

/* The floor (wave B, study 11): every table on each floor. Open orders and
   running bills arrive with the next slice; until then every table is free. */
export default function RestaurantFloor() {
  const [floors, setFloors] = useState<Floor[] | null>(null);
  const [current, setCurrent] = useState("");
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
  }, []);
  useEffect(load, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!floors) return <LoadingRows rows={3} label="Loading the floor" />;
  if (floors.length === 0) {
    return (
      <EmptyState title="No floors yet" hint="Add your floors and tables to start taking table orders."
                  action={<Can perm="restaurant.setup.manage"><Link href="/restaurant/setup" className="text-brand underline">Set up tables</Link></Can>} />
    );
  }
  const floor = floors.find((f) => f.id === current) ?? floors[0];
  const tables = floor.tables.filter((t) => t.active);

  return (
    <Tabs label="Floors" value={floor.id} onChange={setCurrent} items={floors.map((f) => ({ id: f.id, label: f.name }))}>
      {tables.length === 0 ? <EmptyState title="No tables on this floor" /> : (
        <ul aria-label={`Tables on ${floor.name}`} className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3">
          {tables.map((t) => (
            <li key={t.id} className="rounded-lg border border-line bg-surface p-3">
              <p className="font-display text-2xl font-semibold tabular-nums">{t.label}</p>
              <p className="text-xs text-fg-muted">{t.seats} seats</p>
              <p className="mt-2 text-xs font-medium text-success">Free</p>
            </li>
          ))}
        </ul>
      )}
    </Tabs>
  );
}
