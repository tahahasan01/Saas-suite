"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SECTION_LABELS, type Section } from "@business-os/types";
import { useSession } from "@/lib/session";

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

  return (
    <aside className="flex flex-col border-r border-gray-800 bg-[#0e1420] p-4">
      <div className="mb-6">
        <p className="text-sm font-semibold">{me.tenant.name}</p>
        <p className="text-xs capitalize text-gray-500">{me.tenant.industry_type.replace("_", " ")}</p>
      </div>
      <nav className="flex-1 space-y-1 text-sm">
        {items.map((it) => {
          const active = it.href === "/settings/team" ? pathname.startsWith("/settings") : pathname === it.href;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`block rounded-md px-3 py-2 ${
                active ? "bg-indigo-600/20 text-indigo-300" : "text-gray-400 hover:bg-gray-800/50"
              }`}
            >
              {it.label}
            </Link>
          );
        })}
      </nav>
      <button
        onClick={() => logout().then(() => router.replace("/login"))}
        className="mt-4 text-left text-sm text-gray-400 hover:text-white"
      >
        Sign out
      </button>
    </aside>
  );
}

function sectionLabel(s: Section, t: (k: string) => string) {
  if (s === "crm") return `Sales / ${t("leads")}`;
  if (s === "pos") return `POS / ${t("products")}`;
  return SECTION_LABELS[s];
}
