"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SECTION_LABELS, type Section } from "@business-os/types";
import { useSession } from "@/lib/session";
import { Card } from "@/components/ui";

export default function Dashboard() {
  const { me, loading, t, logout } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [me, loading, router]);

  if (loading || !me) return <main className="grid min-h-screen place-items-center text-gray-500">Loading…</main>;

  const enabled = me.entitlements.filter((e) => e.enabled).map((e) => e.section_key);

  return (
    <div className="grid min-h-screen grid-cols-[220px_1fr]">
      <aside className="border-r border-gray-800 bg-[#0e1420] p-4">
        <div className="mb-6">
          <p className="text-sm font-semibold">{me.tenant.name}</p>
          <p className="text-xs text-gray-500 capitalize">{me.tenant.industry_type.replace("_", " ")}</p>
        </div>
        <nav className="space-y-1 text-sm">
          <NavItem label="Dashboard" active />
          {enabled.map((s) => (
            <NavItem key={s} label={sectionNav(s, t)} />
          ))}
          <NavItem label="Automations" />
          <NavItem label="Settings" />
        </nav>
      </aside>

      <main className="p-6">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Welcome, {me.user.name}</h1>
          <button onClick={() => logout().then(() => router.replace("/login"))} className="text-sm text-gray-400 hover:text-white">
            Sign out
          </button>
        </header>

        {/* AI prompt box (Phase 1 wires this to the AI Gateway) */}
        <Card className="mb-6">
          <input
            disabled
            placeholder={`Ask anything… e.g. "how many ${t("leads").toLowerCase()} do I have?"`}
            className="w-full bg-transparent text-sm outline-none placeholder:text-gray-600"
          />
        </Card>

        <div className="grid gap-4 sm:grid-cols-3">
          {enabled.length === 0 && <p className="text-sm text-gray-500">No sections enabled yet.</p>}
          {enabled.includes("crm") && <Stat label={t("leads")} value="0" />}
          {enabled.includes("pos") && <Stat label={t("products")} value="0" />}
          {enabled.includes("hrms") && <Stat label="Employees" value="0" />}
        </div>
      </main>
    </div>
  );
}

function sectionNav(s: Section, t: (k: string) => string) {
  if (s === "crm") return `Sales / ${t("leads")}`;
  if (s === "pos") return `POS / ${t("products")}`;
  return SECTION_LABELS[s];
}

function NavItem({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <div className={`rounded-md px-3 py-2 ${active ? "bg-indigo-600/20 text-indigo-300" : "text-gray-400 hover:bg-gray-800/50"}`}>
      {label}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </Card>
  );
}
