"use client";

import { useCallback, useEffect, useState } from "react";
import type { DisablePlanOut, EnablePlanOut, ModuleOut } from "@business-os/types";
import { api } from "@/lib/api";
import { Can, useCan } from "@/lib/can";
import { formatDate } from "@/lib/format";
import { moduleLabel } from "@/lib/modules";
import { useSession } from "@/lib/session";
import { errorText, useAction } from "@/lib/useAction";
import { Dialog } from "@/components/Dialog";
import { Badge, Button, Card, ErrorState, Field, Input, LoadingRows, Switch } from "@/components/ui";

type Pending =
  | { kind: "enable"; mod: ModuleOut; plan: EnablePlanOut }
  | { kind: "disable"; mod: ModuleOut; plan: DisablePlanOut }
  | { kind: "purge"; mod: ModuleOut };

const names = (keys: string[]) => keys.map((k) => moduleLabel(k)).join(", ");

/** Modules on and off (D-01, D-02). Every change is previewed first (the
 *  server's dry run): what else comes on, what else goes off, and whether the
 *  plan allows it. Turning a module off never deletes its data. */
export default function ModulesPage() {
  const { refresh } = useSession();
  const can = useCan();
  const [mods, setMods] = useState<ModuleOut[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setMods(await api<ModuleOut[]>("/platform/modules"));
    } catch (e) {
      setLoadError(errorText(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // The preview: a dry run that changes nothing.
  const preview = useAction(async (mod: ModuleOut, on: boolean) => {
    if (on) {
      const plan = await api<EnablePlanOut>(`/platform/modules/${mod.key}/enable?dry_run=true`, { method: "POST" });
      setPending({ kind: "enable", mod, plan });
    } else {
      const plan = await api<DisablePlanOut>(
        `/platform/modules/${mod.key}/disable?dry_run=true&cascade=true`, { method: "POST" });
      setPending({ kind: "disable", mod, plan });
    }
  }, { failure: "Couldn't check that change" });

  const apply = useAction(async (p: Pending) => {
    if (p.kind === "enable") {
      await api(`/platform/modules/${p.mod.key}/enable`, { method: "POST" });
    } else if (p.kind === "disable") {
      await api(`/platform/modules/${p.mod.key}/disable?cascade=${p.plan.blocked_by.length > 0}`, { method: "POST" });
    } else {
      await api(`/platform/modules/${p.mod.key}/purge`, { method: "POST", body: JSON.stringify({ confirm: confirmText }) });
    }
    setPending(null);
    setConfirmText("");
    await Promise.all([load(), refresh()]);   // the sidebar follows at once
    return p;
  }, {
    success: (r) => {
      const p = r as Pending;
      if (p.kind === "purge") return `${p.mod.label} data will be deleted in 7 days`;
      return `${p.mod.label} ${p.kind === "enable" ? "turned on" : "turned off"}`;
    },
    failure: "Couldn't change the module",
  });

  if (loadError) return <ErrorState message={`Couldn't load modules. ${loadError}`} onRetry={load} />;
  if (!mods) return <LoadingRows rows={4} label="Loading modules" />;

  const apps = mods.filter((m) => m.application);
  const included = mods.filter((m) => !m.application && !m.always_on);
  const manage = can("settings.modules.manage");
  const neededBy = (m: ModuleOut) =>
    mods.filter((o) => o.state === "enabled" && (o.depends.includes(m.key) || o.auto_enable.includes(m.key)))
      .map((o) => o.label);

  return (
    <div className="max-w-2xl space-y-6">
      <section className="space-y-3" aria-labelledby="apps-h">
        <div>
          <h2 id="apps-h" className="text-sm font-semibold">Apps</h2>
          <p className="text-sm text-fg-subtle">Your plan counts these. Turning one off hides it and keeps its data.</p>
        </div>
        {apps.map((m) => (
          <Card key={m.key} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{m.label}</p>
              <p className="text-xs text-fg-subtle">{m.description}</p>
              {m.pending_purge_at && (
                <p className="mt-1 text-xs text-danger">
                  Data will be deleted on {formatDate(m.pending_purge_at)}. Turn it on to cancel.
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {manage && m.state === "disabled" && m.purgeable && !m.pending_purge_at && (
                <Button variant="ghost" size="sm" onClick={() => setPending({ kind: "purge", mod: m })}>
                  Delete data…
                </Button>
              )}
              <Can perm="settings.modules.manage" fallback={<Badge tone={m.state === "enabled" ? "success" : "neutral"}>{m.state === "enabled" ? "On" : "Off"}</Badge>}>
                <Switch
                  checked={m.state === "enabled"}
                  label={`${m.label} module`}
                  disabled={preview.busy || apply.busy}
                  onChange={(next) => preview.run(m, next)}
                />
              </Can>
            </div>
          </Card>
        ))}
      </section>

      <section className="space-y-3" aria-labelledby="inc-h">
        <div>
          <h2 id="inc-h" className="text-sm font-semibold">Included with your apps</h2>
          <p className="text-sm text-fg-subtle">Free. They come on with the apps that need them.</p>
        </div>
        <Card className="divide-y divide-line p-0">
          {included.map((m) => {
            const by = neededBy(m);
            return (
              <div key={m.key} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{m.label}</p>
                  <p className="text-xs text-fg-subtle">
                    {m.state === "enabled" && by.length ? `Used by ${by.join(", ")}` : m.description}
                  </p>
                </div>
                <Badge tone={m.state === "enabled" ? "success" : "neutral"}>{m.state === "enabled" ? "On" : "Off"}</Badge>
              </div>
            );
          })}
        </Card>
      </section>

      <Dialog
        open={pending !== null}
        onOpenChange={(o) => { if (!o) { setPending(null); setConfirmText(""); } }}
        title={pending ? dialogTitle(pending) : ""}
        footer={pending && (
          <>
            <Button variant="ghost" onClick={() => { setPending(null); setConfirmText(""); }}>Cancel</Button>
            <Button
              variant={pending.kind === "enable" ? "primary" : "danger"}
              disabled={apply.busy
                || (pending.kind === "enable" && pending.plan.violations.length > 0)
                || (pending.kind === "purge" && confirmText.trim() !== `DELETE ${pending.mod.key}`)}
              onClick={() => apply.run(pending)}
            >
              {apply.busy ? "Working…" : confirmLabel(pending)}
            </Button>
          </>
        )}
      >
        {pending && <PlanBody pending={pending} confirmText={confirmText} setConfirmText={setConfirmText} />}
      </Dialog>
    </div>
  );
}

function dialogTitle(p: Pending): string {
  if (p.kind === "enable") return `Turn on ${p.mod.label}?`;
  if (p.kind === "disable") return `Turn off ${p.mod.label}?`;
  return `Delete ${p.mod.label} data?`;
}

function confirmLabel(p: Pending): string {
  if (p.kind === "enable") return "Turn on";
  if (p.kind === "disable") return p.plan.blocked_by.length ? "Turn them all off" : "Turn off";
  return "Schedule deletion";
}

function PlanBody({ pending: p, confirmText, setConfirmText }: {
  pending: Pending; confirmText: string; setConfirmText: (v: string) => void;
}) {
  if (p.kind === "enable") {
    const others = p.plan.to_enable.filter((k) => k !== p.mod.key);
    return (
      <div className="space-y-3 text-sm" data-testid="enable-plan">
        {others.length > 0
          ? <p>This also turns on: <strong>{names(others)}</strong>.</p>
          : <p>Nothing else needs to change.</p>}
        {p.plan.violations.map((v) => <p key={v} role="alert" className="text-danger">{v}</p>)}
      </div>
    );
  }
  if (p.kind === "disable") {
    const others = p.plan.to_disable.filter((k) => k !== p.mod.key);
    return (
      <div className="space-y-3 text-sm" data-testid="disable-plan">
        {p.plan.blocked_by.length > 0 && (
          <p role="alert" className="text-warning">
            {names(p.plan.blocked_by)} {p.plan.blocked_by.length === 1 ? "needs" : "need"} it, so {p.plan.blocked_by.length === 1 ? "it goes" : "they go"} off too.
          </p>
        )}
        {others.length > 0 && <p>Also turns off: <strong>{names(others)}</strong>.</p>}
        <p className="text-fg-muted">Nothing is deleted. Turn it back on any time and everything is where you left it.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3 text-sm">
      <p>All {p.mod.label} records will be permanently deleted <strong>7 days</strong> from now. Turning {p.mod.label} back on before then cancels it.</p>
      <Field label={`Type DELETE ${p.mod.key} to confirm`}>
        <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
      </Field>
    </div>
  );
}
