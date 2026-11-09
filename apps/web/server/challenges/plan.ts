// "Plan my week" on the server: finds free slots (two Buffer requests) and saves the chosen ones
// as timed drafts. Nothing is published: a timed draft waits in Buffer until the person
// schedules it.
import { createDraft, fetchScheduledPosts, fetchWeekLimits } from "@daydeck/buffer";
import { and, eq, inArray, schema, sql } from "@daydeck/db";
import { addDays, daysBetween, type LocalDate, zonedTimeToUtc } from "@/lib/day-engine";
import { planWeek, type ScheduleDay, type SlotChannel } from "@/lib/slot-finder";
import { callBuffer } from "../buffer/call";
import type { BufferDeps } from "../buffer/deps";
import { BufferNotConnectedError } from "../buffer/errors";
import { upsertDayPost } from "../progress/day-posts";
import { challengeTagId, draftText, SaveRefusedError } from "./save";
import { challengeForMember } from "./service";

const { bufferConnections, channels, entries, challenges } = schema;

export interface PlanOption {
  channelId: string;
  channelName: string;
  dueAt: string;
  label: string;
}

export interface PlanRowView {
  entryId: string;
  dayNumber: number;
  title: string;
  emoji: string;
  date: LocalDate;
  isToday: boolean;
  options: PlanOption[];
  suggestedIndex: number | null;
}

/** A channel the plan looked at, for the "no free times" notice. */
export interface PlanChannelView {
  id: string;
  name: string;
  /** Buffer's service key, for the network's logo. */
  service: string;
  /** The channel's time zone in Buffer: posting times and picked times are in it. */
  timezone: string;
  /** False when the channel has no posting times set in Buffer at all. */
  hasPostingTimes: boolean;
}

export type PlanResult =
  | { kind: "ok"; rows: PlanRowView[]; channels: PlanChannelView[]; checkedAt: string }
  | { kind: "nothing-to-plan" }
  | { kind: "no-channels" };

async function loadContext(deps: BufferDeps, userId: string, slug: string) {
  const data = await challengeForMember(deps.db, slug, userId, deps.now());
  if (!data?.participant) throw new SaveRefusedError("You are not in this challenge.");
  const [connection] = await deps.db
    .select({ organizationId: bufferConnections.organizationId })
    .from(bufferConnections)
    .where(eq(bufferConnections.userId, userId));
  if (!connection) throw new BufferNotConnectedError();
  const rows =
    data.participant.channelIds.length === 0
      ? []
      : await deps.db
          .select()
          .from(channels)
          .where(
            and(
              eq(channels.userId, userId),
              inArray(channels.bufferChannelId, data.participant.channelIds),
              eq(channels.isDisconnected, false),
              eq(channels.isLocked, false),
            ),
          );
  return { data, organizationId: connection.organizationId, channelRows: rows };
}

/** This week's open prompts, each with its free slots and one suggestion. */
export async function findWeekSlots(
  deps: BufferDeps,
  userId: string,
  slug: string,
): Promise<PlanResult> {
  const now = deps.now();
  const { data, organizationId, channelRows } = await loadContext(deps, userId, slug);
  if (channelRows.length === 0) return { kind: "no-channels" };

  const week = data.days.filter(
    (day) =>
      day.entry.state === "open" &&
      daysBetween(data.today, day.date) >= 0 &&
      daysBetween(data.today, day.date) <= 6,
  );
  if (week.length === 0) return { kind: "nothing-to-plan" };

  const channelIds = channelRows.map((row) => row.bufferChannelId);
  const busy = await callBuffer(deps, userId, (options) =>
    fetchScheduledPosts(
      {
        organizationId,
        channelIds,
        start: now.toISOString(),
        end: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString(),
      },
      options,
    ),
  );
  // One instant per day of the week: noon local time selects that calendar day.
  const weekDates = Array.from({ length: 7 }, (_, index) => addDays(data.today, index));
  const full = await callBuffer(deps, userId, (options) =>
    fetchWeekLimits(
      {
        channelIds,
        days: weekDates.map((date) =>
          zonedTimeToUtc(date, { hours: 12, minutes: 0 }, data.timeZone).toISOString(),
        ),
      },
      options,
    ),
  );

  const slotChannels: SlotChannel[] = channelRows.map((row) => ({
    id: row.bufferChannelId,
    timezone: row.timezone,
    schedule: row.postingSchedule as ScheduleDay[],
  }));
  const plan = planWeek({
    prompts: week.map((day) => ({ entryId: day.entry.id, date: day.date })),
    channels: slotChannels,
    now,
    busy: busy.flatMap((post) =>
      post.dueAt ? [{ channelId: post.channelId, dueAt: new Date(post.dueAt) }] : [],
    ),
    isFull: (channelId, date) => full.has(`${channelId}@${daysBetween(data.today, date)}`),
  });

  const byEntry = new Map(week.map((day) => [day.entry.id, day]));
  const rowById = new Map(channelRows.map((row) => [row.bufferChannelId, row]));
  return {
    kind: "ok",
    // When Buffer was asked, so a page showing a kept copy can say how old it is.
    checkedAt: now.toISOString(),
    channels: channelRows.map((row) => ({
      id: row.bufferChannelId,
      name: row.displayName || row.name,
      service: row.service,
      timezone: row.timezone,
      hasPostingTimes: (row.postingSchedule as ScheduleDay[]).some(
        (day) => !day.paused && day.times.length > 0,
      ),
    })),
    rows: plan.map((row) => {
      const day = byEntry.get(row.entryId);
      const options = row.options.map((slot) => {
        const channel = rowById.get(slot.channelId);
        const time = new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: channel?.timezone ?? "UTC",
        }).format(slot.dueAt);
        const name = channel ? channel.displayName || channel.name : slot.channelId;
        return {
          channelId: slot.channelId,
          channelName: name,
          dueAt: slot.dueAt.toISOString(),
          label: `${time} on ${name}`,
        };
      });
      const suggestedIndex = row.suggested
        ? options.findIndex(
            (option) =>
              option.channelId === row.suggested?.channelId &&
              option.dueAt === row.suggested.dueAt.toISOString(),
          )
        : -1;
      return {
        entryId: row.entryId,
        dayNumber: (day?.prompt.dayIndex ?? 0) + 1,
        title: day?.prompt.title ?? "",
        emoji: day?.prompt.emoji ?? "",
        date: row.date,
        isToday: row.date === data.today,
        options,
        suggestedIndex: suggestedIndex >= 0 ? suggestedIndex : null,
      };
    }),
  };
}

