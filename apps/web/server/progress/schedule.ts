// Who the hourly sweep checks, and the day rollover that turns past open days into catch-up
// days. Both read every active participant at once: a handful of queries, not one per person.
import { and, type Database, eq, inArray, schema, sql } from "@daydeck/db";
import { type LocalDate, localDateOf, promptDates, scheduleTimeZone } from "@/lib/day-engine";
import { isDueForCheck } from "./rules";

const { bufferConnections, challengePrompts, challenges, entries, participants } = schema;

interface ParticipantDays {
  participantId: string;
  lastCheckedAt: Date | null;
  timeZone: string;
  today: LocalDate;
  days: { entryId: string; state: string; date: LocalDate }[];
}

/** Active participants in open challenges, with a working Buffer connection and channels. */
async function activeParticipantDays(db: Database, now: Date): Promise<ParticipantDays[]> {
  const rows = await db
    .select({ participant: participants, challenge: challenges })
    .from(participants)
    .innerJoin(challenges, eq(challenges.id, participants.challengeId))
    .innerJoin(bufferConnections, eq(bufferConnections.userId, participants.userId))
    .where(
      and(
        eq(participants.status, "active"),
        eq(challenges.status, "open"),
        eq(bufferConnections.status, "active"),
        sql`cardinality(${participants.channelIds}) > 0`,
      ),
    );
  if (rows.length === 0) return [];

  const dayRows = await db
    .select({
      entryId: entries.id,
      participantId: entries.participantId,
      state: entries.state,
      dayIndex: challengePrompts.dayIndex,
    })
    .from(entries)
    .innerJoin(challengePrompts, eq(challengePrompts.id, entries.challengePromptId))
    .where(
      inArray(
        entries.participantId,
        rows.map((row) => row.participant.id),
      ),
    );

  return rows.map(({ participant, challenge }) => {
    const own = dayRows.filter((day) => day.participantId === participant.id);
    const dates = promptDates(participant.dayOne, challenge.cadence, own.length);
    const timeZone = scheduleTimeZone(challenge, participant.timezone);
    return {
      participantId: participant.id,
      lastCheckedAt: participant.lastCheckedAt,
      timeZone,
      today: localDateOf(now, timeZone),
      days: own.flatMap((day) => {
        const date = dates[day.dayIndex];
        return date ? [{ entryId: day.entryId, state: day.state, date }] : [];
      }),
    };
  });
}

/** The participants the hourly sweep should check now (the plan's adaptive cadence). */
export async function dueParticipantIds(db: Database, now: Date): Promise<string[]> {
  const all = await activeParticipantDays(db, now);
  return all
    .filter((person) => {
      const todayDay = person.days.find((day) => day.date === person.today);
      const doneForToday = !todayDay || ["done", "caught_up", "paused"].includes(todayDay.state);
      const hasPlanned = person.days.some((day) => day.state === "planned");
      return isDueForCheck({
        lastCheckedAt: person.lastCheckedAt,
        timeZone: person.timeZone,
        now,
        doneForToday,
        hasPlanned,
      });
    })
    .map((person) => person.participantId);
}

/**
 * Marks open days whose date has passed, in each participant's own time zone, as missed: they
 * show as catch-up cards. Safe to run again. Returns how many days changed.
 */
export async function rollOverDays(db: Database, now: Date): Promise<number> {
  const all = await activeParticipantDays(db, now);
  const passed = all.flatMap((person) =>
    person.days
      .filter((day) => day.state === "open" && day.date < person.today)
      .map((day) => day.entryId),
  );
  if (passed.length === 0) return 0;
  await db
    .update(entries)
    .set({ state: "missed" })
    .where(and(inArray(entries.id, passed), eq(entries.state, "open")));
  return passed.length;
}
