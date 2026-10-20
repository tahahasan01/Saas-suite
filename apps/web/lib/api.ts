/* The one way the web app talks to the API.
 *
 * Same origin, always: every call goes to `/api/...`, which next.config
 * rewrites to the API (in production the proxy routes /api straight there). No
 * CORS, the session cookie is first-party, and middleware.ts can see it. There
 * is deliberately no other base URL and no localhost fallback (D-51).
 *
 * Every failure becomes an ApiError and runs through normalizeError() and one
 * ordered handler chain (see `chain` below), so a 401 always lands on the login
 * page, a dropped connection is retried with backoff, and a refused or broken
 * write always says so — no page has to remember to (D-51, F8). */

import type { paths, ResponseOf } from "@business-os/api-client";

export const API_BASE = "/api";

/** A link the browser follows itself (PDF, CSV export): the cookie rides along. */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/** `detail` may be a string, FastAPI's 422 list, or a structured object (e.g. the 409 duplicate payload). */
export class ApiError extends Error {
  /** Set once a handler in the chain has told the user (toast or redirect), so callers don't say it twice. */
  handled = false;
  constructor(public status: number, public detail: unknown, public requestId: string | null = null) {
    super(typeof detail === "string" ? detail : detailMessage(detail) ?? "Request failed");
  }
}

/** A request that never got an answer: offline, DNS, the API down, CORS. */
export class NetworkError extends Error {
  handled = false;
  constructor(cause?: unknown) {
    super("Can't reach the server. Check your connection and try again.");
    this.name = "NetworkError";
    this.cause = cause;
  }
}

export type ErrorKind =
  | "offline" | "unauthorized" | "forbidden" | "not_found" | "conflict"
  | "validation" | "rate_limited" | "server" | "bad_request" | "unknown";

export type NormalizedError = {
  kind: ErrorKind;
  status: number | null;
  /** Words a person can act on. */
  message: string;
  /** 422 field errors keyed by field name ("email", "items.0.qty"). */
  fields: Record<string, string>;
  detail: unknown;
  requestId: string | null;
  handled: boolean;
};

type FastApiIssue = { loc?: (string | number)[]; msg?: string };

function detailMessage(detail: unknown): string | null {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const first = detail[0] as FastApiIssue | undefined;
    return typeof first?.msg === "string" ? first.msg : null;
  }
  const d = detail as { message?: unknown } | null;
  return d && typeof d.message === "string" ? d.message : null;
}

function fieldsOf(detail: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(detail)) return out;
  for (const issue of detail as FastApiIssue[]) {
    // ["body", "items", 0, "qty"] -> "items.0.qty"; the first segment is where it came from.
    const loc = (issue.loc ?? []).slice(1).join(".");
    if (loc && typeof issue.msg === "string" && !(loc in out)) out[loc] = issue.msg;
  }
  return out;
}

function kindOf(status: number): ErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 422) return "validation";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server";
  if (status >= 400) return "bad_request";
  return "unknown";
}

const FALLBACK: Partial<Record<ErrorKind, string>> = {
  offline: "Can't reach the server. Check your connection and try again.",
  unauthorized: "Your session has ended. Sign in again.",
  forbidden: "You don't have permission to do that.",
  rate_limited: "Too many attempts. Wait a minute and try again.",
  server: "Something went wrong on our side. Please try again.",
};

/** Any thrown value -> one shape. Never throws. */
export function normalizeError(e: unknown, fallback = "Something went wrong. Check your connection and try again."): NormalizedError {
  if (e instanceof ApiError) {
    const kind = kindOf(e.status);
    return {
      kind, status: e.status, detail: e.detail, requestId: e.requestId, handled: e.handled,
      message: detailMessage(e.detail) ?? FALLBACK[kind] ?? fallback,
      fields: fieldsOf(e.detail),
    };
  }
  // fetch() rejects with a TypeError when no response arrived at all.
  if (e instanceof NetworkError || e instanceof TypeError) {
    return { kind: "offline", status: null, detail: null, requestId: null, fields: {},
             handled: e instanceof NetworkError && e.handled, message: FALLBACK.offline! };
  }
  return { kind: "unknown", status: null, detail: null, requestId: null, fields: {}, handled: false, message: fallback };
}

/** 422 field errors for a form: `fieldErrors(e).email` -> "value is not a valid email address". */
export function fieldErrors(e: unknown): Record<string, string> {
  return normalizeError(e).fields;
}

// ── The handler chain ────────────────────────────────────────────────────────

export type RequestOptions = RequestInit & {
  /** Let the chain tell the user about 403 / 5xx / offline (a toast). Defaults to
   *  true for writes and false for reads: a read's page shows its own error
   *  state, and a toast on top would say it twice. */
  notify?: boolean;
};

export type ErrorContext = { path: string; method: string; notify: boolean };
/** Returns true when it fully handled the error (the chain stops). */
export type ErrorHandler = (err: NormalizedError, ctx: ErrorContext) => boolean | void;

