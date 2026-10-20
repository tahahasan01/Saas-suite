"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { HrmsSummary } from "@business-os/types";
import { api } from "@/lib/api";
import { errorText } from "@/lib/useAction";

/* The headcount tiles are fetched once per visit to HR, not on every tab
 * change (that refetched the same four numbers each click). Pages that change
 * them — a check-in, a leave decision, a new hire — call `refresh()`. */

type Ctx = { summary: HrmsSummary | null; error: string | null; refresh: () => void };
const SummaryCtx = createContext<Ctx>({ summary: null, error: null, refresh: () => {} });

export function HrmsSummaryProvider({ children }: { children: React.ReactNode }) {
  const [summary, setSummary] = useState<HrmsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    // The tiles are a convenience; if they fail the page below still works,
    // but the gap is explained rather than left blank.
    api<HrmsSummary>("/hrms/summary")
      .then((s) => { setSummary(s); setError(null); })
      .catch((e) => setError(errorText(e, "Couldn't load today's headcount.")));
  }, []);
  useEffect(refresh, [refresh]);
  return <SummaryCtx.Provider value={{ summary, error, refresh }}>{children}</SummaryCtx.Provider>;
}

export const useHrmsSummary = () => useContext(SummaryCtx);
