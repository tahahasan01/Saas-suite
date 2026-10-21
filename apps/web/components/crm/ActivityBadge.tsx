"use client";

import { useEffect, useState } from "react";
import type { ActivitySummary } from "@business-os/types";
import { api } from "@/lib/api";

const REFRESH_MS = 60_000;
/** My Day pages fire this after a change so the badge doesn't wait a minute. */
export const ACTIVITIES_CHANGED = "bos:activities-changed";

export function announceActivitiesChanged() {
  window.dispatchEvent(new Event(ACTIVITIES_CHANGED));
}

/** Due-today plus overdue count for the "My day" nav item. Quiet on failure:
 *  a badge that errors is worse than no badge. */
export function ActivityBadge({ collapsed }: { collapsed: boolean }) {
  const [s, setS] = useState<ActivitySummary | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      api<ActivitySummary>("/activities/summary", { notify: false })
        .then((r) => alive && setS(r))
        .catch(() => alive && setS(null));
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    const onFocus = () => document.visibilityState === "visible" && load();
    window.addEventListener(ACTIVITIES_CHANGED, load);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener(ACTIVITIES_CHANGED, load);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  const due = s ? s.overdue + s.today : 0;
  if (!s || due === 0) return null;
  const label = s.overdue ? `${due} due, ${s.overdue} overdue` : `${due} due today`;
  return (
    <span
      data-testid="my-day-badge"
      title={label}
      className={`grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums leading-5 ${
        s.overdue ? "bg-danger text-white" : "bg-saffron text-frame"
      } ${collapsed ? "absolute end-1 top-0.5" : "ms-auto"}`}
    >
      {due}
      <span className="sr-only"> ({label})</span>
    </span>
  );
}
