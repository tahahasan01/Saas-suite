const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Sends the session cookie; throws ApiError on failure. */
async function request(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.detail ?? res.statusText);
  }
  return res;
}

/** Typed fetch wrapper. Sends the session cookie; throws ApiError on failure. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await request(path, init);
  return res.status === 204 ? (undefined as T) : res.json();
}

/** One page of a list endpoint that reports its full size in `X-Total-Count`.
 *  Falls back to the page's own length when the header is missing (an older
 *  API), so callers never show a total smaller than what's on screen. */
export async function apiPage<T>(path: string, init?: RequestInit): Promise<{ items: T[]; total: number }> {
  const res = await request(path, init);
  const items: T[] = await res.json();
  const header = Number(res.headers.get("X-Total-Count"));
  return { items, total: Number.isFinite(header) && header >= items.length ? header : items.length };
}

/** `detail` may be a string or a structured object (e.g. the 409 duplicate payload). */
export class ApiError extends Error {
  constructor(public status: number, public detail: unknown) {
    super(typeof detail === "string" ? detail : "Request failed");
  }
}
