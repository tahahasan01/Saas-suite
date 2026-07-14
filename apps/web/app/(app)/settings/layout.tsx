"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/session";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me } = useSession();
  const hasPos = !!me?.entitlements.some((e) => e.section_key === "pos" && e.enabled);

  const tabs = [
    { href: "/settings/team", label: "Team" },
    { href: "/settings/sections", label: "Sections" },
    { href: "/settings/billing", label: "Billing" },
    // FBR invoicing only exists because of the till.
    ...(hasPos ? [{ href: "/settings/fbr", label: "FBR invoicing" }] : []),
  ];

  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Settings</h1>
      <div className="mb-6 flex gap-1 border-b border-line">
        {tabs.map((tb) => (
          <Link
            key={tb.href}
            href={tb.href}
            // text-fg, not text-white: the app has a light theme now.
            className={`px-3 py-2 text-sm ${
              pathname === tb.href ? "border-b-2 border-brand text-fg" : "text-fg-muted hover:text-fg"
            }`}
          >
            {tb.label}
          </Link>
        ))}
      </div>
      {children}
    </>
  );
}
