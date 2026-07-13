"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SECTION_LABELS, type Section } from "@business-os/types";
import { useSession } from "@/lib/session";
import { Wordmark } from "@/components/ui";

export function Sidebar() {
  const { me, t, logout } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  if (!me) return null;

  const enabled = me.entitlements.filter((e) => e.enabled).map((e) => e.section_key);
  const items: { href: string; label: string }[] = [
    { href: "/dashboard", label: "Dashboard" },
    ...enabled.map((s) => ({ href: `/${s}`, label: sectionLabel(s, t) })),
    { href: "/automations", label: "Automations" },
    { href: "/settings/team", label: "Settings" },
  ];
  const initials = me.tenant.name.slice(0, 2).toUpperCase();

  return (
    <aside className="flex h-full min-h-screen flex-col border-r border-line bg-surface">
      <div className="border-b border-line px-4 py-4">
        <Wordmark />
      </div>

      <nav className="flex-1 space-y-0.5 p-3 text-sm">
        {items.map((it) => {
          const active = it.href === "/settings/team" ? pathname.startsWith("/settings") : pathname === it.href;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex items-center rounded-lg px-3 py-2 font-medium transition-colors ${
                active ? "bg-brand-subtle text-brand" : "text-fg-muted hover:bg-elevated hover:text-fg"
              }`}
            >
              {it.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        <div className="mb-2 flex items-center gap-2 px-1">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-elevated text-xs font-semibold text-fg-muted">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{me.tenant.name}</p>
            <p className="truncate text-xs capitalize text-fg-subtle">{me.tenant.industry_type.replace("_", " ")}</p>
          </div>
        </div>
        <button
          onClick={() => logout().then(() => router.replace("/login"))}
          className="w-full rounded-lg px-3 py-1.5 text-left text-sm text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}

function sectionLabel(s: Section, t: (k: string) => string) {
  if (s === "crm") return `Sales / ${t("leads")}`;
  if (s === "pos") return `POS / ${t("products")}`;
  return SECTION_LABELS[s];
}
