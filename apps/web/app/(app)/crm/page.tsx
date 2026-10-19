"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Lead, Pipeline, Stage } from "@business-os/types";
import { api } from "@/lib/api";
import { money, moneyCompact } from "@/lib/format";
import { useSession } from "@/lib/session";
import { errorText } from "@/lib/useAction";
import { useToast } from "@/components/Toast";
import { Button, EmptyState, ErrorState, Input, LoadingRows, Select } from "@/components/ui";
import { DataTable, type Column } from "@/components/DataTable";
import { AddLeadForm } from "@/components/crm/AddLeadForm";
import { ImportCsv } from "@/components/ImportCsv";
import { LeadDrawer } from "@/components/crm/LeadDrawer";
import { ScorePill } from "@/components/crm/ScorePill";

type View = "board" | "list";
type Sort = "newest" | "value" | "score";

export default function CrmBoard() {
  const { t } = useSession();
  const toast = useToast();
  // undefined = still loading, null = this tenant has no pipeline at all.
  const [pipeline, setPipeline] = useState<Pipeline | null | undefined>(undefined);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  // null = loading. "No leads yet" while the list was still in flight told
  // people their data was gone.
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [view, setView] = useState<View>("board");
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [sort, setSort] = useState<Sort>("newest");

  const loadLeads = useCallback((pid: string) => {
    setLeadsError(null);
    api<Lead[]>(`/crm/leads?pipeline_id=${pid}`)
      .then(setLeads)
      .catch((e) => setLeadsError(errorText(e, `Couldn't load your ${t("leads").toLowerCase()}.`)));
  }, [t]);

  const loadPipeline = useCallback(() => {
    setPipelineError(null);
    setPipeline(undefined);
    api<Pipeline[]>("/crm/pipelines")
      .then((ps) => {
        const p = ps[0] ?? null;
        setPipeline(p);
        if (p) loadLeads(p.id);
      })
      .catch((e) => setPipelineError(errorText(e, "Couldn't load the pipeline.")));
  }, [loadLeads]);

  useEffect(loadPipeline, [loadPipeline]);

  /** The one way a lead changes stage — drag, the drawer's select and the list
   *  view all call this. Resolves false when the server refused. */
  const moveLead = useCallback(async (id: string, stageId: string) => {
    setLeads((cur) => cur && cur.map((l) => (l.id === id ? { ...l, stage_id: stageId } : l))); // optimistic
    try {
      await api(`/crm/leads/${id}`, { method: "PATCH", body: JSON.stringify({ stage_id: stageId }) });
      return true;
    } catch (e) {
      toast.error(`Couldn't move it: ${errorText(e)}`);
      if (pipeline) loadLeads(pipeline.id); // revert to what the server has
      return false;
    }
  }, [pipeline, loadLeads, toast]);

  // Sources that actually occur, not the theoretical enum — a filter offering
  // options with zero hits is noise.
  const sources = useMemo(() => [...new Set((leads ?? []).map((l) => l.source))].sort(), [leads]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = leads ?? [];
    if (needle) {
      out = out.filter((l) =>
        [l.name, l.company, l.phone, l.email].some((f) => f.toLowerCase().includes(needle)));
    }
    if (source) out = out.filter((l) => l.source === source);
    return [...out].sort((a, b) =>
      sort === "value" ? b.value_minor - a.value_minor
      : sort === "score" ? (b.score ?? 0) - (a.score ?? 0)
      : +new Date(b.created_at) - +new Date(a.created_at));
  }, [leads, q, source, sort]);

  if (pipelineError) return <ErrorState message={pipelineError} onRetry={loadPipeline} />;
  if (pipeline === undefined) return <LoadingRows label="Loading pipeline" />;
  if (pipeline === null) {
    return (
      <EmptyState
        title="No pipeline set up yet"
        hint={`A pipeline is the list of stages a ${t("lead").toLowerCase()} moves through. Ask an admin to set one up, then try again.`}
        action={<Button variant="subtle" onClick={loadPipeline}>Try again</Button>}
      />
    );
  }

  const open = openLead ? (leads ?? []).find((l) => l.id === openLead) : undefined;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* Drag is mouse-only; touch and keyboard users need to hear the other way. */}
        <p className="text-sm text-fg-muted">
          Drag a card to another stage, or open it and choose <span className="font-medium text-fg">Move to stage</span>.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <ImportCsv path="/crm/leads" onDone={() => loadLeads(pipeline.id)} />
          <Button onClick={() => setAdding(true)}>+ New {t("lead")}</Button>
        </div>
      </div>

      {/* Toolbar: filters act on both views, so switching views never changes
          which records you're looking at — only their shape. */}
      {/* Widths live on wrappers: the Input/Select base class is w-full, and
          Tailwind resolves the conflict by stylesheet order, so a w-56 on the
          element itself silently loses. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-56">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${t("leads").toLowerCase()}…`}
            aria-label="Search"
          />
        </div>
        {sources.length > 1 && (
          <div className="w-36">
            <Select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source">
              <option value="">All sources</option>
              {sources.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
        )}
        <div className="w-36">
          <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            <option value="newest">Newest first</option>
            <option value="value">Highest value</option>
            <option value="score">Best score</option>
          </Select>
        </div>
        {(q || source) && leads && (
          <span className="text-xs text-fg-subtle">{shown.length} of {leads.length}</span>
        )}
        <ViewToggle view={view} onChange={setView} />
      </div>

      {leadsError ? (
        <ErrorState message={leadsError} onRetry={() => loadLeads(pipeline.id)} />
      ) : leads === null ? (
        <LoadingRows label={`Loading ${t("leads").toLowerCase()}`} />
      ) : leads.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-line px-4 py-16 text-center">
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-elevated text-xl" aria-hidden>✦</div>
          <p className="text-sm font-medium">No {t("leads").toLowerCase()} yet</p>
          <p className="mb-4 max-w-xs text-xs text-fg-muted">
            Add your first {t("lead").toLowerCase()} to get started — we&apos;ll score it and flag duplicates automatically.
          </p>
          <Button onClick={() => setAdding(true)}>+ Add {t("lead")}</Button>
        </div>
      ) : view === "board" ? (
        <Board
          stages={pipeline.stages}
          leads={shown}
          dragId={dragId}
          setDragId={setDragId}
          onOpen={setOpenLead}
          onMove={moveLead}
        />
      ) : (
        <ListView stages={pipeline.stages} leads={shown} onOpen={setOpenLead} onMove={moveLead} />
      )}

      {adding && (
        <AddLeadForm
          onClose={() => setAdding(false)}
          onCreated={(l) => { setLeads((c) => [l, ...(c ?? [])]); setAdding(false); }}
        />
      )}
      {openLead && (
        <LeadDrawer
          leadId={openLead}
          name={open?.name ?? t("lead")}
          stages={pipeline.stages}
          onMove={moveLead}
          onClose={() => setOpenLead(null)}
          onChanged={() => loadLeads(pipeline.id)}
        />
      )}
    </>
  );
}

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="ml-auto flex rounded-lg border border-line p-0.5" role="tablist" aria-label="View">
      {(["board", "list"] as View[]).map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={view === v}
          onClick={() => onChange(v)}
          className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors pointer-coarse:min-h-10 pointer-coarse:px-4 ${
            view === v ? "bg-elevated text-fg" : "text-fg-muted hover:text-fg"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

// ── Board ───────────────────────────────────────────────────────────────────
function Board({ stages, leads, dragId, setDragId, onOpen, onMove }: {
  stages: Stage[];
  leads: Lead[];
  dragId: string | null;
  setDragId: (id: string | null) => void;
  onOpen: (id: string) => void;
  onMove: (id: string, stageId: string) => void;
}) {
  return (
    // `relative` makes this the containing block for the sr-only text inside
    // the cards; without it those absolutely-positioned spans escape the
    // scroller and widen the whole page by the board's width.
    <div className="relative flex gap-3 overflow-x-auto overscroll-x-contain pb-4">
      {stages.map((stage) => {
        const cards = leads.filter((l) => l.stage_id === stage.id);
        const total = cards.reduce((sum, l) => sum + l.value_minor, 0);
        return (
          // A named region per stage, so a screen reader can jump between columns.
          <section
            key={stage.id}
            aria-label={stage.name}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => dragId && onMove(dragId, stage.id)}
            className="flex w-64 shrink-0 flex-col rounded-lg border border-line bg-surface"
          >
            {/* Count and value live in the header — the column's worth is what
                you scan for, not something to hunt at the bottom. */}
            <div className="flex items-baseline justify-between gap-2 border-b border-line p-3">
              <h2 className={`relative min-w-0 truncate text-sm font-medium ${kindColor(stage.kind)}`} title={stage.name}>
                {stage.name}
                {stage.kind !== "active" && <span className="sr-only"> ({stage.kind})</span>}
              </h2>
              <span className="shrink-0 text-xs tabular-nums text-fg-subtle">
                {cards.length}{total > 0 && ` · ${moneyCompact(total)}`}
              </span>
            </div>
            <ul className="min-h-16 flex-1 space-y-2 p-2">
              {cards.map((l) => (
                <li key={l.id}>
                  <LeadCard lead={l} onOpen={onOpen} setDragId={setDragId} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** A real button: Tab reaches it, Enter/Space open it, and it works by touch.
 *  Drag stays for the mouse; the drawer's "Move to stage" is the way for
 *  everyone else. */
function LeadCard({ lead: l, onOpen, setDragId }: {
  lead: Lead;
  onOpen: (id: string) => void;
  setDragId: (id: string | null) => void;
}) {
  const detailsId = `lead-${l.id}-details`;
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDragId(l.id); }}
      onDragEnd={() => setDragId(null)}
      onClick={() => onOpen(l.id)}
      aria-label={`Open ${l.name}`}
      aria-describedby={detailsId}
      className="block w-full cursor-pointer rounded-md border border-line bg-elevated p-3 text-left transition-colors hover:border-brand/50"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium" title={l.name}>{l.name}</span>
        {l.score != null && <ScorePill score={l.score} />}
      </span>
      <span id={detailsId} className="block">
        {l.company && <span className="block truncate text-xs text-fg-subtle" title={l.company}>{l.company}</span>}
        <span className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs font-medium tabular-nums">{money(l.value_minor, l.currency)}</span>
          <span className="flex items-center gap-1.5 text-[10px] text-fg-subtle">
            <span className="rounded bg-surface px-1.5 py-0.5">{l.source}</span>
            <span title={new Date(l.created_at).toLocaleDateString("en-PK")}>{age(l.created_at)}</span>
          </span>
        </span>
      </span>
    </button>
  );
}

