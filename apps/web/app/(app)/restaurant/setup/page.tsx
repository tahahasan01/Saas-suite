"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { Can } from "@/lib/can";
import { tableLabels } from "@/lib/restaurant";
import { errorText, useAction } from "@/lib/useAction";
import { Dialog } from "@/components/Dialog";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingRows, Switch } from "@/components/ui";

type Floor = Schema<"FloorOut">;
type Table = Schema<"TableOut">;
type Station = Schema<"StationOut">;
type Category = { id: string; name: string; active: boolean };

/* Table service set-up (wave B, study 11): floors with numbered tables, and
   the stations (kitchen, BBQ, drinks) with the categories each one makes.
   Kitchen tickets go to a station by the item's category. */
export default function RestaurantSetup() {
  const [floors, setFloors] = useState<Floor[] | null>(null);
  const [stations, setStations] = useState<Station[] | null>(null);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([api<Floor[]>("/restaurant/floors"), api<Station[]>("/restaurant/stations"),
                 api<Category[]>("/pos/categories")])
      .then(([f, s, c]) => { setFloors(f); setStations(s); setCategories(c); })
      .catch((e) => setError(errorText(e, "Couldn't load the set-up.")));
  }, []);
  useEffect(load, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!floors || !stations || !categories) return <LoadingRows rows={4} label="Loading the set-up" />;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Floors floors={floors} onChanged={load} />
      <Stations stations={stations} categories={categories} onChanged={load} />
    </div>
  );
}

function Floors({ floors, onChanged }: { floors: Floor[]; onChanged: () => void }) {
  const [name, setName] = useState("");
  const add = useAction(
    () => api("/restaurant/floors", { method: "POST", body: JSON.stringify({ name }) }),
    { success: "Floor added", failure: "Couldn't add the floor" },
  );
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold">Floors and tables</h2>
      {floors.length === 0 && <EmptyState title="No floors yet" hint="Add your hall, family section or roof first." />}
      {floors.map((f) => <FloorCard key={f.id} floor={f} onChanged={onChanged} />)}
      <Can perm="restaurant.setup.manage">
        <Card>
          <form aria-label="Add a floor" className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
            e.preventDefault();
            if ((await add.run()) !== undefined) { setName(""); onChanged(); }
          }}>
            <Field label="Floor name"><Input value={name} required maxLength={40} placeholder="Ground floor"
                                             onChange={(e) => setName(e.target.value)} /></Field>
            <Button type="submit" variant="subtle" disabled={add.busy}>{add.busy ? "Adding…" : "Add floor"}</Button>
          </form>
        </Card>
      </Can>
    </div>
  );
}

function FloorCard({ floor, onChanged }: { floor: Floor; onChanged: () => void }) {
  const [labels, setLabels] = useState("");
  const [seats, setSeats] = useState("4");
  const [badInput, setBadInput] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(floor.name);
  const addTables = useAction(
    (list: string[]) => api(`/restaurant/floors/${floor.id}/tables`, {
      method: "POST", body: JSON.stringify({ labels: list, seats: Number(seats) || 4 }),
    }),
    { success: "Tables added", failure: "Couldn't add the tables" },
  );
  const patch = useAction(
    (body: object) => api(`/restaurant/floors/${floor.id}`, { method: "PATCH", body: JSON.stringify(body) }),
    { success: "Saved", failure: "Couldn't save the floor" },
  );
  const save = async (body: object) => { if ((await patch.run(body)) !== undefined) onChanged(); };

  return (
    <section aria-label={floor.name}>
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {renaming ? (
            <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
              e.preventDefault(); await save({ name }); setRenaming(false);
            }}>
              <Field label="Floor name"><Input value={name} required maxLength={40} onChange={(e) => setName(e.target.value)} /></Field>
              <Button type="submit" size="sm">Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>Cancel</Button>
            </form>
          ) : (
            <h3 className="min-w-0 flex-1 break-words font-medium">{floor.name}</h3>
          )}
          {!floor.active && <Badge>Not in use</Badge>}
          <Can perm="restaurant.setup.manage">
            {!renaming && <Button size="sm" variant="ghost" aria-label={`Rename ${floor.name}`} onClick={() => setRenaming(true)}>Rename</Button>}
            <Switch checked={floor.active} label={`${floor.name} in use`} disabled={patch.busy}
                    onChange={(active) => save({ active })} />
          </Can>
        </div>

        {floor.tables.length === 0 ? <p className="text-sm text-fg-muted">No tables on this floor yet.</p> : (
          <ul aria-label="Tables" className="flex flex-wrap gap-2">
            {floor.tables.map((t) => <TableChip key={t.id} table={t} onChanged={onChanged} />)}
          </ul>
        )}

        <Can perm="restaurant.setup.manage">
          <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
            e.preventDefault();
            let list: string[];
            try { list = tableLabels(labels); } catch (err) { setBadInput((err as Error).message); return; }
            setBadInput(null);
            if (list.length && (await addTables.run(list)) !== undefined) { setLabels(""); onChanged(); }
          }}>
            <Field label="Table numbers">
              <Input value={labels} required placeholder="1-12, Family 1" aria-invalid={badInput ? true : undefined}
                     onChange={(e) => setLabels(e.target.value)} />
            </Field>
            <Field label="Seats each">
              <Input type="number" inputMode="numeric" min={1} max={50} value={seats} className="w-20"
                     onChange={(e) => setSeats(e.target.value)} />
            </Field>
            <Button type="submit" variant="subtle" disabled={addTables.busy}>{addTables.busy ? "Adding…" : "Add tables"}</Button>
            {badInput && <p role="alert" className="basis-full text-sm text-danger">{badInput}</p>}
          </form>
        </Can>
      </Card>
    </section>
  );
}

