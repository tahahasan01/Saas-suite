"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/settings/team", label: "Team" },
  { href: "/settings/sections", label: "Sections" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Settings</h1>
      <div className="mb-6 flex gap-1 border-b border-line">
        {tabs.map((tb) => (
          <Link
            key={tb.href}
            href={tb.href}
            className={`px-3 py-2 text-sm ${
              pathname === tb.href ? "border-b-2 border-brand text-white" : "text-fg-muted hover:text-fg"
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
