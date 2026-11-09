import "server-only";
import { and, type Database, eq, schema, sql } from "@daydeck/db";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "../db";
import { invitePreview } from "./service";

// Data that many people see, cached with "use cache: remote": one copy shared by every server
// instance (on Vercel, its runtime cache), so a change is seen everywhere at once. Each entry is
// tagged with everything it shows, and the code that changes that data clears the tag. Keys and
// tags are stored as plain text, so they hold only IDs: never an invite code, a token or an email.

/** The tag for one challenge's invite page. Joining clears it. */
export function inviteTag(challengeId: string): string {
  return `invite:${challengeId}`;
}

/** The tag for everything that shows a person's name or avatar. Connecting Buffer clears it. */
export function userTag(userId: string): string {
  return `user:${userId}`;
}

/**
 * A short stamp of a challenge's people: how many are in, and when any of them last changed
 * their name or picture. Cached pages put it in their key, so joining, leaving, deleting data or
 * a new name always gives a fresh copy, with no tag per person (Vercel allows 128 per item).
 */
export async function peopleStamp(db: Database, challengeId: string): Promise<string> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      changed: sql<string | null>`max(${schema.users.updatedAt})::text`,
    })
    .from(schema.participants)
    .innerJoin(schema.users, eq(schema.users.id, schema.participants.userId))
    .where(
      and(
        eq(schema.participants.challengeId, challengeId),
        eq(schema.participants.status, "active"),
      ),
    );
  return `${row?.count ?? 0}:${row?.changed ?? ""}`;
}

/**
 * What the invite page shows: host, prompts and who is in. Looked up by challenge ID, after the
 * invite code was checked against the database. `stamp` is from peopleStamp.
 */
export async function cachedInvitePreview(challengeId: string, _stamp: string) {
  "use cache: remote";
  cacheTag(inviteTag(challengeId));
  cacheLife("hours");
  const db = getDb();
  const [challenge] = await db
    .select()
    .from(schema.challenges)
    .where(eq(schema.challenges.id, challengeId));
  if (!challenge) return null;
  return invitePreview(db, challenge);
}
