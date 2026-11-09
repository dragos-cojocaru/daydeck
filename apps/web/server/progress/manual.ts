// What a participant decides by hand: confirm a suggested match, pick another day, say no, or
// give a post from "Other posts" a day. Every function checks that the post is theirs.
import { and, type Database, eq, inArray, isNull, schema } from "@daydeck/db";
import { localDateOf, promptDates, scheduleTimeZone } from "@/lib/day-engine";
import { claimedElsewhere, postsByEntry, refreshDayState, upsertDayPost } from "./day-posts";

const { alerts, challengePrompts, challenges, entries, participants, seenPosts } = schema;

export class ManualMatchError extends Error {
  override name = "ManualMatchError";
}

async function loadOwned(db: Database, userId: string, seenPostId: string) {
  const [row] = await db
    .select({ seen: seenPosts, participant: participants, challenge: challenges })
    .from(seenPosts)
    .innerJoin(participants, eq(participants.id, seenPosts.participantId))
    .innerJoin(challenges, eq(challenges.id, participants.challengeId))
    .where(and(eq(seenPosts.id, seenPostId), eq(participants.userId, userId)));
  if (!row) throw new ManualMatchError("That post is not one of yours.");
  return row;
}

/**
 * Gives a post a day, chosen by the person. The day must be theirs and free; the post's last
 * known status decides the day's state. The next check adds the challenge tag in Buffer.
 */
export async function assignPost(
  db: Database,
  userId: string,
  seenPostId: string,
  entryId: string,
): Promise<void> {
  const { seen, participant, challenge } = await loadOwned(db, userId, seenPostId);
  const [day] = await db
    .select({ entry: entries, dayIndex: challengePrompts.dayIndex })
    .from(entries)
    .innerJoin(challengePrompts, eq(challengePrompts.id, entries.challengePromptId))
    .where(and(eq(entries.id, entryId), eq(entries.participantId, participant.id)));
  if (!day) throw new ManualMatchError("That day is not part of your challenge.");
  const dayPosts = (await postsByEntry(db, [day.entry.id])).get(day.entry.id) ?? [];
  if (
    dayPosts.some(
      (post) => post.channelId === seen.channelId && post.bufferPostId !== seen.bufferPostId,
    )
  ) {
    throw new ManualMatchError("That day already has a post on this channel. Choose another day.");
  }
  // A post counts in one challenge only.
  const elsewhere = (await claimedElsewhere(db, participant.id, [seen.bufferPostId])).get(
    seen.bufferPostId,
  );
  if (elsewhere) {
    throw new ManualMatchError(`This post already counts for ${elsewhere}.`);
  }

  const promptCount = await db
    .select({ id: challengePrompts.id })
    .from(challengePrompts)
    .where(eq(challengePrompts.challengeId, challenge.id));
  const dates = promptDates(participant.dayOne, challenge.cadence, promptCount.length);
  const timeZone = scheduleTimeZone(challenge, participant.timezone);
  const date = dates[day.dayIndex] ?? localDateOf(new Date(), timeZone);

  await upsertDayPost(
    db,
    entryId,
    {
      channelId: seen.channelId,
      bufferPostId: seen.bufferPostId,
      status: seen.status,
      dueAt: seen.dueAt,
      sentAt: seen.sentAt,
      externalLink: seen.externalLink,
    },
    { matchSource: "manual", confidence: seen.confidence, confirmedByUser: true },
  );
  await refreshDayState(db, entryId, date, timeZone);
  await db
    .update(seenPosts)
    // The post has its day, so its preview goes.
    .set({ matchKind: "manual", entryId, suggestedEntryId: null, preview: null })
    .where(eq(seenPosts.id, seenPostId));
}

/** "No, it didn't": the post moves to "Other posts", where it can still get a day. */
export async function rejectSuggestion(
  db: Database,
  userId: string,
  seenPostId: string,
): Promise<void> {
  await loadOwned(db, userId, seenPostId);
  await db
    .update(seenPosts)
    .set({ matchKind: "rejected", suggestedEntryId: null })
    .where(eq(seenPosts.id, seenPostId));
}

/** Hides an alert for the person it belongs to. */
export async function dismissAlert(db: Database, userId: string, alertId: string): Promise<void> {
  const own = db
    .select({ id: participants.id })
    .from(participants)
    .where(eq(participants.userId, userId));
  await db
    .update(alerts)
    .set({ readAt: new Date() })
    .where(and(eq(alerts.id, alertId), inArray(alerts.participantId, own), isNull(alerts.readAt)));
}
