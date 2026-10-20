"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as R from "@radix-ui/react-dialog";
import { CornerDownLeft, Search } from "lucide-react";
import { useSession } from "@/lib/session";
import { MODULES, PORTAL_MODULES } from "@/lib/modules";
import { useFocusReturn } from "./useFocusReturn";

interface Entry { href: string; label: string; module: string; color: string }

/** Ctrl+K / ⌘K: jump to any screen the user can open. Arrow keys move,
 *  Enter opens, Escape closes.
 *
 *  Built on the Radix dialog primitives directly (not our Dialog, whose
 *  header and padding don't fit a search box) for the focus trap, focus
 *  return, Escape and scroll lock. Focus stays in the input the whole time;
 *  the list is a combobox popup whose current option is announced through
 *  aria-activedescendant. z-[80]: above dialogs, so it works from inside one. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, t } = useSession();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const uid = useId();
  const listId = `${uid}-list`;
  const optionId = (i: number) => `${uid}-opt-${i}`;
  const focusReturn = useFocusReturn();

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
    if (open) { setQ(""); setIndex(0); }
  }, [open]);
  useEffect(() => setIndex(0), [q]);

  // Keep the highlighted option visible while arrowing through a long list.
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  function go(e: Entry | undefined) {
    if (!e) return;
    onClose();
    router.push(e.href);
  }

  const active = results[index] ? optionId(index) : undefined;

  return (
    <R.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <R.Portal>
        <R.Overlay className="fixed inset-0 z-[80] bg-black/40 data-[state=open]:animate-fade-in" />
        <R.Content
          aria-describedby={undefined}
          {...focusReturn}
          className="fixed inset-x-4 top-[12dvh] z-[80] mx-auto w-auto max-w-lg overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl outline-none"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); go(results[index]); }
          }}
        >
          <R.Title className="sr-only">Go to a screen</R.Title>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search size={18} className="shrink-0 text-fg-subtle" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Go to… (products, payroll, team)"
              // 16px on phones so iOS doesn't zoom into the field.
              className="h-14 w-full bg-transparent text-base outline-none placeholder:text-fg-subtle sm:text-[15px]"
              // Inline: the global :focus-visible ring is unlayered and beats the
              // outline-none utility; here the open palette itself shows focus.
              style={{ outline: "none" }}
              aria-label="Search screens"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={active}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <ul ref={listRef} id={listId} role="listbox" aria-label="Screens" className="max-h-[min(50dvh,24rem)] overflow-y-auto overscroll-contain p-2">
            {results.map((r, i) => (
              // Keyboard lives on the combobox input (arrows + Enter, aria-activedescendant);
              // the click is the pointer path to the same option.
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events
              <li
                key={r.href}
                id={optionId(i)}
                data-index={i}
                role="option"
                aria-selected={i === index}
                onMouseMove={() => i !== index && setIndex(i)}
                onClick={() => go(r)}
                className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm pointer-coarse:min-h-11 ${
                  i === index ? "bg-elevated" : ""
                }`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `var(${r.color})` }} aria-hidden />
                <span className="font-medium">{r.label}</span>
                {r.label !== r.module && <span className="truncate text-fg-subtle">in {r.module}</span>}
                {i === index && <CornerDownLeft size={15} className="ml-auto shrink-0 text-fg-subtle" aria-hidden />}
              </li>
            ))}
          </ul>
          {results.length === 0 && (
            <p role="status" className="px-3 pb-6 pt-4 text-center text-sm text-fg-subtle">No screen matches “{q}”.</p>
          )}
        </R.Content>
      </R.Portal>
    </R.Root>
  );
}
