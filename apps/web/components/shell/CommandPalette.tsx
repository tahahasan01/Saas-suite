"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";
import { useSession } from "@/lib/session";
import { MODULES, PORTAL_MODULES } from "@/lib/modules";

interface Entry { href: string; label: string; module: string; color: string }

/** Ctrl+K / ⌘K: jump to any screen the user can open. Arrow keys move,
 *  Enter opens, Escape closes. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, t } = useSession();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries = useMemo<Entry[]>(() => {
    if (!me) return [];
    const enabled = new Set(me.entitlements.filter((e) => e.enabled).map((e) => e.section_key));
    const out: Entry[] = [];
    for (const m of me.employee_portal ? PORTAL_MODULES : MODULES) {
      if (m.requires && !enabled.has(m.requires)) continue;
      const moduleLabel = m.label(t);
      const tabs = (m.tabs ?? []).filter((tb) => !tb.requires || enabled.has(tb.requires));
      if (tabs.length === 0) out.push({ href: m.href, label: moduleLabel, module: moduleLabel, color: m.color });
      for (const tb of tabs) out.push({ href: tb.href, label: tb.label, module: moduleLabel, color: m.color });
    }
    return out;
  }, [me, t]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((e) => `${e.label} ${e.module}`.toLowerCase().includes(needle));
  }, [entries, q]);

  useEffect(() => {
    if (open) { setQ(""); setIndex(0); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);
  useEffect(() => setIndex(0), [q]);

  if (!open) return null;

  function go(e: Entry | undefined) {
    if (!e) return;
    onClose();
    router.push(e.href);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Go to a screen"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); onClose(); }
          else if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, results.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); go(results[index]); }
        }}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={18} className="text-fg-subtle" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Go to… (products, payroll, team)"
            className="h-14 w-full bg-transparent text-[15px] outline-none placeholder:text-fg-subtle"
            aria-label="Search screens"
          />
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-fg-subtle">No screen matches “{q}”.</li>}
          {results.map((r, i) => (
            <li key={r.href} role="option" aria-selected={i === index}>
              <button
                onMouseEnter={() => setIndex(i)}
                onClick={() => go(r)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${
                  i === index ? "bg-elevated" : ""
                }`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `var(${r.color})` }} aria-hidden />
                <span className="font-medium">{r.label}</span>
                {r.label !== r.module && <span className="text-fg-subtle">in {r.module}</span>}
                {i === index && <CornerDownLeft size={15} className="ml-auto text-fg-subtle" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
