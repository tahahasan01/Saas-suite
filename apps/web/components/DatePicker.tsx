"use client";

import { useId } from "react";
import { dayPKT } from "@/lib/dates";
import { cx, Input } from "@/components/ui";

const daysAgo = (n: number) => dayPKT(new Date(Date.now() - n * 864e5));

/** A business date (YYYY-MM-DD on Pakistan's clock): the browser's own date
 *  picker, which is accessible and localised on every phone, plus quick
 *  picks. Quick picks outside min/max are left out. */
export function DatePicker({ label, value, onChange, min, max, quick = true }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  quick?: boolean;
}) {
  const id = useId();
  const picks = [{ label: "Today", value: dayPKT() }, { label: "Yesterday", value: daysAgo(1) }]
    .filter((p) => (!min || p.value >= min) && (!max || p.value <= max));
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-fg-muted">{label}</label>
      <div className="flex items-center gap-1.5">
        <Input id={id} type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)}
               className="w-auto" />
        {quick && picks.map((p) => (
          <button key={p.label} type="button" onClick={() => onChange(p.value)} aria-pressed={value === p.value}
                  aria-label={`${label}: ${p.label.toLowerCase()}`}
                  className={cx("min-h-9 rounded-full border px-2.5 text-xs pointer-coarse:min-h-11",
                                value === p.value ? "border-brand bg-brand-subtle text-brand" : "border-line text-fg-muted hover:text-fg")}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