/**
 * One day's chosen time: a free slot from the Buffer schedule (`dueAt`), or a time the person
 * picked themselves (`time`, "HH:MM" on that day in the channel's time zone).
 */
export interface PlanPick {
  entryId: string;
  channelId: string;
  dueAt?: string;
  time?: string;
}

export interface SavePlanResult {
  saved: number;
  failed: { entryId: string; message: string }[];
}

/**
 * Saves each chosen slot as a timed draft on every channel of the challenge. One failure does
 * not stop the others.
 */
export async function saveWeekPlan(
  deps: BufferDeps,
  userId: string,
  slug: string,
  picks: PlanPick[],
): Promise<SavePlanResult> {
  const { data, organizationId, channelRows } = await loadContext(deps, userId, slug);
  const participant = data.participant;
  const days = new Map(data.days.map((day) => [day.entry.id, day]));
  const tagId = await challengeTagId(deps, participant, data.challenge.tagName, organizationId);

  const result: SavePlanResult = { saved: 0, failed: [] };
  for (const pick of picks) {
    const day = days.get(pick.entryId);
    // A picked time is on that day in the channel's own time zone, as Buffer shows it.
    const zone =
      channelRows.find((row) => row.bufferChannelId === pick.channelId)?.timezone ?? data.timeZone;
    const [hours, minutes] = (pick.time ?? "").split(":").map(Number);
    const dueAt =
      pick.time && day && hours !== undefined && minutes !== undefined
        ? zonedTimeToUtc(day.date, { hours, minutes }, zone)
        : new Date(pick.dueAt ?? "");
    if (!day || day.entry.state !== "open") {
      result.failed.push({ entryId: pick.entryId, message: "This day is already saved." });
      continue;
    }
    if (!participant.channelIds.includes(pick.channelId)) {
      result.failed.push({
        entryId: pick.entryId,
        message: "That channel does not count for this challenge.",
      });
      continue;
    }
    if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() < deps.now().getTime() + 5 * 60 * 1000) {
      result.failed.push({
        entryId: pick.entryId,
        message: "That time has passed. Find free slots again.",
      });
      continue;
    }
    // The chosen time goes to every channel of the challenge: one timed draft on each, the
    // picked channel first. The day is saved as soon as one of them is.
    const targets = [
      pick.channelId,
      ...participant.channelIds.filter((id) => id !== pick.channelId),
    ];
    let savedOne = false;
    const refusals: string[] = [];
    for (const channelId of targets) {
      try {
        const draft = await callBuffer(deps, userId, (options) =>
          createDraft(
            {
              channelId,
              text: draftText(day.prompt),
              tagIds: tagId ? [tagId] : [],
              dueAt: dueAt.toISOString(),
            },
            options,
          ),
        );
        await upsertDayPost(
          deps.db,
          day.entry.id,
          {
            channelId,
            bufferPostId: draft.postId,
            status: "draft",
            dueAt,
            sentAt: null,
            externalLink: null,
          },
          { matchSource: "app" },
        );
        savedOne = true;
      } catch (error) {
        refusals.push(
          error instanceof Error && error.name === "BufferMutationError"
            ? `Buffer said: ${error.message}`
            : "Buffer could not save this one.",
        );
        if (error instanceof Error && error.name === "BufferRateLimitError") break;
      }
    }
    if (savedOne) {
      await deps.db
        .update(entries)
        .set({ state: "saved", updatedAt: deps.now() })
        .where(eq(entries.id, day.entry.id));
      result.saved += 1;
    } else {
      result.failed.push({
        entryId: pick.entryId,
        message: refusals[0] ?? "Buffer could not save this one.",
      });
    }
  }
  if (result.saved > 0) {
    await deps.db
      .update(challenges)
      .set({ boardVersion: sql`${challenges.boardVersion} + 1` })
      .where(eq(challenges.id, data.challenge.id));
  }
  return result;
}

/** What the plan page and its "Check Buffer again" button show. */
export type FindSlotsResult =
  | { status: "ok"; rows: PlanRowView[]; channels: PlanChannelView[]; checkedAt: string }
  | { status: "empty"; reason: "no-channels" | "nothing-to-plan" | "all-saved"; message: string }
  | { status: "error"; message: string };

export function toFindSlotsResult(result: PlanResult): FindSlotsResult {
  if (result.kind === "no-channels") {
    return {
      status: "empty",
      reason: "no-channels",
      message: "Choose which of your channels count for this challenge first.",
    };
  }
  if (result.kind === "nothing-to-plan") {
    return {
      status: "empty",
      reason: "nothing-to-plan",
      message: "Every prompt for the next seven days is already in Buffer.",
    };
  }
  return {
    status: "ok",
    rows: result.rows,
    channels: result.channels,
    checkedAt: result.checkedAt,
  };
}