export type ErrorUi = {
  toast: (tone: "error" | "info", text: string) => void;
  /** Leave for the login page, remembering where we were. */
  toLogin: (next: string) => void;
  currentPath: () => string;
};

/** Pages that work signed-out; a 401 there is an answer, not an expired session. */
const PUBLIC = /^\/(login|signup|forgot|reset|verify|accept-invite|pricing)?(\/|$)/;

/** The order matters: the first handler that claims an error ends the chain. */
export function buildChain(ui: ErrorUi): ErrorHandler[] {
  return [
    // 1. 401 -> /login?next=… (not for the auth endpoints themselves: a wrong
    //    password is a 401 too, and /auth/me on a public page is a question).
    (err, ctx) => {
      if (err.kind !== "unauthorized" || ctx.path.startsWith("/auth/")) return false;
      const here = ui.currentPath();
      if (PUBLIC.test(here.split("?")[0])) return false;
      ui.toLogin(here);
      return true;
    },
    // 2. Offline. Reads were already retried with backoff (see request()).
    (err, ctx) => {
      if (err.kind !== "offline" || !ctx.notify) return false;
      ui.toast("error", err.message);
      return true;
    },
    // 3. Refused or broken: say so.
    (err, ctx) => {
      if ((err.kind !== "forbidden" && err.kind !== "server") || !ctx.notify) return false;
      const ref = err.requestId ? ` (ref ${err.requestId.slice(0, 8)})` : "";
      ui.toast("error", `${err.message}${ref}`);
      return true;
    },
    // 4. 422 -> nothing global: the form shows fieldErrors() next to its fields.
  ];
}

let chain: ErrorHandler[] = [];
let ui: ErrorUi | null = null;

/** Mounted once by <ApiErrorBridge> (it owns the toast and the router). */
export function installErrorUi(next: ErrorUi | null): void {
  ui = next;
  chain = next ? buildChain(next) : [];
}

function runChain(e: ApiError | NetworkError, ctx: ErrorContext): void {
  const n = normalizeError(e);
  for (const handler of chain) {
    if (handler(n, ctx)) { e.handled = true; return; }
  }
}

// ── Requests ─────────────────────────────────────────────────────────────────

/** Reads are safe to repeat, so a blip doesn't become an error page. */
const READ_RETRY_DELAYS_MS = [500, 1500, 4000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function send(path: string, init: RequestInit): Promise<Response> {
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  return fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers: { ...(isForm ? {} : { "Content-Type": "application/json" }), ...init.headers },
  });
}

/** Sends the session cookie; throws ApiError / NetworkError after the chain has run. */
async function request(path: string, opts: RequestOptions = {}): Promise<Response> {
  const { notify: notifyOpt, ...init } = opts;
  const method = (init.method ?? "GET").toUpperCase();
  const ctx: ErrorContext = { path, method, notify: notifyOpt ?? method !== "GET" };

  let res: Response;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await send(path, init);
      break;
    } catch (cause) {
      // An abort is the caller's choice, not a failure to report.
      if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
      const delay = method === "GET" ? READ_RETRY_DELAYS_MS[attempt] : undefined;
      if (delay === undefined) {
        const err = new NetworkError(cause);
        runChain(err, ctx);
        throw err;
      }
      if (attempt === 0) ui?.toast("info", "Connection lost. Retrying…");
      await sleep(delay);
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})); // a non-JSON error page has no detail; statusText stands in
    const err = new ApiError(res.status, body?.detail ?? res.statusText, res.headers.get("X-Request-ID"));
    runChain(err, ctx);
    throw err;
  }
  return res;
}

/** Typed fetch wrapper. Sends the session cookie; throws ApiError on failure. */
export async function api<T>(path: string, init?: RequestOptions): Promise<T> {
  const res = await request(path, init);
  return res.status === 204 ? (undefined as T) : res.json();
}

/** Paths that answer GET, straight from the generated OpenAPI schema. */
type GetPath = { [P in keyof paths]: paths[P] extends { get: object } ? P : never }[keyof paths];

/** A GET whose result type comes from the server's own schema
 *  (packages/api-client), so a backend change breaks the build, not the page.
 *  Static paths only for now; `api<T>()` with a hand-written T is the rest. */
export function apiGet<P extends GetPath>(path: P, init?: RequestOptions): Promise<ResponseOf<P, "get">> {
  return api<ResponseOf<P, "get">>(path, init);
}

/** One page of a list endpoint that reports its full size in `X-Total-Count`.
 *  Falls back to the page's own length when the header is missing (an older
 *  API), so callers never show a total smaller than what's on screen. */
export async function apiPage<T>(path: string, init?: RequestOptions): Promise<{ items: T[]; total: number }> {
  const res = await request(path, init);
  const items: T[] = await res.json();
  const header = Number(res.headers.get("X-Total-Count"));
  return { items, total: Number.isFinite(header) && header >= items.length ? header : items.length };
}
