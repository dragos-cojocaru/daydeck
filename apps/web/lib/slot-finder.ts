// "Plan my week": places this week's prompts into free posting slots, one per prompt.
//
// A slot is a time in a channel's Buffer posting schedule, on the prompt's own date, in the
// channel's time zone. A slot is free when it is in the future, no post or timed draft already
// sits at that minute on that channel, the channel is not at its daily limit that day, and no
// earlier prompt in the same plan took it. Pure, so it is easy to test.
import { type LocalDate, weekdayOf, zonedTimeToUtc } from "./day-engine";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export interface ScheduleDay {
  day: (typeof WEEKDAY_KEYS)[number];
  paused: boolean;
  times: string[];
}

export interface SlotChannel {
  id: string;
  timezone: string;
  schedule: ScheduleDay[];
}

export interface PlanPrompt {
  entryId: string;
  date: LocalDate;
}

export interface Slot {
  channelId: string;
  dueAt: Date;
}

/** Leave this much time before a slot, so the person can still review the draft. */
export const MIN_LEAD_MS = 15 * 60 * 1000;

function minuteKey(channelId: string, instant: Date): string {
  return `${channelId}@${Math.floor(instant.getTime() / 60_000)}`;
}

function parseTime(value: string): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? { hours, minutes } : null;
}

/** Every slot of one channel on one local date, in time order, before any filtering. */
export function slotsOn(channel: SlotChannel, date: LocalDate): Date[] {
  const key = WEEKDAY_KEYS[weekdayOf(date)];
  const day = channel.schedule.find((entry) => entry.day === key);
  if (!day || day.paused) return [];
  return day.times
    .map(parseTime)
    .filter((time): time is { hours: number; minutes: number } => time !== null)
    .map((time) => zonedTimeToUtc(date, time, channel.timezone))
    .sort((a, b) => a.getTime() - b.getTime());
}

export interface PlanInput {
  prompts: PlanPrompt[];
  /** The participant's channels, in order of preference. */
  channels: SlotChannel[];
  now: Date;
  /** Times already taken in Buffer: scheduled posts and timed drafts. */
  busy: Slot[];
  /** True when the channel is at its network's daily limit on that date. */
  isFull?: (channelId: string, date: LocalDate) => boolean;
}

export interface PlanRow {
  entryId: string;
  date: LocalDate;
  /** Every free slot that day, across channels, in time order. */
  options: Slot[];
  /** The suggested slot, or null when the day has no free slot. */
  suggested: Slot | null;
}

export function planWeek(input: PlanInput): PlanRow[] {
  const taken = new Set(input.busy.map((slot) => minuteKey(slot.channelId, slot.dueAt)));
  const earliest = input.now.getTime() + MIN_LEAD_MS;
  const prompts = [...input.prompts].sort((a, b) => a.date.localeCompare(b.date));

  return prompts.map((prompt) => {
    const options: Slot[] = [];
    for (const channel of input.channels) {
      if (input.isFull?.(channel.id, prompt.date)) continue;
      for (const dueAt of slotsOn(channel, prompt.date)) {
        if (dueAt.getTime() < earliest) continue;
        if (taken.has(minuteKey(channel.id, dueAt))) continue;
        options.push({ channelId: channel.id, dueAt });
      }
    }
    options.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
    // Prefer the first channel the person listed, then the earliest time.
    const preferred =
      input.channels
        .map((channel) => options.find((slot) => slot.channelId === channel.id))
        .find(Boolean) ?? null;
    if (preferred) taken.add(minuteKey(preferred.channelId, preferred.dueAt));
    return { entryId: prompt.entryId, date: prompt.date, options, suggested: preferred };
  });
}
