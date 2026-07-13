"use client";

import { useSession } from "@/lib/session";
import { Card } from "@/components/ui";
import { AiPrompt } from "@/components/AiPrompt";

export default function Dashboard() {
  const { me, t } = useSession();
  if (!me) return null;
  const enabled = me.entitlements.filter((e) => e.enabled).map((e) => e.section_key);

  return (
    <>
      <h1 className="mb-6 text-xl font-semibold">Welcome, {me.user.name}</h1>

      <AiPrompt />

      <div className="grid gap-4 sm:grid-cols-3">
        {enabled.length === 0 && <p className="text-sm text-fg-subtle">No sections enabled yet.</p>}
        {enabled.includes("crm") && <Stat label={t("leads")} value="0" />}
        {enabled.includes("pos") && <Stat label={t("products")} value="0" />}
        {enabled.includes("hrms") && <Stat label="Employees" value="0" />}
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-xs text-fg-subtle">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </Card>
  );
}
