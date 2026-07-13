"use client";

import { useState } from "react";
import { SECTION_LABELS, type EntitlementOut } from "@business-os/types";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Card } from "@/components/ui";

export default function SectionsPage() {
  const { me, refresh } = useSession();
  const [saving, setSaving] = useState<string | null>(null);

  if (!me) return null;

  async function toggle(section: string, enabled: boolean) {
    setSaving(section);
    try {
      await api(`/entitlements/${section}`, { method: "PATCH", body: JSON.stringify({ enabled }) });
      await refresh(); // updates the sidebar nav immediately
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="max-w-xl space-y-3">
      <p className="text-sm text-gray-500">Turn business modules on or off for your workspace.</p>
      {me.entitlements.map((e: EntitlementOut) => (
        <Card key={e.section_key} className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{SECTION_LABELS[e.section_key]}</p>
            <p className="text-xs text-gray-500">{e.enabled ? "Enabled" : "Disabled"}</p>
          </div>
          <button
            onClick={() => toggle(e.section_key, !e.enabled)}
            disabled={saving === e.section_key}
            className={`relative h-6 w-11 rounded-full transition ${e.enabled ? "bg-indigo-600" : "bg-gray-700"} disabled:opacity-50`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${e.enabled ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </Card>
      ))}
    </div>
  );
}
