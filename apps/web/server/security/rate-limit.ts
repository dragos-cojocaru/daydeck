// Rate limits on Daydeck's own endpoints, so one person or one address cannot flood them (and,
// through them, Buffer's shared budget). Counters live in Postgres, one row per key and fixed
// window, so every server instance shares them. IP addresses are stored only as hashes.
import { createHash } from "node:crypto";
import { type Database, schema, sql } from "@daydeck/db";
import { headers } from "next/headers";

export interface Rule {
  /** At most this many hits per window. */
  limit: number;
  windowSeconds: number;
}

/** The limits, by what is being protected. Generous for people, tight for floods. */
export const RULES = {
  // Per address. Generous: a class or an office can share one address.
  oauthStart: { limit: 120, windowSeconds: 600 },
  oauthCallback: { limit: 120, windowSeconds: 600 },
  saveToBuffer: { limit: 30, windowSeconds: 600 },
  checkNow: { limit: 20, windowSeconds: 300 },
  createChallenge: { limit: 30, windowSeconds: 3600 },
  join: { limit: 20, windowSeconds: 3600 },
  answer: { limit: 60, windowSeconds: 600 },
  board: { limit: 60, windowSeconds: 60 },
  // Community: messages, reactions, host actions, and the pages that ask for news.
  message: { limit: 20, windowSeconds: 60 },
  react: { limit: 120, windowSeconds: 60 },
  moderate: { limit: 30, windowSeconds: 60 },
  live: { limit: 120, windowSeconds: 60 },
  // The live stream reconnects every few minutes, or at once after a network change.
  liveStream: { limit: 30, windowSeconds: 60 },
  notifications: { limit: 60, windowSeconds: 60 },
  // "Download a copy" of your data: a big read, and rarely needed more than once.
  exportData: { limit: 10, windowSeconds: 3600 },
} satisfies Record<string, Rule>;

export type RuleName = keyof typeof RULES;

/** Counts one hit. Returns whether it is allowed, and if not, how many seconds to wait. */
export async function hit(
  db: Database,
  key: string,
  rule: Rule,
  now: Date,
): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> {
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const [row] = await db
    .insert(schema.endpointHits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [schema.endpointHits.key, schema.endpointHits.windowStart],
      set: { count: sql`${schema.endpointHits.count} + 1` },
    })
    .returning({ count: schema.endpointHits.count });
  if ((row?.count ?? 1) <= rule.limit) return { ok: true };
  const retryAfterSeconds = Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000);
  return { ok: false, retryAfterSeconds };
}

/** A key for one person and one kind of action. */
export function userKey(name: RuleName, userId: string): string {
  return `${name}:user:${userId}`;
}

/** A key for one address: a salted hash, so the database never holds a raw IP address. */
export async function ipKey(name: RuleName): Promise<string> {
  const list = await headers();
  const ip =
    list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip") || "unknown";
  const salt = process.env.TOKEN_ENCRYPTION_KEY ?? "daydeck";
  const hash = createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
  return `${name}:ip:${hash}`;
}

/** The message people see when they hit a limit. */
export function tooManyMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `That is a lot of tries in a short time. Wait ${minutes === 1 ? "a minute" : `${minutes} minutes`} and try again.`;
}

/** One person's hit on a protected action: null when allowed, or the message to show. */
export async function limitUser(
  db: Database,
  name: RuleName,
  userId: string,
): Promise<string | null> {
  const result = await hit(db, userKey(name, userId), RULES[name], new Date());
  return result.ok ? null : tooManyMessage(result.retryAfterSeconds);
}
