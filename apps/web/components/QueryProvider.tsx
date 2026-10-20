"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** One QueryClient per browser tab (per request on the server), created lazily
 *  so React's double render in dev doesn't make two. Defaults:
 *   - 30 s fresh: switching tabs in the shell doesn't refetch everything;
 *   - no query retries: lib/api already retries reads across a dropped
 *     connection with backoff, and retrying a 4xx would only repeat the "no";
 *   - no refetch on window focus: on a till, data moving under the cashier's
 *     hands after alt-tab is worse than a second-old number. */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () => new QueryClient({
      defaultOptions: {
        queries: { staleTime: 30_000, retry: false, refetchOnWindowFocus: false },
        mutations: { retry: false },
      },
    }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
