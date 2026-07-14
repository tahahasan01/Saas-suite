"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Lead, Pipeline, Stage } from "@business-os/types";
import { api } from "@/lib/api";
import { money, moneyCompact } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Button, Input, Select } from "@/components/ui";
import { AddLeadForm } from "@/components/crm/AddLeadForm";
import { ImportCsv } from "@/components/ImportCsv";
import { LeadDrawer } from "@/components/crm/LeadDrawer";

type View = "board" | "list";
type Sort = "newest" | "value" | "score";

export default function CrmBoard() {
  const { t } = useSession();
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [view, setView] = useState<View>("board");
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [sort, setSort] = useState<Sort>("newest");

  const loadLeads = useCallback((pid: string) => {
    api<Lead[]>(`/crm/leads?pipeline_id=${pid}`).then(setLeads).catch(() => setLeads([]));
  }, []);

  useEffect(() => {
    api<Pipeline[]>("/crm/pipelines").then((ps) => {
      const p = ps[0] ?? null;
      setPipeline(p);
      if (p) loadLeads(p.id);
    });
  }, [loadLeads]);

  async function moveLead(id: string, stageId: string) {
    setLeads((cur) => cur.map((l) => (l.id === id ? { ...l, stage_id: stageId } : l))); // optimistic
    try {
      await api(`/crm/leads/${id}`, { method: "PATCH", body: JSON.stringify({ stage_id: stageId }) });
    } catch {
      if (pipeline) loadLeads(pipeline.id); // revert on failure
    }
  }

  // Sources that actually occur, not the theoretical enum — a filter offering
  // options with zero hits is noise.
  const sources = useMemo(() => [...new Set(leads.map((l) => l.source))].sort(), [leads]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = leads;
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

  if (!pipeline) return <p className="text-sm text-fg-subtle">Loading pipeline…</p>;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t("leads")}</h1>
        <div className="flex items-center gap-3">
          <ImportCsv path="/crm/leads" onDone={() => pipeline && loadLeads(pipeline.id)} />
          <Button onClick={() => setAdding(true)}>+ New {t("lead")}</Button>
        </div>
      </div>

      {/* Toolbar: filters act on both views, so switching views never changes
          which records you're looking at — only their shape. */}
      {/* Widths live on wrappers: the Input/Select base class is w-full, and
          Tailwind resolves the conflict by stylesheet order, so a w-56 on the
          element itself silently loses. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="w-56">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${t("leads").toLowerCase()}…`}
            aria-label="Search"
          />
        </div>
        {sources.length > 1 && (
          <div className="w-36">
            <Select value={source} onChange={(e) => setSource(e.target.value)}>
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
        {(q || source) && (
          <span className="text-xs text-fg-subtle">{shown.length} of {leads.length}</span>
        )}
        <ViewToggle view={view} onChange={setView} />
      </div>

      {leads.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-line py-16 text-center">
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-elevated text-xl">✦</div>
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
          onCreated={(l) => { setLeads((c) => [l, ...c]); setAdding(false); }}
        />
      )}
      {openLead && (
        <LeadDrawer
          leadId={openLead}
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
          role="tab"
          aria-selected={view === v}
          onClick={() => onChange(v)}
          className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
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
    <div className="flex gap-3 overflow-x-auto pb-4">
      {stages.map((stage) => {
        const cards = leads.filter((l) => l.stage_id === stage.id);
        const total = cards.reduce((sum, l) => sum + l.value_minor, 0);
        return (
          <div
            key={stage.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => dragId && onMove(dragId, stage.id)}
            className="flex w-64 shrink-0 flex-col rounded-lg border border-line bg-surface"
          >
            {/* Count and value live in the header — the column's worth is what
                you scan for, not something to hunt at the bottom. */}
            <div className="flex items-baseline justify-between border-b border-line p-3">
              <span className={`text-sm font-medium ${kindColor(stage.kind)}`}>{stage.name}</span>
              <span className="text-xs tabular-nums text-fg-subtle">
                {cards.length}{total > 0 && ` · ${moneyCompact(total)}`}
              </span>
            </div>
            <div className="min-h-16 flex-1 space-y-2 p-2">
              {cards.map((l) => (
                <LeadCard key={l.id} lead={l} onOpen={onOpen} setDragId={setDragId} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LeadCard({ lead: l, onOpen, setDragId }: {
  lead: Lead;
  onOpen: (id: string) => void;
  setDragId: (id: string | null) => void;
}) {
  return (
    <div
      draggable
      onDragStart={() => setDragId(l.id)}
      onDragEnd={() => setDragId(null)}
      onClick={() => onOpen(l.id)}
      className="cursor-pointer rounded-md border border-line bg-elevated p-3 transition-colors hover:border-brand/50"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium">{l.name}</p>
        {l.score != null && <ScorePill score={l.score} />}
      </div>
      {l.company && <p className="truncate text-xs text-fg-subtle">{l.company}</p>}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium tabular-nums">{money(l.value_minor, l.currency)}</span>
        <span className="flex items-center gap-1.5 text-[10px] text-fg-subtle">
          <span className="rounded bg-surface px-1.5 py-0.5">{l.source}</span>
          <span title={new Date(l.created_at).toLocaleDateString("en-PK")}>{age(l.created_at)}</span>
        </span>
      </div>
    </div>
  );
}

// ── List ────────────────────────────────────────────────────────────────────
function ListView({ stages, leads, onOpen, onMove }: {
  stages: Stage[];
  leads: Lead[];
  onOpen: (id: string) => void;
  onMove: (id: string, stageId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-fg-subtle">
            <th className="p-3">Name</th>
            <th className="p-3">Stage</th>
            <th className="p-3 text-right">Score</th>
            <th className="p-3 text-right">Value</th>
            <th className="p-3">Source</th>
            <th className="p-3">Contact</th>
            <th className="p-3 text-right">Age</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr
              key={l.id}
              className="cursor-pointer border-b border-line/60 transition-colors hover:bg-elevated/40"
              onClick={() => onOpen(l.id)}
            >
              <td className="p-3">
                <p className="font-medium">{l.name}</p>
                {l.company && <p className="text-xs text-fg-subtle">{l.company}</p>}
              </td>
              <td className="p-3" onClick={(e) => e.stopPropagation()}>
                {/* Stage changes without opening anything — the list view is
                    the fast lane, so the fastest action lives in it. */}
                <Select
                  value={l.stage_id}
                  onChange={(e) => onMove(l.id, e.target.value)}
                  className="w-36 py-1 text-xs"
                  aria-label={`Stage for ${l.name}`}
                >
                  {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </td>
              <td className="p-3 text-right">{l.score != null ? <ScorePill score={l.score} /> : "—"}</td>
              <td className="p-3 text-right tabular-nums">{money(l.value_minor, l.currency)}</td>
              <td className="p-3 text-fg-muted">{l.source}</td>
              <td className="p-3 text-xs text-fg-muted">
                {l.phone && <p>{l.phone}</p>}
                {l.email && <p className="text-fg-subtle">{l.email}</p>}
              </td>
              <td className="p-3 text-right text-xs tabular-nums text-fg-subtle">{age(l.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

function ScorePill({ score }: { score: number }) {
  const cls = score >= 70 ? "bg-success/15 text-success" : score >= 40 ? "bg-warning/15 text-warning" : "bg-elevated text-fg-muted";
  return (
    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${cls}`} title="Lead score">
      {score}
    </span>
  );
}
