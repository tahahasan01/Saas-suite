"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/ui";

/* One confirmation dialog for the whole app, asked for like window.confirm():
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title: `Delete “${rule.name}”?`, confirmLabel: "Delete", tone: "danger",
 *                       run: () => remove.run(rule) })) load();
 *
 * With `run`, the dialog stays open and busy while it works, and stays open if
 * it fails (run resolves to undefined — useAction's failure value — and has
 * already said why), so the person can retry or cancel. Without `run` it just
 * answers yes or no. Seven pages each carried their own copy of this before. */

export type ConfirmOptions = {
  title: string;
  /** One plain line under the title; screen readers announce it with the title. */
  description?: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  /** Shown on the button while `run` works, e.g. "Deleting…". */
  busyLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  run?: () => Promise<unknown>;
};

type Ask = (opts: ConfirmOptions) => Promise<boolean>;

const Ctx = createContext<Ask | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [busy, setBusy] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpts(null);
    setBusy(false);
  }, []);

  const ask = useCallback<Ask>((next) => {
    resolver.current?.(false); // a second ask replaces an unanswered one
    setOpts(next);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  async function accept() {
    if (!opts?.run) return settle(true);
    setBusy(true);
    const result = await opts.run();
    if (result === undefined) setBusy(false); // failed: stay open, the toast said why
    else settle(true);
  }

  return (
    <Ctx.Provider value={ask}>
      {children}
      <Dialog
        open={opts !== null}
        onOpenChange={(o) => { if (!o && !busy) settle(false); }}
        size="sm"
        title={opts?.title ?? ""}
        description={opts?.description}
        footer={opts && (
          <>
            <Button variant="ghost" disabled={busy} onClick={() => settle(false)}>{opts.cancelLabel ?? "Cancel"}</Button>
            <Button variant={opts.tone === "danger" ? "danger" : "primary"} disabled={busy} onClick={() => void accept()}>
              {busy ? (opts.busyLabel ?? "Working…") : (opts.confirmLabel ?? "Confirm")}
            </Button>
          </>
        )}
      >
        {opts?.body && <div className="text-sm text-fg-muted">{opts.body}</div>}
      </Dialog>
    </Ctx.Provider>
  );
}

export function useConfirm(): Ask {
  const ask = useContext(Ctx);
  if (!ask) throw new Error("useConfirm needs <ConfirmProvider> above it");
  return ask;
}
