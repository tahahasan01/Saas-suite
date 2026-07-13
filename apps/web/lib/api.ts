const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Typed fetch wrapper. Sends the session cookie; throws ApiError on failure. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.detail ?? res.statusText);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

/** `detail` may be a string or a structured object (e.g. the 409 duplicate payload). */
export class ApiError extends Error {
  constructor(public status: number, public detail: unknown) {
    super(typeof detail === "string" ? detail : "Request failed");
  }
}
