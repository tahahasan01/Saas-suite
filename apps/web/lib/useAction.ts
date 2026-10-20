"use client";

import { useCallback, useRef, useState } from "react";
import { normalizeError } from "@/lib/api";
import { useToast } from "@/components/Toast";

/** The reason a request failed, in words a person can act on. */
export function errorText(e: unknown, fallback = "Something went wrong. Check your connection and try again."): string {
  return normalizeError(e, fallback).message;
}

/** A body-less success (204) reads as `true`, never as the `undefined` of a failure. */
type Done<R> = [R] extends [undefined | void] ? true : R;

type Options = {
  /** Toast shown after it works, e.g. "Leave approved". Omit for silent success. */
  success?: string | ((result: unknown) => string);
  /** Prefix for the failure toast, e.g. "Couldn't approve leave". */
  failure?: string;
};

/**
 * Wraps a write so it can't run twice at once (a double tap posted two invoice
 * requests before), shows a busy state, and never fails silently.
 *
 *   const approve = useAction((id: string) => api(`/hrms/leave/${id}/approve`, { method: "POST" }),
 *                             { success: "Leave approved", failure: "Couldn't approve leave" });
 *   <Button disabled={approve.busy} onClick={() => approve.run(id)}>Approve</Button>
 *
 * `run` resolves to the result, or `undefined` if it failed or was already running.
 * A success with no body (204) resolves to `true` — it used to resolve to
 * `undefined` too, so a page couldn't tell a delete that worked from one that
 * failed, and never refreshed.
 */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>, opts: Options = {}) {
  const toast = useToast();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const run = useCallback(async (...args: A): Promise<Done<R> | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await fnRef.current(...args);
      const s = optsRef.current.success;
      if (s) toast.success(typeof s === "function" ? s(result) : s);
      return (result === undefined ? true : result) as Done<R>;
    } catch (e) {
      const err = normalizeError(e);
      const prefix = optsRef.current.failure;
      setError(err.message);
      // The API handler chain already toasted a 403/5xx/offline (or sent a 401 to login).
      if (!err.handled) toast.error(prefix ? `${prefix}: ${err.message}` : err.message);
      return undefined;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [toast]);

  return { run, busy, error, clearError: () => setError(null) };
}
