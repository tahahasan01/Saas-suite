"use client";

import { useCallback, useEffect, useState } from "react";
import type { Lead, Pipeline, Stage } from "@business-os/types";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui";
import { AddLeadForm } from "@/components/crm/AddLeadForm";
import { LeadDrawer } from "@/components/crm/LeadDrawer";

export default function CrmBoard() {
  const { t } = useSession();
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

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

  if (!pipeline) return <p className="text-sm text-fg-subtle">Loading pipeline…</p>;

  const stageTotal = (s: Stage) =>
    leads.filter((l) => l.stage_id === s.id).reduce((sum, l) => sum + l.value_minor, 0);

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("leads")}</h1>
        <Button onClick={() => setAdding(true)}>+ New {t("lead")}</Button>
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
      ) : (
      <div className="flex gap-3 overflow-x-auto pb-4">
        {pipeline.stages.map((stage) => {
          const cards = leads.filter((l) => l.stage_id === stage.id);
          return (
            <div
              key={stage.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => dragId && moveLead(dragId, stage.id)}
              className="flex w-64 shrink-0 flex-col rounded-lg border border-line bg-surface"
            >
              <div className="flex items-center justify-between border-b border-line p-3">
                <span className={`text-sm font-medium ${kindColor(stage.kind)}`}>{stage.name}</span>
                <span className="text-xs text-fg-subtle">{cards.length}</span>
              </div>
              <div className="flex-1 space-y-2 p-2">
                {cards.map((l) => (
                  <div
                    key={l.id}
                    draggable
                    onDragStart={() => setDragId(l.id)}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => setOpenLead(l.id)}
                    className="cursor-pointer rounded-md border border-line bg-elevated p-3 hover:border-brand/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{l.name}</p>
                      {l.score != null && <ScorePill score={l.score} />}
                    </div>
                    {l.company && <p className="text-xs text-fg-subtle">{l.company}</p>}
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-fg-muted">{money(l.value_minor, l.currency)}</span>
                      <span className="rounded bg-elevated px-1.5 py-0.5 text-[10px] text-fg-muted">{l.source}</span>
                    </div>
                  </div>
                ))}
              </div>
              {stageTotal(stage) > 0 && (
                <div className="border-t border-line p-2 text-right text-xs text-fg-subtle">
                  {money(stageTotal(stage))}
                </div>
              )}
            </div>
          );
        })}
      </div>
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
