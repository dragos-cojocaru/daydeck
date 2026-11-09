import { BufferRateLimitError } from "@daydeck/buffer";
import { type InngestFunction, NonRetriableError, RetryAfterError } from "inngest";
import { z } from "zod";
import { closeFinishedChallenges, PURGE_CRON, purgeOldData } from "@/server/account/retention";
import { getBufferDeps } from "@/server/buffer/config";
import { getDb } from "@/server/db";
import { type CheckResult, checkParticipant } from "@/server/progress/check";
import { matchPostFromEnv } from "@/server/progress/matcher";
import { dueParticipantIds, rollOverDays } from "@/server/progress/schedule";
import { CHECK_EVENT, inngest } from "./client";
import { feedbackWriteNote } from "./feedback";

const checkData = z.object({ participantId: z.uuid() });

/** Reads an event's data, or stops for good: data that is wrong now is wrong on every retry. */
export function parseOrStop<T>(schema: z.ZodType<T>, data: unknown, what: string): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new NonRetriableError(`The ${what} event has data it cannot use.`);
  return parsed.data;
}

/** The step helpers a job uses, so tests can run a job without Inngest. */
export interface CheckSteps {
  run: <T>(id: string, work: () => Promise<T>) => Promise<T>;
  sleepUntil: (id: string, until: Date) => Promise<unknown>;
}

/**
 * One participant's check: once, and when Buffer's budget is nearly used up, once more after it
 * resets. Exported so tests can run it with stand-in steps.
 */
export async function runParticipantCheck(
  data: unknown,
  step: CheckSteps,
  check: (participantId: string) => Promise<CheckResult> = runCheck,
): Promise<CheckResult> {
  const { participantId } = parseOrStop(checkData, data, "participant check");
  const first = await step.run("check", () => check(participantId));
  // Under 10% of a rate-limit window left: wait until it resets, then check once more.
  if (first.status === "deferred") {
    await step.sleepUntil("wait-for-budget", new Date(first.retryAt));
    return step.run("check-after-wait", () => check(participantId));
  }
  return first;
}

/** Runs one background check; Buffer's own "retry after" becomes Inngest's retry time. */
async function runCheck(participantId: string): Promise<CheckResult> {
  try {
    return await checkParticipant(getBufferDeps(), participantId, {
      matchPost: matchPostFromEnv(),
      mode: "background",
    });
  } catch (error) {
    if (error instanceof BufferRateLimitError) {
      throw new RetryAfterError("Buffer's rate limit is reached", error.retryAfterSeconds * 1000, {
        cause: error,
      });
    }
    throw error;
  }
}

/**
 * Hourly: finds the participants due a check (hourly in their waking hours, every 3 hours at
 * night, nobody who is done for today) and queues one check each. One sweep at a time.
 */
export const challengeSweep = inngest.createFunction(
  { id: "challenge-sweep", triggers: [{ cron: "0 * * * *" }], singleton: { mode: "skip" } },
  async ({ step }) => {
    const ids = await step.run("find-due", () => dueParticipantIds(getDb(), new Date()));
    if (ids.length > 0) {
      await step.sendEvent(
        "queue-checks",
        ids.map((participantId) => ({ name: CHECK_EVENT, data: { participantId } })),
      );
    }
    return { queued: ids.length };
  },
);

/**
 * One participant's check. One at a time per participant, waits 30 seconds for more events
 * (a burst of saves runs once), and the whole app runs at most 20 a minute.
 */
export const participantCheck = inngest.createFunction(
  {
    id: "participant-check",
    triggers: [{ event: CHECK_EVENT }],
    concurrency: [{ key: "event.data.participantId", limit: 1 }],
    debounce: { key: "event.data.participantId", period: "30s" },
    throttle: { limit: 20, period: "1m" },
    retries: 4,
  },
  // Inngest's step results come back as JSON, so the typed steps are cast once here.
  async ({ event, step }) => runParticipantCheck(event.data, step as unknown as CheckSteps),
);

/** Every 15 minutes: open days whose date has passed become catch-up days. */
export const dayRollover = inngest.createFunction(
  { id: "day-rollover", triggers: [{ cron: "*/15 * * * *" }], singleton: { mode: "skip" } },
  async ({ step }) => {
    const changed = await step.run("roll-over", () => rollOverDays(getDb(), new Date()));
    return { changed };
  },
);

/** Daily: closes fixed challenges whose last day is over. Checks stop for them. */
export const challengeClose = inngest.createFunction(
  { id: "challenge-close", triggers: [{ cron: "15 0 * * *" }], singleton: { mode: "skip" } },
  async ({ step }) => {
    const closed = await step.run("close", () => closeFinishedChallenges(getDb(), new Date()));
    return { closed };
  },
);

/** Daily: deletes closed challenges after 30 days, expired sessions and old counters. */
export const dataPurge = inngest.createFunction(
  { id: "data-purge", triggers: [{ cron: PURGE_CRON }], singleton: { mode: "skip" } },
  async ({ step }) => step.run("purge", () => purgeOldData(getDb(), new Date())),
);

// Every Inngest function the app serves, registered in app/api/inngest/route.ts.
export const functions: InngestFunction.Any[] = [
  challengeSweep,
  participantCheck,
  dayRollover,
  feedbackWriteNote,
  challengeClose,
  dataPurge,
];
