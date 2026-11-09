// Data controls: what Daydeck keeps about a person, deleting all of it, leaving a challenge,
// closing one (hosts) and pausing a day. Every function takes the signed-in user's ID and
// only touches their own rows.
import { and, count, type Database, eq, inArray, schema, sql } from "@daydeck/db";
import type { BufferDeps } from "../buffer/deps";
import { revokeStoredGrant } from "../buffer/tokens";

const { challenges, channels, entries, feedbackItems, participants, users } = schema;

export interface DataSummary {
  challengesJoined: number;
  challengesHosted: number;
  /** People other than you in the challenges you host: they lose those challenges too. */
  othersInHostedChallenges: number;
  daysTracked: number;
  channels: number;
  feedbackWritten: number;
  /** Messages you wrote in challenge communities, and your reactions. */
  messagesWritten: number;
  reactions: number;
}

/** What Daydeck stores about this person, counted, for the "Your data" page. */
export async function dataSummary(db: Database, userId: string): Promise<DataSummary> {
  const mine = await db
    .select({ id: participants.id, challengeId: participants.challengeId, role: participants.role })
    .from(participants)
    .where(eq(participants.userId, userId));
  const ids = mine.map((p) => p.id);
  const hosted = mine.filter((p) => p.role === "host").map((p) => p.challengeId);
  const [[days], [channelCount], [feedback], [others], [messageCount], [reactionCount]] =
    await Promise.all([
      ids.length
        ? db.select({ n: count() }).from(entries).where(inArray(entries.participantId, ids))
        : Promise.resolve([{ n: 0 }]),
      db.select({ n: count() }).from(channels).where(eq(channels.userId, userId)),
      ids.length
        ? db.select({ n: count() }).from(feedbackItems).where(inArray(feedbackItems.authorId, ids))
        : Promise.resolve([{ n: 0 }]),
      hosted.length
        ? db
            .select({ n: count() })
            .from(participants)
            .where(
              and(
                inArray(participants.challengeId, hosted),
                sql`${participants.userId} <> ${userId}`,
              ),
            )
        : Promise.resolve([{ n: 0 }]),
      db.select({ n: count() }).from(schema.messages).where(eq(schema.messages.authorId, userId)),
      db
        .select({ n: count() })
        .from(schema.messageReactions)
        .where(eq(schema.messageReactions.userId, userId)),
    ]);
  return {
    challengesJoined: mine.length - hosted.length,
    challengesHosted: hosted.length,
    othersInHostedChallenges: others?.n ?? 0,
    daysTracked: days?.n ?? 0,
    channels: channelCount?.n ?? 0,
    feedbackWritten: feedback?.n ?? 0,
    messagesWritten: messageCount?.n ?? 0,
    reactions: reactionCount?.n ?? 0,
  };
}

/**
 * "Delete my data": revokes the Buffer grant, then deletes the person. Their sessions, Buffer
 * connection, channels, participations, days, matched posts, alerts and feedback go with them,
 * and so do the challenges they host. Returns what was deleted, for the confirmation screen.
 */
export async function deleteMyData(
  deps: BufferDeps,
  userId: string,
): Promise<DataSummary & { revokedAtBuffer: boolean; challengeIds: string[] }> {
  const summary = await dataSummary(deps.db, userId);
  const revokedAtBuffer = await revokeStoredGrant(deps, userId);
  // A ban keeps the Buffer account ID so it holds, but not the person's name any more.
  await deps.db
    .update(schema.challengeBans)
    .set({ name: null })
    .where(eq(schema.challengeBans.userId, userId));
  // Their challenges' boards and recaps change: open pages and cached recaps update.
  const joined = await deps.db
    .select({ challengeId: participants.challengeId })
    .from(participants)
    .where(eq(participants.userId, userId));
  await bumpBoards(
    deps.db,
    joined.map((row) => row.challengeId),
  );
  // Rate-limit counters name the person in their key, not by a link, so the cascade misses them.
  await deps.db
    .delete(schema.endpointHits)
    .where(sql`${schema.endpointHits.key} like ${`%:user:${userId}`}`);
  await deps.db.delete(users).where(eq(users.id, userId));
  return { ...summary, revokedAtBuffer, challengeIds: joined.map((row) => row.challengeId) };
}

/** Leaves a challenge: the person's days, matched posts and feedback in it are deleted. */
export async function leaveChallenge(
  db: Database,
  userId: string,
  slug: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: participants.id, role: participants.role })
    .from(participants)
    .innerJoin(challenges, eq(challenges.id, participants.challengeId))
    .where(and(eq(challenges.slug, slug), eq(participants.userId, userId)));
  // A host closes the challenge instead of leaving it.
  if (!row || row.role === "host") return null;
  const [left] = await db
    .delete(participants)
    .where(eq(participants.id, row.id))
    .returning({ challengeId: participants.challengeId });
  if (left) await bumpBoards(db, [left.challengeId]);
  return left?.challengeId ?? null;
}

/**
 * Bumps the change counter of these challenges: open boards reload, and cached recaps, whose
 * key holds the counter, are read fresh. Needed whenever someone's row appears or goes away.
 */
export async function bumpBoards(db: Database, challengeIds: string[]): Promise<void> {
  if (challengeIds.length === 0) return;
  await db
    .update(challenges)
    .set({ boardVersion: sql`${challenges.boardVersion} + 1` })
    .where(inArray(challenges.id, challengeIds));
}

/** Closes a challenge (hosts only): checks stop, joining stops, and the recap stays. */
export async function closeChallenge(
  db: Database,
  userId: string,
  slug: string,
  now: Date,
): Promise<boolean> {
  const updated = await db
    .update(challenges)
    // A closed challenge leaves the homepage too (the database refuses it listed while closed).
    .set({
      status: "closed",
      closedAt: now,
      showOnHome: false,
      boardVersion: sql`${challenges.boardVersion} + 1`,
    })
    .where(
      and(
        eq(challenges.slug, slug),
        eq(challenges.hostUserId, userId),
        eq(challenges.status, "open"),
      ),
    )
    .returning({ id: challenges.id });
  return updated.length > 0;
}

/**
 * Pauses one of the person's days, or opens it again. A paused day is neither done nor
 * waiting: it is a planned day off. The board shows it hatched.
 */
export async function setDayPaused(
  db: Database,
  userId: string,
  entryId: string,
  paused: boolean,
): Promise<boolean> {
  const [row] = await db
    .select({ entry: entries, challengeId: participants.challengeId })
    .from(entries)
    .innerJoin(participants, eq(participants.id, entries.participantId))
    .where(and(eq(entries.id, entryId), eq(participants.userId, userId)));
  if (!row) return false;
  const { entry } = row;
  // Only a day without a post can be paused; a resumed day is open again.
  if (paused) {
    const [post] = await db
      .select({ id: schema.entryPosts.id })
      .from(schema.entryPosts)
      .where(eq(schema.entryPosts.entryId, entry.id))
      .limit(1);
    if (post) return false;
  }
  if (!paused && entry.state !== "paused") return false;
  await db
    .update(entries)
    .set({ state: paused ? "paused" : "open" })
    .where(eq(entries.id, entryId));
  await db
    .update(challenges)
    .set({ boardVersion: sql`${challenges.boardVersion} + 1` })
    .where(eq(challenges.id, row.challengeId));
  return true;
}
