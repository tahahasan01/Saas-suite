"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { MeResponse, TerminologyResponse } from "@business-os/types";
import { api } from "./api";

interface SessionState {
  me: MeResponse | null;
  loading: boolean;
  /** Resolve an industry terminology key to its label (falls back to the key). */
  t: (key: string) => string;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [meRes, term] = await Promise.all([
        api<MeResponse>("/auth/me"),
        api<TerminologyResponse>("/terminology").catch(() => null),
      ]);
      setMe(meRes);
      setLabels(term?.labels ?? {});
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    setMe(null);
  }, []);

  const t = useCallback((key: string) => labels[key] ?? key, [labels]);

  return <Ctx.Provider value={{ me, loading, t, refresh, logout }}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
