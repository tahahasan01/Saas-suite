"use client";

import { useEffect, useRef } from "react";

/* Keyboard shortcuts with scopes (F5).
 *
 *   useHotkeyScope("pos");                          // while the till is mounted
 *   useHotkey("F7", () => charge(), { scope: "pos" });
 *   useHotkey("mod+k", openPalette);                // scope "global": always on
 *
 * One window listener serves every shortcut, instead of each page adding its
 * own and racing the others. A shortcut in a named scope only fires while that
 * scope is active, so the till's F-keys can't leak into another page that stays
 * mounted, and two pages can reuse a key. When several handlers match one key,
 * the most recently registered wins. Handlers are read through a ref, so they
 * are never stale and registering doesn't churn on every render. */

export type HotkeyOptions = {
  /** "global" (default) or a scope name made active with useHotkeyScope. */
  scope?: string;
  enabled?: boolean;
  /** Default true: the browser's own meaning (F1 help, F6 address bar, F7 caret browsing) is cancelled. */
  preventDefault?: boolean;
};

type Combo = { key: string; mod: boolean; shift: boolean; alt: boolean };

/** "mod+k" -> { key: "k", mod: true }. `mod` is Ctrl, or ⌘ on a Mac. */
export function parseCombo(combo: string): Combo {
  const parts = combo.toLowerCase().split("+").map((p) => p.trim());
  const key = parts.pop() ?? "";
  return { key, mod: parts.includes("mod") || parts.includes("ctrl"), shift: parts.includes("shift"), alt: parts.includes("alt") };
}

export function matches(combo: string, e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">): boolean {
  const c = parseCombo(combo);
  return e.key.toLowerCase() === c.key
    && (e.ctrlKey || e.metaKey) === c.mod
    && e.altKey === c.alt
    // Shift only matters when asked for: "?" arrives with Shift held anyway.
    && (!c.shift || e.shiftKey);
}

type Entry = { combos: string[]; scope: string; opts: HotkeyOptions; handler: { current: (e: KeyboardEvent) => void } };

const entries: Entry[] = [];
const activeScopes = new Map<string, number>(); // ref-counted: two mounted users of a scope keep it on
let listening = false;

function onKeyDown(e: KeyboardEvent) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.opts.enabled === false) continue;
    if (entry.scope !== "global" && !activeScopes.get(entry.scope)) continue;
    if (!entry.combos.some((c) => matches(c, e))) continue;
    if (entry.opts.preventDefault !== false) e.preventDefault();
    entry.handler.current(e);
    return;
  }
}

function ensureListener() {
  if (!listening && typeof window !== "undefined") {
    window.addEventListener("keydown", onKeyDown);
    listening = true;
  }
}

/** Turns a scope on while the calling component is mounted. */
export function useHotkeyScope(scope: string, active = true) {
  useEffect(() => {
    if (!active) return;
    activeScopes.set(scope, (activeScopes.get(scope) ?? 0) + 1);
    return () => {
      const n = (activeScopes.get(scope) ?? 1) - 1;
      if (n <= 0) activeScopes.delete(scope);
      else activeScopes.set(scope, n);
    };
  }, [scope, active]);
}

export function useHotkey(keys: string | string[], handler: (e: KeyboardEvent) => void, opts: HotkeyOptions = {}) {
  const ref = useRef(handler);
  ref.current = handler;
  const combos = Array.isArray(keys) ? keys : [keys];
  const id = combos.join(",");
  const { scope = "global", enabled = true, preventDefault = true } = opts;
  useEffect(() => {
    ensureListener();
    const entry: Entry = { combos: id.split(","), scope, opts: { enabled, preventDefault }, handler: ref };
    entries.push(entry);
    return () => {
      const i = entries.indexOf(entry);
      if (i >= 0) entries.splice(i, 1);
    };
  }, [id, scope, enabled, preventDefault]);
}

/** For tests: the scopes that are on right now. */
export function activeHotkeyScopes(): string[] {
  return [...activeScopes.keys()];
}
