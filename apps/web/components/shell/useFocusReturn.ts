"use client";

import { useCallback, useRef } from "react";

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
    prev.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);
  const onCloseAutoFocus = useCallback((e: Event) => {
    const el = prev.current;
    prev.current = null;
    if (el && el.isConnected) { e.preventDefault(); el.focus(); }
  }, []);
  return { onOpenAutoFocus, onCloseAutoFocus };
}
