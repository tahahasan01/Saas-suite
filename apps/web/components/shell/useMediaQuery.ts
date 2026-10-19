"use client";

import { useSyncExternalStore } from "react";

/** Live `matchMedia` result. On the server (and during hydration) it answers
 *  `serverValue`; the shell only renders after the session loads, so the real
 *  value is in place before anything that depends on it paints. */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
