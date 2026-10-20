"use client";

import { useEffect } from "react";
import { installErrorUi } from "@/lib/api";
import { useToast } from "@/components/Toast";

/** Gives lib/api's error handler chain its hands: the toast, and the way to
 *  the login page. Mounted once, inside <ToastProvider>. */
export function ApiErrorBridge() {
  const toast = useToast();
  useEffect(() => {
    installErrorUi({
      toast: (tone, text) => (tone === "info" ? toast.info(text) : toast.error(text)),
      // A full load, not router.replace: whatever the expired session left in
      // memory (cart, drafts, cached lists) shouldn't survive into the next one.
      toLogin: (next) => window.location.assign(`/login?next=${encodeURIComponent(next)}`),
      currentPath: () => window.location.pathname + window.location.search,
    });
    return () => installErrorUi(null);
  }, [toast]);
  return null;
}
