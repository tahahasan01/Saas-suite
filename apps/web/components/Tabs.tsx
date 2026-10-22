"use client";

import { useId, useRef } from "react";
import { nextIndex } from "@/lib/roving";
import { cx } from "@/components/ui";

export interface TabItem { id: string; label: React.ReactNode; disabled?: boolean }

/** WAI-ARIA tabs: one tab stop, arrows move and select (automatic
 *  activation), Home/End jump, RTL aware. `children` is the active panel. */
export function Tabs({ items, value, onChange, label, children, className }: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const active = Math.max(0, items.findIndex((t) => t.id === value));

  function onKeyDown(e: React.KeyboardEvent) {
    const dir = getComputedStyle(e.currentTarget).direction === "rtl" ? "rtl" : "ltr";
    const i = nextIndex(active, e.key, items.length, "horizontal", dir, (n) => !!items[n].disabled);
    if (i === null) return;
    e.preventDefault();
    onChange(items[i].id);
    refs.current[i]?.focus();
  }

  return (
    <div className={className}>
      <div role="tablist" aria-label={label} tabIndex={-1} onKeyDown={onKeyDown} className="flex flex-wrap gap-1.5">
        {items.map((t, i) => (
          <button key={t.id} ref={(el) => { refs.current[i] = el; }} type="button" role="tab"
                  id={`${base}-tab-${t.id}`} aria-controls={`${base}-panel`} aria-selected={i === active}
                  tabIndex={i === active ? 0 : -1} disabled={t.disabled} onClick={() => onChange(t.id)}
                  className={cx("min-h-9 rounded-full border px-3 text-sm font-medium transition-colors pointer-coarse:min-h-11",
                                i === active ? "border-brand bg-brand-subtle text-brand" : "border-line text-fg-muted hover:text-fg",
                                "disabled:opacity-50")}>
            {t.label}
          </button>
        ))}
      </div>
      {children !== undefined && (
        <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${items[active]?.id}`} className="mt-4">
          {children}
        </div>
      )}
    </div>
  );
}
