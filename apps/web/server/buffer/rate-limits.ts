import type { RateLimitWindow } from "@daydeck/buffer";
import { type Database, schema, sql } from "@daydeck/db";

const { rateLimitSnapshots } = schema;

/**
 * Saves the latest rate-limit numbers, one row per window. A snapshot never overwrites a newer
 * one, so responses that arrive out of order cannot roll the numbers back.
 */
export async function recordRateLimits(
  db: Database,
  windows: RateLimitWindow[],
  capturedAt: Date,
): Promise<void> {
  if (windows.length === 0) return;
  const rows = windows.map((w) => ({
    windowSeconds: w.windowSeconds,
    quota: w.quota,
    remaining: w.remaining,
    resetAt: new Date(capturedAt.getTime() + w.resetSeconds * 1000),
    capturedAt,
  }));
  await db
    .insert(rateLimitSnapshots)
    .values(rows)
    .onConflictDoUpdate({
      target: rateLimitSnapshots.windowSeconds,
      set: {
        quota: sql`excluded.quota`,
        remaining: sql`excluded.remaining`,
        resetAt: sql`excluded.reset_at`,
        capturedAt: sql`excluded.captured_at`,
      },
      setWhere: sql`excluded.captured_at >= ${rateLimitSnapshots.capturedAt}`,
    });
}

/** User actions continue until this share of a window is left (the plan's rule). */
export const USER_ACTION_FLOOR = 0.02;

/** Background checks wait once less than this share of any window is left. */
export const BACKGROUND_FLOOR = 0.1;

export type Budget = { ok: true } | { ok: false; retryAt: Date };

/**
 * Whether a window has fallen to `floor` or below, judged from the latest snapshots. Windows
 * that have already reset do not count. When short, `retryAt` is when the last one resets.
 */
export async function budgetAbove(db: Database, now: Date, floor: number): Promise<Budget> {
  const rows = await db.select().from(rateLimitSnapshots);
  const exhausted = rows.filter(
    (row) => row.resetAt.getTime() > now.getTime() && row.remaining <= row.quota * floor,
  );
  if (exhausted.length === 0) return { ok: true };
  const retryAt = new Date(Math.max(...exhausted.map((row) => row.resetAt.getTime())));
  return { ok: false, retryAt };
}

/** Whether the app may still spend Buffer requests on something a person asked for. */
export function userActionBudget(db: Database, now: Date): Promise<Budget> {
  return budgetAbove(db, now, USER_ACTION_FLOOR);
}

/** Whether background checks may run, leaving the rest of the budget for people's actions. */
export function backgroundBudget(db: Database, now: Date): Promise<Budget> {
  return budgetAbove(db, now, BACKGROUND_FLOOR);
}
