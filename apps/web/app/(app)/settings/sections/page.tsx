"use client";

import { SECTION_LABELS, type EntitlementOut } from "@business-os/types";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useAction } from "@/lib/useAction";
import { Card, Switch } from "@/components/ui";

export default function SectionsPage() {
  const { me, refresh } = useSession();

  // A refusal (e.g. the plan's module limit) used to vanish silently and the
  // switch just didn't move; useAction shows the server's reason as a toast.
  const toggle = useAction(
    async (section: string, enabled: boolean) => {
      await api(`/entitlements/${section}`, { method: "PATCH", body: JSON.stringify({ enabled }) });
      await refresh(); // updates the sidebar nav immediately
      return { section, enabled };
    },
    {
      success: (r) => {
        const { section, enabled } = r as { section: keyof typeof SECTION_LABELS; enabled: boolean };
        return `${SECTION_LABELS[section]} ${enabled ? "turned on" : "turned off"}`;
      },
      failure: "Couldn't change the module",
    },
  );

  if (!me) return null;

  return (
    <div className="max-w-xl space-y-3">
      <p className="text-sm text-fg-subtle">Turn business modules on or off for your workspace.</p>
      {me.entitlements.map((e: EntitlementOut) => {
        const label = SECTION_LABELS[e.section_key];
        return (
          <Card key={e.section_key} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-fg-subtle">{e.enabled ? "On" : "Off"}</p>
            </div>
            <Switch
              checked={e.enabled}
              label={`${label} module`}
              disabled={toggle.busy}
              onChange={(next) => toggle.run(e.section_key, next)}
            />
          </Card>
        );
      })}
    </div>
  );
}
