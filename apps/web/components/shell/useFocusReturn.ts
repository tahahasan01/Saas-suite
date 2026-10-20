"use client";

import { useCallback, useRef } from "react";

const FOCUSABLE = 'button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"]), [contenteditable=""], [contenteditable="true"]';

/* Safari (and iOS browsers, all WebKit) don't focus a button when it's clicked
 * or tapped, so at the moment an overlay opens `document.activeElement` is
 * <body> and there's no opener to hand focus back to. Remember the focusable
 * element under the last pointer press instead. Capture phase, so it's
 * recorded before any click handler opens something. One listener for the
 * whole app; the flag survives hot reloads re-running this module. */
let lastPressed: HTMLElement | null = null;
if (typeof document !== "undefined") {
  const w = window as Window & { __openerListener?: boolean };
  if (!w.__openerListener) {
    w.__openerListener = true;
    document.addEventListener(
      "pointerdown",
      (e) => {
        const hit = e.target instanceof Element ? e.target.closest<HTMLElement>(FOCUSABLE) : null;
        lastPressed = hit && !hit.matches(":disabled") ? hit : null;
      },
      true,
    );
  }
}

/** The element that opened an overlay: what has focus, or — when nothing does
 *  (a mouse or touch press in WebKit leaves focus on <body>) — the control
 *  that was last pressed. Call it before the overlay moves focus inside. */
export function openerElement(): HTMLElement | null {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) return active;
  return lastPressed?.isConnected ? lastPressed : null;
}

/** Hands focus back to whatever had it when an overlay opened.
 *
 *  Radix only returns focus to its own <Trigger>; an overlay opened from a
 *  plain button (or Ctrl+K) closed with focus dropped on <body>, so a keyboard
 *  user started again from the top of the page. For raw Radix Content only
 *  (the command palette); our Dialog and Sheet already do this themselves. */
export function useFocusReturn() {
  const prev = useRef<HTMLElement | null>(null);
  const onOpenAutoFocus = useCallback(() => {
    // Runs before Radix moves focus inside, so this is still the opener.
    prev.current = openerElement();
  }, []);
  const onCloseAutoFocus = useCallback((e: Event) => {
    const el = prev.current;
    prev.current = null;
    if (el && el.isConnected) { e.preventDefault(); el.focus(); }
  }, []);
  return { onOpenAutoFocus, onCloseAutoFocus };
}
