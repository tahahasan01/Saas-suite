"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Lead, Pipeline, Stage, Tag } from "@business-os/types";
import { api } from "@/lib/api";
import { formatDate, money, moneyCompact } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useCan } from "@/lib/can";
import { errorText, useAction } from "@/lib/useAction";
import { useToast } from "@/components/Toast";
import { Badge, Button, EmptyState, ErrorState, Input, LoadingRows, Select } from "@/components/ui";
import { customFilterOptions, parseCustomFilter, useCustomFields } from "@/components/CustomFields";
import { DataTable, type Column } from "@/components/DataTable";
import { AddLeadForm } from "@/components/crm/AddLeadForm";
import { ImportCsv } from "@/components/ImportCsv";
import { LeadDrawer } from "@/components/crm/LeadDrawer";
import { ScorePill } from "@/components/crm/ScorePill";
import { ActivityDot, Stars } from "@/components/crm/bits";
import { TagChip } from "@/components/contacts/ContactForm";

type View = "board" | "list";
type Sort = "newest" | "value" | "score" | "priority";
/** The board shows live deals; lost ones have their own list (with Restore). */
type Show = "active" | "lost";

const PIPELINE_KEY = "bos.crm.pipeline";

function savedPipeline(): string | null {
  try { return window.localStorage.getItem(PIPELINE_KEY); } catch { return null; }
}
function savePipeline(id: string) {
  try { window.localStorage.setItem(PIPELINE_KEY, id); } catch { /* private mode: fine */ }
}