// ── List ────────────────────────────────────────────────────────────────────
function ListView({ stages, leads, onOpen, onMove }: {
  stages: Stage[];
  leads: Lead[];
  onOpen: (id: string) => void;
  onMove: (id: string, stageId: string) => void;
}) {
  const columns: Column<Lead>[] = [
    {
      key: "name",
      header: "Name",
      primary: true,
      cell: (l) => (
        <span className="block max-w-64">
          <span className="block truncate font-medium" title={l.name}>{l.name}</span>
          {l.company && <span className="block truncate text-xs font-normal text-fg-subtle" title={l.company}>{l.company}</span>}
        </span>
      ),
    },
    { key: "score", header: "Score", align: "right", cell: (l) => (l.score != null ? <ScorePill score={l.score} /> : "—") },
    { key: "value", header: "Value", align: "right", cell: (l) => money(l.value_minor, l.currency) },
    { key: "source", header: "Source", cell: (l) => <span className="text-fg-muted">{l.source}</span> },
    {
      key: "contact",
      header: "Contact",
      cell: (l) => (
        <span className="block text-xs text-fg-muted">
          {l.phone && <span className="block">{l.phone}</span>}
          {l.email && <span className="block truncate text-fg-subtle" title={l.email}>{l.email}</span>}
          {!l.phone && !l.email && "—"}
        </span>
      ),
    },
    { key: "age", header: "Age", align: "right", cell: (l) => <span className="text-xs text-fg-subtle">{age(l.created_at)}</span> },
  ];

  return (
    <DataTable
      columns={columns}
      rows={leads}
      rowKey={(l) => l.id}
      onRowClick={(l) => onOpen(l.id)}
      rowLabel={(l) => `Open ${l.name}`}
      caption="Leads"
      empty={<EmptyState title="Nothing matches these filters" />}
      // Stage changes without opening anything — the list view is the fast
      // lane, so the fastest action lives in it. It's an action, not a cell,
      // because on a phone the card body is a button and can't hold a select.
      actions={(l) => (
        <Select
          value={l.stage_id}
          onChange={(e) => onMove(l.id, e.target.value)}
          className="w-40 py-1 text-xs"
          aria-label={`Stage for ${l.name}`}
        >
          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      )}
    />
  );
}

// ── Shared bits ─────────────────────────────────────────────────────────────
function age(iso: string) {
  const days = Math.floor((Date.now() - +new Date(iso)) / 86_400_000);
  if (days === 0) return "today";
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

function kindColor(kind: string) {
  if (kind === "won") return "text-success";
  if (kind === "lost") return "text-danger";
  return "text-fg";
}
