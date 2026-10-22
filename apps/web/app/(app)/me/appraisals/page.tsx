"use client";

import { useCallback, useEffect, useState } from "react";
import type { Schema } from "@business-os/api-client";
import { api } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { errorText } from "@/lib/useAction";
import { APPRAISAL_STATUS, AppraisalForm } from "@/components/hrms/AppraisalForm";
import { Badge, Card, EmptyState, ErrorState, LoadingRows } from "@/components/ui";

type Appraisal = Schema<"AppraisalOut">;

/** My appraisals and the ones I review as a manager (wave C, H26). */
export default function MyAppraisals() {
  const [mine, setMine] = useState<Appraisal[] | null>(null);
  const [reviews, setReviews] = useState<Appraisal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api<Appraisal[]>("/me/appraisals").then(setMine).catch((e) => setError(errorText(e)));
    api<Appraisal[]>("/me/reviews", { notify: false }).then(setReviews).catch(() => setReviews([]));
  }, []);
  useEffect(load, [load]);
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (mine === null) return <LoadingRows rows={2} label="Loading your appraisals" />;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {reviews.length > 0 && (
        <section aria-labelledby="to-review" className="space-y-3">
          <h2 id="to-review" className="font-display text-lg font-semibold">To review</h2>
          {reviews.map((a) => (
            <Card key={a.id} className="space-y-2">
              <h3 className="font-semibold">{a.employee_name} <span className="text-sm font-normal text-fg-muted">· {a.cycle_name}</span></h3>
              {a.self_comment && <p className="text-sm text-fg-muted">Their comment: “{a.self_comment}”</p>}
              <AppraisalForm appraisal={a} side="manager" url={`/me/reviews/${a.id}`} onSaved={load} />
            </Card>
          ))}
        </section>
      )}
      <section aria-labelledby="mine" className="space-y-3">
        <h2 id="mine" className="font-display text-lg font-semibold">My appraisals</h2>
        {mine.length === 0 ? <EmptyState title="No appraisals yet" hint="When HR starts a review, it shows here for you to rate yourself." /> : mine.map((a) => (
          <Card key={a.id} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{a.cycle_name}</h3>
              <span className="flex items-center gap-2">
                {a.score != null && <span className="font-medium tabular-nums">{a.score.toFixed(2)} / 5</span>}
                <Badge tone={a.status === "done" ? "success" : "brand"}>{APPRAISAL_STATUS[a.status]}</Badge>
              </span>
            </div>
            <p className="text-xs text-fg-muted">{formatDay(a.period_start)} – {formatDay(a.period_end)}{a.reviewer_name ? ` · reviewed by ${a.reviewer_name}` : ""}</p>
            {a.status === "self_review" ? (
              <AppraisalForm appraisal={a} side="self" url={`/me/appraisals/${a.id}/self`} onSaved={load} />
            ) : (
              <ul className="divide-y divide-line text-sm" aria-label={`Ratings in ${a.cycle_name}`}>
                {(a.ratings ?? []).map((r) => (
                  <li key={r.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                    <span>{r.title} <span className="text-xs text-fg-muted">({r.weight}%)</span></span>
                    <span className="text-fg-muted">mine {r.self_rating ?? "—"}{a.status === "done" ? ` · manager ${r.manager_rating ?? "—"}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
            {a.status === "done" && a.manager_comment && <p className="text-sm">Manager: “{a.manager_comment}”</p>}
          </Card>
        ))}
      </section>
    </div>
  );
}
