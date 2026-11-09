// The two daily housekeeping jobs from the plan: close challenges whose last day is over, and
// delete data on the retention schedule. Both are safe to run again.
import { and, type Database, eq, isNotNull, lt, schema, sql } from "@daydeck/db";
import { daysBetween, type LocalDate, localDateOf } from "@/lib/day-engine";

const { challenges, endpointHits, linkPreviews, participants, seenPosts, sessions } = schema;

/** A closed challenge's data lives this long, then the purge deletes it. */
export const RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** When the daily purge runs, in UTC. The Inngest schedule is built from it. */
export const PURGE_TIME_UTC = { hour: 0, minute: 45 } as const;
export const PURGE_CRON = `${PURGE_TIME_UTC.minute} ${PURGE_TIME_UTC.hour} * * *`;

/** When a challenge that closed at `closedAt` is deleted: the first purge after 30 days. */
export function deletionTime(closedAt: Date): Date {
  const cutoff = closedAt.getTime() + RETENTION_DAYS * DAY_MS;
  const run = new Date(cutoff);
  run.setUTCHours(PURGE_TIME_UTC.hour, PURGE_TIME_UTC.minute, 0, 0);
  if (run.getTime() <= cutoff) run.setTime(run.getTime() + DAY_MS);
  return run;
}

/** The deletion as one person sees it: the day in their time zone, and how many days away. */
export function deletionCountdown(
  closedAt: Date,
  now: Date,
  timeZone: string,
): { date: LocalDate; days: number } {
  const date = localDateOf(deletionTime(closedAt), timeZone);
  return { date, days: Math.max(0, daysBetween(localDateOf(now, timeZone), date)) };
}

export { deletionPhrase } from "@/lib/deletion-words";

/**
 * Closes fixed challenges once the last prompt's day has ended everywhere. Rolling challenges
 * stay open for new people until the host closes them. Returns how many closed.
 */
export async function closeFinishedChallenges(db: Database, now: Date): Promise<number> {
  const closed = await db
    .update(challenges)
    .set({ status: "closed", closedAt: now, showOnHome: false })
    .where(
      and(eq(challenges.status, "open"), isNotNull(challenges.endsAt), lt(challenges.endsAt, now)),
    )
    .returning({ id: challenges.id });
  return closed.length;
}

/** Link previews are kept this long; then a shared link shows its address and logo only. */
export const PREVIEW_DAYS = 7;
/** The longest a post's own preview (its first 100 characters) waits for a day. */
export const POST_PREVIEW_DAYS = 30;

/**
 * Deletes challenges closed more than 30 days ago (everything in them goes with them), expired
 * sessions, rate-limit counters older than a day and link previews older than a week. Clears
 * a post's preview once it has a day, its challenge closed, or it is 30 days old.
 */
export async function purgeOldData(
  db: Database,
  now: Date,
): Promise<{
  challenges: number;
  sessions: number;
  counters: number;
  previews: number;
  postPreviews: number;
}> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS);
  const closedHere = db
    .select({ id: participants.id })
    .from(participants)
    .innerJoin(challenges, eq(challenges.id, participants.challengeId))
    .where(eq(challenges.status, "closed"));
  const [gone, expired, counters, previews, postPreviews] = await Promise.all([
    db
      .delete(challenges)
      .where(and(eq(challenges.status, "closed"), lt(challenges.closedAt, cutoff)))
      .returning({ id: challenges.id }),
    db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.idHash }),
    db
      .delete(endpointHits)
      .where(lt(endpointHits.windowStart, new Date(now.getTime() - DAY_MS)))
      .returning({ key: endpointHits.key }),
    db
      .delete(linkPreviews)
      .where(lt(linkPreviews.fetchedAt, new Date(now.getTime() - PREVIEW_DAYS * DAY_MS)))
      .returning({ url: linkPreviews.url }),
    db
      .update(seenPosts)
      .set({ preview: null })
      .where(
        and(
          isNotNull(seenPosts.preview),
          sql`(${seenPosts.matchKind} not in ('suggested', 'none', 'rejected')
            or ${seenPosts.firstSeenAt} < ${new Date(now.getTime() - POST_PREVIEW_DAYS * DAY_MS)}
            or ${seenPosts.participantId} in ${closedHere})`,
        ),
      )
      .returning({ id: seenPosts.id }),
  ]);
  return {
    challenges: gone.length,
    sessions: expired.length,
    counters: counters.length,
    previews: previews.length,
    postPreviews: postPreviews.length,
  };
}
