/* The API from server components (F28): the same-origin /api rewrite only
 * exists for the browser, so the server calls API_ORIGIN directly and
 * forwards the caller's session cookie, nothing else. Server-only: it reads
 * next/headers. A prefetch is a head start, never a requirement: no
 * API_ORIGIN, no session, a slow API or any error gives null and the page
 * fetches in the browser as before. */
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/routes";

const TIMEOUT_MS = 3_000;

export async function serverGet<T>(path: string): Promise<T | null> {
  const origin = process.env.API_ORIGIN;          // never guessed: unset means skip
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!origin || !session) return null;
  try {
    const res = await fetch(`${origin}${path}`, {
      headers: { cookie: `${SESSION_COOKIE}=${session}`, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}
