import "server-only";
import { and, eq, inArray, schema, sql } from "@daydeck/db";
import { cache } from "react";
import { daysBetween, localDateOf, promptDates, scheduleTimeZone } from "@/lib/day-engine";
import { getDb } from "@/server/db";

const { challenges, challengePrompts, participants } = schema;

/** How many days a finished challenge stays in the sidebar, to catch up and open the recap. */
export const SIDEBAR_GRACE_DAYS = 3;

export interface NavChallenge {
  slug: string;
  title: string;
  status: "open" | "closed";
  /** Where the challenge is for you, by your own dates (a rolling challenge starts when you join). */
  phase: "upcoming" | "running" | "finished";
  /** Short and spoken forms of the days left, such as "3d left" and "3 days left". */
  meta: { short: string; long: string };
  /** Open and not finished more than three days ago. */
  inSidebar: boolean;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * The person's challenges for navigation (the sidebar and the breadcrumb menus), newest first.
 * Cached for one request, so every part of a page that lists them shares one pair of queries.
 */
export const navChallenges = cache(async (userId: string): Promise<NavChallenge[]> => {
  const db = getDb();
  const now = new Date();
  const rows = await db
    .select({ challenge: challenges, participant: participants })
    .from(participants)
    .innerJoin(challenges, eq(challenges.id, participants.challengeId))
    .where(and(eq(participants.userId, userId), eq(participants.status, "active")))
    .orderBy(sql`${participants.joinedAt} desc`);
  if (rows.length === 0) return [];

  const counts = await db
    .select({ challengeId: challengePrompts.challengeId, count: sql<number>`count(*)::int` })
    .from(challengePrompts)
    .where(
      inArray(
        challengePrompts.challengeId,
        rows.map((row) => row.challenge.id),
      ),
    )
    .groupBy(challengePrompts.challengeId);
  const promptCount = new Map(counts.map((row) => [row.challengeId, row.count]));

  return rows.map(({ challenge, participant }) => {
    const today = localDateOf(now, scheduleTimeZone(challenge, participant.timezone));
    const dates = promptDates(
      participant.dayOne,
      challenge.cadence,
      promptCount.get(challenge.id) ?? 0,
    );
    const first = dates[0];
    const last = dates.at(-1);
    let phase: NavChallenge["phase"] = "finished";
    let meta = { short: "ended", long: "ended" };
    let endedDaysAgo = Number.POSITIVE_INFINITY;
    if (first && last && today < first) {
      const days = daysBetween(today, first);
      phase = "upcoming";
      meta = { short: `in ${days}d`, long: `starts in ${plural(days, "day")}` };
    } else if (first && last && today <= last) {
      const days = daysBetween(today, last);
      phase = "running";
      meta =
        days === 0
          ? { short: "last day", long: "last day" }
          : { short: `${days}d left`, long: `${plural(days, "day")} left` };
    } else if (last) {
      endedDaysAgo = daysBetween(last, today);
    }
    return {
      slug: challenge.slug,
      title: challenge.title,
      status: challenge.status,
      phase,
      meta,
      inSidebar:
        challenge.status === "open" && (phase !== "finished" || endedDaysAgo <= SIDEBAR_GRACE_DAYS),
    };
  });
});
