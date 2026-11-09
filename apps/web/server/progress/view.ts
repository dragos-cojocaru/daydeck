// What the challenge page shows about progress checks: open alerts, posts waiting for a "yes"
// or "no", posts that answer no prompt, and the free days a post can be given. Database only:
// showing the page costs no Buffer requests.
import { and, asc, type Database, desc, eq, inArray, isNull, schema, sql } from "@daydeck/db";
import { formatDay } from "@/features/challenges/format";
import { serviceName } from "@/features/settings/services";
import { type LocalDate, promptDates } from "@/lib/day-engine";
import { bufferPostLink } from "@/lib/post-preview";
import { claimedElsewhere, postsByEntry } from "./day-posts";

const { alerts, challengePrompts, channels, entries, participants, seenPosts } = schema;

export interface PostSummary {
  id: string;
  channelName: string;
  /** The network's name, such as "X", for "Open on X". */
  network: string;
  /** For example "Scheduled for Mon 9 Nov, 09:00" or "Posted on Sun 8 Nov". */
  when: string;
  /** The post on its network, once published. */
  externalLink: string | null;
  /** The post in Buffer's Insights, once published. */
  bufferLink: string | null;
  /** The post's first 100 characters, kept only while it waits for its day. */
  preview: string | null;
  /** The other challenge this post already counts for; it cannot count here too. */
  claimedBy: string | null;
}

export interface DayChoice {
  entryId: string;
  label: string;
}

export interface ProgressView {
  lastCheckedAt: Date | null;
  alerts: {
    id: string;
    kind: string;
    channelId: string | null;
    channelName: string | null;
    message: string | null;
    supportUrl: string | null;
  }[];
  suggestions: (PostSummary & { day: DayChoice })[];
  others: PostSummary[];
  freeDays: DayChoice[];
}

function describeWhen(
  status: string,
  dueAt: Date | null,
  sentAt: Date | null,
  timeZone: string,
): string {
  const day = (date: Date) =>
    formatDay(new Intl.DateTimeFormat("en-CA", { timeZone }).format(date));
  const time = (date: Date) =>
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone }).format(date);
  if (status === "sent" && sentAt) return `Posted on ${day(sentAt)}`;
  if (status === "error") return "Failed in Buffer";
  if (dueAt && (status === "scheduled" || status === "sending" || status === "needs_approval")) {
    return `Scheduled for ${day(dueAt)}, ${time(dueAt)}`;
  }
  return "A draft in Buffer";
}

export async function progressView(
  db: Database,
  participantId: string,
  timeZone: string,
): Promise<ProgressView> {
  const [participant] = await db
    .select()
    .from(participants)
    .where(eq(participants.id, participantId));
  if (!participant) {
    return { lastCheckedAt: null, alerts: [], suggestions: [], others: [], freeDays: [] };
  }

  const [alertRows, seenRows, dayRows, channelRows] = await Promise.all([
    db
      .select()
      .from(alerts)
      .where(and(eq(alerts.participantId, participantId), isNull(alerts.readAt)))
      .orderBy(desc(alerts.createdAt)),
    db
      .select()
      .from(seenPosts)
      .where(
        and(
          eq(seenPosts.participantId, participantId),
          inArray(seenPosts.matchKind, ["suggested", "none", "rejected"]),
        ),
      )
      .orderBy(asc(seenPosts.firstSeenAt)),
    db
      .select({ entry: entries, prompt: challengePrompts })
      .from(entries)
      .innerJoin(challengePrompts, eq(challengePrompts.id, entries.challengePromptId))
      .where(eq(entries.participantId, participantId))
      .orderBy(asc(challengePrompts.dayIndex)),
    db
      .select({
        id: channels.bufferChannelId,
        name: channels.name,
        displayName: channels.displayName,
        service: channels.service,
      })
      .from(channels)
      .where(eq(channels.userId, participant.userId)),
  ]);

  const channelName = new Map(channelRows.map((row) => [row.id, row.displayName || row.name]));
  const channelService = new Map(channelRows.map((row) => [row.id, row.service]));
  const postsOf = await postsByEntry(
    db,
    dayRows.map((row) => row.entry.id),
  );
  const hasPosts = (entryId: string) => (postsOf.get(entryId)?.length ?? 0) > 0;
  // "Other posts" that already count in another of the person's challenges say which one.
  const claimed = await claimedElsewhere(
    db,
    participantId,
    seenRows.map((seen) => seen.bufferPostId),
  );
  const [challenge] = await db
    .select({ cadence: schema.challenges.cadence })
    .from(schema.challenges)
    .where(eq(schema.challenges.id, participant.challengeId));
  const dates: LocalDate[] = promptDates(
    participant.dayOne,
    challenge?.cadence ?? "daily",
    dayRows.length,
  );
  const dayLabel = (row: (typeof dayRows)[number]) =>
    `Day ${row.prompt.dayIndex + 1} · ${formatDay(dates[row.prompt.dayIndex] ?? "")} · ${`${row.prompt.emoji} ${row.prompt.title}`.trim()}`;
  const dayById = new Map(dayRows.map((row) => [row.entry.id, row]));

  const summary = (seen: (typeof seenRows)[number]): PostSummary => ({
    id: seen.id,
    channelName: channelName.get(seen.channelId) ?? "a channel",
    network: serviceName(channelService.get(seen.channelId) ?? ""),
    when: describeWhen(seen.status, seen.dueAt, seen.sentAt, timeZone),
    externalLink: seen.externalLink,
    bufferLink: seen.status === "sent" ? bufferPostLink(seen.channelId, seen.bufferPostId) : null,
    preview: seen.preview,
    claimedBy: claimed.get(seen.bufferPostId) ?? null,
  });

  return {
    lastCheckedAt: participant.lastCheckedAt,
    alerts: alertRows.map((alert) => ({
      id: alert.id,
      kind: alert.kind,
      channelId: alert.payload.channelId ?? null,
      channelName: alert.payload.channelName ?? null,
      message: alert.payload.message ?? null,
      supportUrl: alert.payload.supportUrl ?? null,
    })),
    suggestions: seenRows.flatMap((seen) => {
      const day =
        seen.matchKind === "suggested" && seen.suggestedEntryId
          ? dayById.get(seen.suggestedEntryId)
          : undefined;
      return day && !hasPosts(day.entry.id)
        ? [{ ...summary(seen), day: { entryId: day.entry.id, label: dayLabel(day) } }]
        : [];
    }),
    others: seenRows
      .filter((seen) => seen.matchKind === "none" || seen.matchKind === "rejected")
      .map(summary),
    freeDays: dayRows
      .filter(
        (row) =>
          !hasPosts(row.entry.id) &&
          (row.entry.state === "open" ||
            row.entry.state === "missed" ||
            row.entry.state === "saved"),
      )
      .map((row) => ({ entryId: row.entry.id, label: dayLabel(row) })),
  };
}

/** How many of this person's posts in the challenge got their day from the matcher. */
export async function countMatched(db: Database, participantId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.entryPosts)
    .innerJoin(schema.entries, eq(schema.entries.id, schema.entryPosts.entryId))
    .where(
      and(
        eq(schema.entries.participantId, participantId),
        eq(schema.entryPosts.matchSource, "matcher"),
      ),
    );
  return row?.count ?? 0;
}