export default function CrmBoard() {
  const { t } = useSession();
  const toast = useToast();
  const can = useCan();
  // undefined = still loading, [] = this tenant has no pipeline at all.
  const [pipelines, setPipelines] = useState<Pipeline[] | undefined>(undefined);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  // null = loading. "No leads yet" while the list was still in flight told
  // people their data was gone.
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [view, setView] = useState<View>("board");
  const [show, setShow] = useState<Show>("active");
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [tag, setTag] = useState("");
  const [customFilter, setCustomFilter] = useState("");
  const leadFields = useCustomFields("lead");
  const customOptions = useMemo(() => customFilterOptions(leadFields), [leadFields]);
  const [sort, setSort] = useState<Sort>("newest");

  const pipeline = pipelines?.find((p) => p.id === pipelineId) ?? null;

  const loadLeads = useCallback((pid: string, which: Show) => {
    setLeadsError(null);
    api<Lead[]>(`/crm/leads?pipeline_id=${pid}&status=${which === "lost" ? "lost" : "open,won"}`)
      .then(setLeads)
      .catch((e) => setLeadsError(errorText(e, `Couldn't load your ${t("leads").toLowerCase()}.`)));
  }, [t]);

  const loadPipelines = useCallback(() => {
    setPipelineError(null);
    setPipelines(undefined);
    api<Pipeline[]>("/crm/pipelines")
      .then((ps) => {
        setPipelines(ps);
        const keep = savedPipeline();
        const p = ps.find((x) => x.id === keep) ?? ps.find((x) => x.is_default) ?? ps[0];
        setPipelineId(p?.id ?? null);
      })
      .catch((e) => setPipelineError(errorText(e, "Couldn't load the pipeline.")));
  }, []);

  useEffect(loadPipelines, [loadPipelines]);
  useEffect(() => {
    if (pipelineId) { setLeads(null); loadLeads(pipelineId, show); }
  }, [pipelineId, show, loadLeads]);

  const reload = useCallback(() => { if (pipelineId) loadLeads(pipelineId, show); }, [pipelineId, show, loadLeads]);

  /** The one way a lead changes stage — drag, the drawer's select and the list
   *  view all call this. Resolves false when the server refused. */
  const moveLead = useCallback(async (id: string, stageId: string) => {
    setLeads((cur) => cur && cur.map((l) => (l.id === id ? { ...l, stage_id: stageId } : l))); // optimistic
    try {
      const updated = await api<Lead>(`/crm/leads/${id}`, { method: "PATCH", body: JSON.stringify({ stage_id: stageId }) });
      setLeads((cur) => cur && cur.map((l) => (l.id === id ? updated : l)));
      return true;
    } catch (e) {
      toast.error(`Couldn't move it: ${errorText(e)}`);
      reload(); // revert to what the server has
      return false;
    }
  }, [reload, toast]);

  // Sources that actually occur, not the theoretical enum — a filter offering
  // options with zero hits is noise.
  const sources = useMemo(() => [...new Set((leads ?? []).map((l) => l.source))].sort(), [leads]);
  const tags = useMemo(() => {
    const byId = new Map<string, Tag>();
    for (const l of leads ?? []) for (const x of l.tags) byId.set(x.id, x);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [leads]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const cf = customFilter ? parseCustomFilter(customFilter) : null;
    let out = leads ?? [];
    if (needle) {
      out = out.filter((l) =>
        [l.name, l.company, l.phone, l.email].some((f) => f.toLowerCase().includes(needle)));
    }
    if (source) out = out.filter((l) => l.source === source);
    if (tag) out = out.filter((l) => l.tags.some((x) => x.id === tag));
    if (cf) {
      const [key, want] = cf;
      // A yes/no field that was never set counts as "no".
      out = out.filter((l) => (typeof want === "boolean" ? (l.custom?.[key] ?? false) : l.custom?.[key]) === want);
    }
    return [...out].sort((a, b) =>
      sort === "value" ? b.value_minor - a.value_minor
      : sort === "score" ? (b.score ?? 0) - (a.score ?? 0)
      : sort === "priority" ? b.priority - a.priority || +new Date(b.created_at) - +new Date(a.created_at)
      : +new Date(b.created_at) - +new Date(a.created_at));
  }, [leads, q, source, tag, sort, customFilter]);

  if (pipelineError) return <ErrorState message={pipelineError} onRetry={loadPipelines} />;
  if (pipelines === undefined) return <LoadingRows label="Loading pipeline" />;
  if (!pipeline) {
    return (
      <EmptyState
        title="No pipeline set up yet"
        hint={`A pipeline is the list of stages a ${t("lead").toLowerCase()} moves through. Ask an admin to set one up, then try again.`}
        action={<Button variant="subtle" onClick={loadPipelines}>Try again</Button>}
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
          <ImportCsv path="/crm/leads" onDone={reload} />
          {can("crm.lead.create") && <Button onClick={() => setAdding(true)}>+ New {t("lead")}</Button>}
        </div>
      </div>

      {/* Toolbar: filters act on both views, so switching views never changes
          which records you're looking at — only their shape. */}
      {/* Widths live on wrappers: the Input/Select base class is w-full, and
          Tailwind resolves the conflict by stylesheet order, so a w-56 on the
          element itself silently loses. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {pipelines.length > 1 && (
          <div className="w-44">
            <Select
              value={pipeline.id}
              onChange={(e) => { setPipelineId(e.target.value); savePipeline(e.target.value); }}
              aria-label="Pipeline"
            >
              {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
        )}
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
        {tags.length > 0 && (
          <div className="w-36">
            <Select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag">
              <option value="">All tags</option>
              {tags.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          </div>
        )}
        {customOptions.length > 0 && (
          <div className="w-44">
            <Select value={customFilter} onChange={(e) => setCustomFilter(e.target.value)} aria-label="Custom field">
              <option value="">Any custom field</option>
              {customOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
        )}
        <div className="w-36">
          <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            <option value="newest">Newest first</option>
            <option value="value">Highest value</option>
            <option value="score">Best score</option>
            <option value="priority">Priority</option>
          </Select>
        </div>
        <div className="w-32">
          <Select value={show} onChange={(e) => setShow(e.target.value as Show)} aria-label="Show">
            <option value="active">Open and won</option>
            <option value="lost">Lost</option>
          </Select>
        </div>
        {(q || source) && leads && (
          <span className="text-xs text-fg-subtle">{shown.length} of {leads.length}</span>
        )}
        {show === "active" && <ViewToggle view={view} onChange={setView} />}
      </div>

      {leadsError ? (
        <ErrorState message={leadsError} onRetry={reload} />
      ) : leads === null ? (
        <LoadingRows label={`Loading ${t("leads").toLowerCase()}`} />
      ) : show === "lost" ? (
        <LostList leads={shown} onOpen={setOpenLead} onRestored={reload} />
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
          onCreated={(l) => { if (l.pipeline_id === pipeline.id) setLeads((c) => [l, ...(c ?? [])]); setAdding(false); }}
        />
      )}
      {openLead && (
        <LeadDrawer
          leadId={openLead}
          name={open?.name ?? t("lead")}
          stages={pipeline.stages}
          onMove={moveLead}
          onClose={() => setOpenLead(null)}
          onChanged={reload}
        />
      )}
    </>
  );
}

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="ms-auto flex rounded-lg border border-line p-0.5" role="tablist" aria-label="View">
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
  // Folded stages start as narrow strips; a click opens one for this visit.
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set());
  return (
    // `relative` makes this the containing block for the sr-only text inside
    // the cards; without it those absolutely-positioned spans escape the
    // scroller and widen the whole page by the board's width.
    <div className="relative flex gap-3 overflow-x-auto overscroll-x-contain pb-4">
      {stages.map((stage) => {
        const cards = leads.filter((l) => l.stage_id === stage.id);
        const total = cards.reduce((sum, l) => sum + l.value_minor, 0);
        const weighted = cards.reduce((sum, l) => sum + l.weighted_value_minor, 0);
        if (stage.fold && !unfolded.has(stage.id)) {
          return (
            <section
              key={stage.id}
              aria-label={stage.name}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => dragId && onMove(dragId, stage.id)}
              className="flex w-12 shrink-0 flex-col items-center rounded-lg border border-line bg-surface py-3"
            >
              <button
                type="button"
                onClick={() => setUnfolded(new Set(unfolded).add(stage.id))}
                className="flex flex-col items-center gap-2 text-xs text-fg-muted hover:text-fg"
                aria-label={`Show ${stage.name} (${cards.length})`}
              >
                <span className="tabular-nums">{cards.length}</span>
                <span className="[writing-mode:vertical-rl]">{stage.name}</span>
              </button>
            </section>
          );
        }
        return (
          // A named region per stage, so a screen reader can jump between columns.
          <section
            key={stage.id}
            aria-label={stage.name}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => dragId && onMove(dragId, stage.id)}
            className="flex w-64 shrink-0 flex-col rounded-lg border border-line bg-surface"
          >
            {/* Count, value and weighted value live in the header — the
                column's worth is what you scan for. */}
            <div className="border-b border-line p-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className={`relative min-w-0 truncate text-sm font-medium ${stage.is_won ? "text-success" : "text-fg"}`} title={stage.name}>
                  {stage.name}
                  {stage.is_won && <span className="sr-only"> (won)</span>}
                </h2>
                <span className="shrink-0 text-xs tabular-nums text-fg-subtle">
                  {cards.length}{total > 0 && ` · ${moneyCompact(total)}`}
                </span>
              </div>
              {!stage.is_won && weighted > 0 && (
                <p className="mt-0.5 text-end text-[11px] tabular-nums text-fg-subtle" title="Value × probability">
                  ≈ {moneyCompact(weighted)} weighted
                </p>
              )}
            </div>
            <ul className="min-h-16 flex-1 space-y-2 p-2">
              {cards.map((l) => (
                <li key={l.id}>
                  <LeadCard lead={l} stage={stage} onOpen={onOpen} setDragId={setDragId} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function isStale(lead: Lead, stage: Stage): boolean {
  if (!stage.rotting_days || stage.is_won || !lead.stage_entered_at) return false;
  return Date.now() - +new Date(lead.stage_entered_at) > stage.rotting_days * 86_400_000;
}

/** A real button: Tab reaches it, Enter/Space open it, and it works by touch.
 *  Drag stays for the mouse; the drawer's "Move to stage" is the way for
 *  everyone else. */
function LeadCard({ lead: l, stage, onOpen, setDragId }: {
  lead: Lead;
  stage: Stage;
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
      className="block w-full cursor-pointer rounded-md border border-line bg-elevated p-3 text-start transition-colors hover:border-brand/50"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <ActivityDot state={l.activity_state} />
          <span className="min-w-0 truncate text-sm font-medium" title={l.name}>{l.name}</span>
        </span>
        {l.score != null && <ScorePill score={l.score} />}
      </span>
      <span id={detailsId} className="block">
        {l.company && <span className="block truncate text-xs text-fg-subtle" title={l.company}>{l.company}</span>}
        {l.tags.length > 0 && (
          <span className="mt-1.5 flex flex-wrap gap-1">{l.tags.map((x) => <TagChip key={x.id} tag={x} />)}</span>
        )}
        <span className="mt-2 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <span className="text-xs font-medium tabular-nums">{money(l.value_minor, l.currency)}</span>
            {l.probability != null && l.status === "open" && (
              <span className="text-[10px] tabular-nums text-fg-subtle" title="Probability">{l.probability}%</span>
            )}
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-fg-subtle">
            <Stars value={l.priority} />
            {isStale(l, stage) && <Badge tone="warning">stale</Badge>}
            <span className="rounded bg-surface px-1.5 py-0.5">{l.source}</span>
            <span title={formatDate(l.created_at)}>{age(l.created_at)}</span>
          </span>
        </span>
      </span>
    </button>
  );
}

// ── List ────────────────────────────────────────────────────────────────────
function nameCell(l: Lead) {
  return (
    <span className="block max-w-64">
      <span className="block truncate font-medium" title={l.name}>{l.name}</span>
      {l.company && <span className="block truncate text-xs font-normal text-fg-subtle" title={l.company}>{l.company}</span>}
    </span>
  );
}

function ListView({ stages, leads, onOpen, onMove }: {
  stages: Stage[];
  leads: Lead[];
  onOpen: (id: string) => void;
  onMove: (id: string, stageId: string) => void;
}) {
  const columns: Column<Lead>[] = [
    { key: "name", header: "Name", primary: true, cell: nameCell },
    { key: "score", header: "Score", align: "right", cell: (l) => (l.score != null ? <ScorePill score={l.score} /> : "—") },
    { key: "value", header: "Value", align: "right", cell: (l) => money(l.value_minor, l.currency) },
    { key: "prob", header: "Prob.", align: "right", cell: (l) => (l.probability != null ? `${l.probability}%` : "—") },
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

/** Lost leads: why, when, and a way back. */
function LostList({ leads, onOpen, onRestored }: { leads: Lead[]; onOpen: (id: string) => void; onRestored: () => void }) {
  const can = useCan();
  const restore = useAction((id: string) => api(`/crm/leads/${id}/restore`, { method: "POST" }),
    { success: "Restored", failure: "Couldn't restore it" });
  const columns: Column<Lead>[] = [
    { key: "name", header: "Name", primary: true, cell: nameCell },
    { key: "value", header: "Value", align: "right", cell: (l) => money(l.value_minor, l.currency) },
    { key: "reason", header: "Reason", cell: (l) => <span className="text-fg-muted">{l.lost_reason ?? "No reason given"}</span> },
    { key: "when", header: "Lost", align: "right", cell: (l) => <span className="text-xs text-fg-subtle">{l.lost_at ? formatDate(l.lost_at) : "—"}</span> },
  ];
  return (
    <DataTable
      columns={columns}
      rows={leads}
      rowKey={(l) => l.id}
      onRowClick={(l) => onOpen(l.id)}
      rowLabel={(l) => `Open ${l.name}`}
      caption="Lost leads"
      empty={<EmptyState title="No lost leads" hint="Leads you mark as lost show up here, with the reason." />}
      actions={(l) => can("crm.lead.update") ? (
        <Button size="sm" variant="subtle" disabled={restore.busy} aria-label={`Restore ${l.name}`}
                onClick={async () => { if ((await restore.run(l.id)) !== undefined) onRestored(); }}>
          Restore
        </Button>
      ) : null}
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
