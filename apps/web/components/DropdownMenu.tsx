"use client";

import { useEffect, useId, useRef, useState } from "react";
import { nextIndex } from "@/lib/roving";
import { cx } from "@/components/ui";

export interface MenuItem { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean }

/** A menu button (WAI-ARIA APG): Enter, Space or ↓ opens on the first item,
 *  ↑ on the last; arrows and Home/End move; Escape or Tab closes and
 *  focus returns to the button; a click outside closes. */
export function DropdownMenu({ label, items, trigger, align = "end" }: {
  /** The button's accessible name, e.g. "Actions for R1-2026-000042". */
  label: string;
  items: MenuItem[];
  /** What the button shows; defaults to a ⋯ icon. */
  trigger?: React.ReactNode;
  align?: "start" | "end";
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const disabled = (i: number) => !!items[i]?.disabled;

  useEffect(() => { if (open) itemRefs.current[active]?.focus(); }, [open, active]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  function openAt(key: "Home" | "End") {
    const i = nextIndex(key === "Home" ? -1 : items.length, key, items.length, "vertical", "ltr", disabled);
    if (i === null) return;
    setActive(i);
    setOpen(true);
  }
  function close(focusButton = true) {
    setOpen(false);
    if (focusButton) button.current?.focus();
  }

  return (
    <div className="relative inline-block">
      <button ref={button} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
              aria-label={label}
              onClick={() => (open ? close() : openAt("Home"))}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); openAt("Home"); }
                if (e.key === "ArrowUp") { e.preventDefault(); openAt("End"); }
              }}
              className="inline-grid min-h-9 min-w-9 place-items-center rounded-lg border border-line px-2 text-fg-muted hover:text-fg pointer-coarse:min-h-11 pointer-coarse:min-w-11">
        {trigger ?? <span aria-hidden="true">⋯</span>}
      </button>
      {open && (
        <div ref={menu} id={id} role="menu" aria-label={label} tabIndex={-1}
             onKeyDown={(e) => {
               if (e.key === "Escape") { e.preventDefault(); close(); return; }
               if (e.key === "Tab") { close(false); return; }
               const i = nextIndex(active, e.key, items.length, "vertical", "ltr", disabled);
               if (i !== null) { e.preventDefault(); setActive(i); }
             }}
             className={cx("absolute top-full z-50 mt-1 min-w-44 rounded-xl border border-line bg-surface p-1 shadow-lg",
                           align === "end" ? "end-0" : "start-0")}>
          {items.map((it, i) => (
            <button key={it.label} ref={(el) => { itemRefs.current[i] = el; }} type="button" role="menuitem"
                    tabIndex={i === active ? 0 : -1} disabled={it.disabled}
                    onClick={() => { close(); it.onSelect(); }}
                    className={cx("block w-full rounded-lg px-3 py-2 text-start text-sm hover:bg-elevated focus:bg-elevated focus:outline-none",
                                  it.danger ? "text-danger" : "text-fg", "disabled:opacity-50")}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
