"use client";

import { cloneElement, isValidElement, useEffect, useId, useState } from "react";

/** A short hint for an icon or a terse control, on hover and keyboard focus
 *  (WCAG 1.4.13: it stays while hovered, Escape dismisses it). It only adds
 *  a description: the control still needs its own accessible name. */
export function Tooltip({ content, children, side = "top" }: {
  content: string;
  children: React.ReactElement<{ "aria-describedby"?: string }>;
  side?: "top" | "bottom";
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);

  const child = isValidElement(children)
    ? cloneElement(children, { "aria-describedby": open ? id : children.props["aria-describedby"] })
    : children;

  return (
    <span className="relative inline-flex" onPointerEnter={() => setOpen(true)} onPointerLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
      {child}
      {open && (
        <span role="tooltip" id={id}
              className={`pointer-events-none absolute start-1/2 z-50 w-max max-w-60 -translate-x-1/2 rounded-md bg-fg px-2 py-1 text-xs text-surface shadow rtl:translate-x-1/2 ${side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"}`}>
          {content}
        </span>
      )}
    </span>
  );
}
