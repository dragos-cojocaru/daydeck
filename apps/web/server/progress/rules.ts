// The rules of the progress engine, as plain functions: what a Buffer post means for a day,
// and when a participant is due a background check. No database or network here.
import type { EntryState } from "@daydeck/db";
import { type LocalDate, localDateOf } from "@/lib/day-engine";

export type BufferPostStatus =
  | "draft"
  | "needs_approval"
  | "scheduled"
  | "sending"
  | "sent"
  | "error";

/**
 * The state a day takes from the post that answers it. A draft is "saved"; a post waiting to
 * go out is "planned"; a sent post is "done" when it went out by the end of the prompt's day
 * (in the participant's time zone) and "caught_up" when later. A failed post stays "saved":
 * it is in Buffer but did not go out, and an alert says why.
 */
export function stateForPost(
  post: { status: BufferPostStatus; sentAt: string | null },
  promptDate: LocalDate,
  timeZone: string,
): EntryState {
  switch (post.status) {
    case "draft":
    case "error":
      return "saved";
    case "needs_approval":
    case "scheduled":
    case "sending":
      return "planned";
    case "sent": {
      if (!post.sentAt) return "done";
      return localDateOf(new Date(post.sentAt), timeZone) <= promptDate ? "done" : "caught_up";
    }
  }
}

/** States a post can no longer change: a sent post stays sent. */
export function isFinished(state: EntryState): boolean {
  return state === "done" || state === "caught_up";
}

/** Local hours with hourly checks (08:00 to 22:59); every 3 hours outside them. */
export const WAKING_HOURS = { from: 8, to: 23 } as const;
const HOUR_MS = 60 * 60 * 1000;
/** A check that ran a few minutes early still counts, so the hourly sweep never skips one. */
const SLACK_MS = 5 * 60 * 1000;

export function localHour(now: Date, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone }).format(now),
  );
}

/**
 * Whether the hourly sweep should check this participant now. Skips anyone done for today
 * with nothing scheduled; otherwise hourly in their waking hours and every 3 hours at night.
 */
export function isDueForCheck(input: {
  lastCheckedAt: Date | null;
  timeZone: string;
  now: Date;
  doneForToday: boolean;
  hasPlanned: boolean;
}): boolean {
  if (input.doneForToday && !input.hasPlanned) return false;
  if (!input.lastCheckedAt) return true;
  const hour = localHour(input.now, input.timeZone);
  const interval = hour >= WAKING_HOURS.from && hour < WAKING_HOURS.to ? HOUR_MS : 3 * HOUR_MS;
  return input.now.getTime() - input.lastCheckedAt.getTime() >= interval - SLACK_MS;
}
