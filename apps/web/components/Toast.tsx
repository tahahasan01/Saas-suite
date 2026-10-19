"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";

/* One quiet line that confirms an action or says why it failed. Before this,
 * failures were swallowed and a failed save looked exactly like a good one. */

type Tone = "success" | "error";
type Item = { id: number; tone: Tone; text: string };
type Api = { success: (text: string) => void; error: (text: string) => void };

const Ctx = createContext<Api | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const next = useRef(0);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback((tone: Tone, text: string) => {
    const id = ++next.current;
    setItems((xs) => [...xs.slice(-2), { id, tone, text }]); // at most three on screen
    setTimeout(() => dismiss(id), tone === "error" ? 7000 : 3500);
  }, [dismiss]);

  const api = useMemo<Api>(() => ({ success: (t) => push("success", t), error: (t) => push("error", t) }), [push]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-end sm:px-6"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-lg animate-fade-in"
          >
            {t.tone === "success"
              ? <CheckCircle2 size={18} className="mt-px shrink-0 text-success" aria-hidden />
              : <AlertTriangle size={18} className="mt-px shrink-0 text-danger" aria-hidden />}
            <span className="flex-1">{t.text}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="-m-1 grid h-7 w-7 place-items-center rounded text-fg-subtle hover:text-fg">
              <X size={14} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): Api {
  const api = useContext(Ctx);
  if (!api) throw new Error("useToast needs <ToastProvider> above it");
  return api;
}
