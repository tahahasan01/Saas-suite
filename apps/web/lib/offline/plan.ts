/* Pure rules of the offline till's sync (3D, St01 P1). */

const CAP_MS = 5 * 60_000;

/** Exponential backoff from 1s, capped at 5 minutes, with jitter keeping
 *  50–100% of the step so a shop's tills don't all retry together. */
export function backoffMs(attempt: number, rand: number = Math.random()): number {
  const step = Math.min(CAP_MS, 1_000 * 2 ** Math.min(attempt, 20));
  return Math.round(step * (0.5 + 0.5 * Math.min(Math.max(rand, 0), 1)));
}

/** The receipt number an offline till prints: <REG>-<DEV>-NNNNNN (D-25). */
export function offlineRef(register: string, device: string, n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 999_999) throw new Error("This till has used all its offline receipt numbers");
  return `${register}-${device}-${String(n).padStart(6, "0")}`;
}

export function batches<T>(items: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface SyncResult { client_uuid: string; status: "created" | "duplicate" | "conflict"; needs_review?: boolean; reasons?: string[]; error?: string | null }

/** What a batch's answers mean for the outbox: created and duplicate are
 *  on the server (gone from the till), a conflict waits for a person and is
 *  never retried by itself, and anything unanswered stays to retry. */
export function settle(sent: string[], results: SyncResult[]) {
  const by = new Map(results.map((r) => [r.client_uuid, r]));
  const done: string[] = [], flagged: string[] = [], unanswered: string[] = [];
  const conflicts: { id: string; error: string }[] = [];
  for (const id of sent) {
    const r = by.get(id);
    if (!r) unanswered.push(id);
    else if (r.status === "conflict") conflicts.push({ id, error: r.error ?? "Needs a manager" });
    else {
      done.push(id);
      if (r.needs_review) flagged.push(id);
    }
  }
  return { done, conflicts, flagged, unanswered };
}

/** Whether the till drops its cached catalogue and pulls it again from the
 *  start: the server says so (its catalogue is behind the till's cursor, as
 *  after a restore), or the register's config_version moved since the last
 *  pull (3D). A first pull has nothing to drop. */
export function needsReset(storedConfig: number | undefined,
                           feed: { reset: boolean; register: { config_version: number } }): boolean {
  return feed.reset || (storedConfig !== undefined && storedConfig !== feed.register.config_version);
}
