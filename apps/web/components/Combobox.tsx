"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { filterOptions, nextIndex } from "@/lib/roving";
import { cx, Input } from "@/components/ui";

export interface ComboOption { value: string; label: string; hint?: string }

/** A searchable select (ARIA 1.2 combobox + listbox): type to filter, ↑/↓
 *  move, Enter picks, Escape closes then clears. Focus stays in the input;
 *  the active option is announced through aria-activedescendant. */
export function Combobox({ label, options, value, onChange, placeholder, emptyText = "No matches", disabled }: {
  label: string;
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const selected = options.find((o) => o.value === value) ?? null;
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const shown = useMemo(() => (open && query !== selected?.label ? filterOptions(options, query) : options),
                        [options, query, open, selected]);

  useEffect(() => { if (!open) setQuery(selected?.label ?? ""); }, [selected, open]);
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function pick(o: ComboOption) {
    onChange(o.value);
    setQuery(o.label);
    setOpen(false);
  }

  return (
    <div className="relative">
      <label htmlFor={`${id}-input`} className="mb-1 block text-xs font-medium text-fg-muted">{label}</label>
      <Input id={`${id}-input`} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
             aria-activedescendant={open && shown[active] ? `${id}-opt-${active}` : undefined}
             value={query} placeholder={placeholder} disabled={disabled} autoComplete="off"
             onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
             onFocus={(e) => { e.currentTarget.select(); setOpen(true); }}
             onBlur={() => setOpen(false)}
             onKeyDown={(e) => {
               if (e.key === "Escape") {
                 if (open) { setOpen(false); } else { setQuery(""); onChange(""); }
                 e.preventDefault();
                 return;
               }
               if (e.key === "Enter" && open && shown[active]) { e.preventDefault(); pick(shown[active]); return; }
               if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { setOpen(true); return; }
               const i = nextIndex(active, e.key === "Home" || e.key === "End" ? "" : e.key, shown.length, "vertical");
               if (i !== null) { e.preventDefault(); setActive(i); }
             }} />
      {open && (
        <ul ref={list} id={`${id}-list`} role="listbox" aria-label={label}
            className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-surface p-1 shadow-lg">
          {shown.length === 0 && <li className="px-3 py-2 text-sm text-fg-muted">{emptyText}</li>}
          {/* Options never take focus: the keyboard works on the input (ARIA 1.2 combobox), so a click is enough here. */}
          {shown.map((o, i) => (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <li key={o.value} id={`${id}-opt-${i}`} data-index={i} role="option" aria-selected={o.value === value}
                onPointerDown={(e) => e.preventDefault()} onClick={() => pick(o)} onPointerMove={() => setActive(i)}
                className={cx("cursor-pointer rounded-lg px-3 py-2 text-sm", i === active && "bg-elevated",
                              o.value === value && "font-medium text-brand")}>
              {o.label}
              {o.hint && <span className="ms-2 text-xs text-fg-subtle">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