function TableChip({ table, onChanged }: { table: Table; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [seats, setSeats] = useState(String(table.seats));
  const patch = useAction(
    (body: object) => api(`/restaurant/tables/${table.id}`, { method: "PATCH", body: JSON.stringify(body) }),
    { success: "Saved", failure: "Couldn't save the table" },
  );
  const save = async (body: object) => { if ((await patch.run(body)) !== undefined) { setOpen(false); onChanged(); } };
  return (
    <li className={table.active ? "" : "opacity-60"}>
      <Can perm="restaurant.setup.manage" fallback={
        <span className="inline-flex rounded-md border border-line px-3 py-2 text-sm">{table.label} · {table.seats}</span>
      }>
        <button type="button" onClick={() => setOpen(true)} aria-label={`Table ${table.label}, ${table.seats} seats`}
                className="inline-flex min-h-11 items-center rounded-md border border-line px-3 text-sm hover:border-brand">
          <span className="font-medium">{table.label}</span>
          <span className="ms-1 text-fg-subtle">· {table.seats}</span>
        </button>
      </Can>
      <Dialog open={open} onOpenChange={setOpen} title={`Table ${table.label}`} size="sm"
              footer={<>
                <Button variant="ghost" onClick={() => save({ active: !table.active })} disabled={patch.busy}>
                  {table.active ? "Stop using" : "Use again"}
                </Button>
                <Button onClick={() => save({ seats: Number(seats) || table.seats })} disabled={patch.busy}>Save</Button>
              </>}>
        <Field label="Seats">
          <Input type="number" inputMode="numeric" min={1} max={50} value={seats} onChange={(e) => setSeats(e.target.value)} />
        </Field>
      </Dialog>
    </li>
  );
}

function CategoryPicks({ categories, picked, onChange }: {
  categories: Category[]; picked: Set<string>; onChange: (next: Set<string>) => void;
}) {
  if (categories.length === 0) return <p className="text-sm text-fg-muted">Add product categories first (Point of sale › Products).</p>;
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium">Makes</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {categories.map((c) => (
          <label key={c.id} className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={picked.has(c.id)} onChange={(e) => {
              const next = new Set(picked);
              if (e.target.checked) next.add(c.id); else next.delete(c.id);
              onChange(next);
            }} />
            {c.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Stations({ stations, categories, onChanged }: {
  stations: Station[]; categories: Category[]; onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const add = useAction(
    () => api("/restaurant/stations", { method: "POST", body: JSON.stringify({ name, category_ids: [...picked] }) }),
    { success: "Station added", failure: "Couldn't add the station" },
  );
  const active = categories.filter((c) => c.active);
  const routed = new Set(stations.filter((s) => s.active).flatMap((s) => s.categories.map((c) => c.id)));
  const unrouted = active.filter((c) => !routed.has(c.id));

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold">Kitchen stations</h2>
      <Card className="space-y-3">
        {stations.length === 0 ? (
          <EmptyState title="No stations yet" hint="A station is where food is made: kitchen, BBQ, drinks." />
        ) : (
          <ul aria-label="Stations" className="divide-y divide-line">
            {stations.map((s) => <StationRow key={s.id} station={s} categories={active} onChanged={onChanged} />)}
          </ul>
        )}
        {stations.length > 0 && unrouted.length > 0 && (
          <p className="text-sm text-warning">
            No station makes: {unrouted.map((c) => c.name).join(", ")}. Their tickets won&apos;t reach the kitchen.
          </p>
        )}
      </Card>
      <Can perm="restaurant.setup.manage">
        <Card>
          <form aria-label="Add a station" className="space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            if ((await add.run()) !== undefined) { setName(""); setPicked(new Set()); onChanged(); }
          }}>
            <Field label="Station name"><Input value={name} required maxLength={40} placeholder="Kitchen"
                                               onChange={(e) => setName(e.target.value)} /></Field>
            <CategoryPicks categories={active} picked={picked} onChange={setPicked} />
            <Button type="submit" variant="subtle" disabled={add.busy}>{add.busy ? "Adding…" : "Add station"}</Button>
          </form>
        </Card>
      </Can>
    </div>
  );
}

function StationRow({ station, categories, onChanged }: {
  station: Station; categories: Category[]; onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set(station.categories.map((c) => c.id)));
  const patch = useAction(
    (body: object) => api(`/restaurant/stations/${station.id}`, { method: "PATCH", body: JSON.stringify(body) }),
    { success: "Saved", failure: "Couldn't save the station" },
  );
  const save = async (body: object) => { if ((await patch.run(body)) !== undefined) { setOpen(false); onChanged(); } };
  return (
    <li className="flex flex-wrap items-center gap-2 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{station.name} {!station.active && <Badge>Not in use</Badge>}</p>
        <p className="text-fg-muted">{station.categories.length ? station.categories.map((c) => c.name).join(", ") : "Makes nothing yet"}</p>
      </div>
      <Can perm="restaurant.setup.manage">
        <Switch checked={station.active} label={`${station.name} in use`} disabled={patch.busy}
                onChange={(active) => save({ active })} />
        <Button size="sm" variant="ghost" aria-label={`Edit ${station.name}`} onClick={() => setOpen(true)}>Edit</Button>
        <Dialog open={open} onOpenChange={setOpen} title={`What ${station.name} makes`}
                footer={<Button onClick={() => save({ category_ids: [...picked] })} disabled={patch.busy}>Save</Button>}>
          <CategoryPicks categories={categories} picked={picked} onChange={setPicked} />
        </Dialog>
      </Can>
    </li>
  );
}
