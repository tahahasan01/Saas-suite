"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { errorText, useAction } from "@/lib/useAction";
import { Button, Card, ErrorState, Field, Input, LoadingRows } from "@/components/ui";

type Rule = Schema<"AssignmentRuleOut">;
type Member = Schema<"PoolMemberOut">;
type Draft = { name: string; source: string; city: string; user_ids: string[] };

/** Lead assignment rules (wave D, C13): leads from a source or a city go, in
 *  turn, to chosen people from the lead pool. The first matching rule with
 *  someone free wins; otherwise the whole pool takes turns. */
export function AssignmentRules() {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [pool, setPool] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", source: "", city: "", user_ids: [] });

  const load = useCallback(() => {
    setError(null);
    api<Rule[]>("/crm/assignment/rules").then(setRules).catch((e) => setError(errorText(e, "Couldn't load the rules.")));
    api<Member[]>("/crm/assignment/pool").then(setPool).catch(() => setPool([]));
  }, []);
  useEffect(load, [load]);

  const put = useAction(
    (next: Draft[]) => api<Rule[]>("/crm/assignment/rules", { method: "PUT", body: JSON.stringify({
      rules: next.map((r) => ({ name: r.name, source: r.source || null, city: r.city || null, user_ids: r.user_ids })),
    }) }),
    { failure: "Couldn't save the rules" },
  );
  const asDrafts = (rs: Rule[]): Draft[] =>
    rs.map((r) => ({ name: r.name, source: r.source ?? "", city: r.city ?? "", user_ids: r.user_ids }));
  async function save(next: Draft[]) {
    const saved = await put.run(next);
    if (saved) setRules(saved as Rule[]);
    return !!saved;
  }
  const name = (id: string) => pool.find((m) => m.user_id === id)?.name ?? "someone";
  const toggle = (id: string) => setDraft({ ...draft, user_ids: draft.user_ids.includes(id)
    ? draft.user_ids.filter((x) => x !== id) : [...draft.user_ids, id] });

  return (
    <Card>
      <h2 className="mb-1 font-display text-base font-semibold">Assignment rules</h2>
      <p className="mb-3 text-sm text-fg-muted">
        Send leads from a source or a city to chosen people from the lead pool. The first rule that matches wins;
        leads no rule catches go round the whole pool.
      </p>
      {error ? <ErrorState message={error} onRetry={load} /> : !rules ? <LoadingRows rows={2} /> : (
        <ol className="mb-4 divide-y divide-line text-sm">
          {rules.length === 0 && <li className="py-2 text-fg-subtle">No rules: every lead goes round the pool.</li>}
          {rules.map((r, i) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="font-medium">{i + 1}. {r.name}</span>
                <span className="block text-xs text-fg-subtle">
                  {[r.source && `source “${r.source}”`, r.city && `city “${r.city}”`].filter(Boolean).join(" and ")}
                  {" → "}{r.user_ids.map(name).join(", ")}
                </span>
              </span>
              <Button size="sm" variant="ghost" disabled={put.busy}
                      onClick={() => save(asDrafts(rules).filter((_, j) => j !== i))}>
                Remove<span className="sr-only"> rule {r.name}</span>
              </Button>
            </li>
          ))}
        </ol>
      )}
      {pool.length === 0 ? (
        <p className="text-xs text-fg-subtle">Add people to the lead pool first; rules choose from them.</p>
      ) : (
        <form className="space-y-2" onSubmit={async (e) => {
          e.preventDefault();
          if (rules && await save([...asDrafts(rules), draft])) setDraft({ name: "", source: "", city: "", user_ids: [] });
        }}>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Rule name"><Input required maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <Field label="When the source is"><Input maxLength={60} placeholder="facebook page" value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} /></Field>
            <Field label="When the city is"><Input maxLength={80} placeholder="Lahore" value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} /></Field>
          </div>
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-fg-muted">Give them, in turn, to</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {pool.map((m) => (
                <label key={m.user_id} className="inline-flex items-center gap-1.5 text-sm pointer-coarse:min-h-11">
                  <input type="checkbox" checked={draft.user_ids.includes(m.user_id)} onChange={() => toggle(m.user_id)} />
                  {m.name}
                </label>
              ))}
            </div>
          </fieldset>
          {put.error && <p className="text-xs text-danger" role="alert">{put.error}</p>}
          <Button type="submit" size="sm" disabled={put.busy || !draft.user_ids.length || (!draft.source.trim() && !draft.city.trim())}>
            Add rule
          </Button>
        </form>
      )}
    </Card>
  );
}
