// What the "Your data" page shows next to the counts in data.ts: the Buffer connection, each
// channel, and each challenge with the date it gets deleted. Only the person's own rows.
import { count, type Database, desc, eq, inArray, schema } from "@daydeck/db";
import type { LocalDate } from "@/lib/day-engine";
import { deletionCountdown } from "./retention";

const {
  bufferConnections,
  challenges,
  channels,
  entries,
  entryPosts,
  feedbackRequests,
  participants,
  seenPosts,
} = schema;

export interface ChallengeData {
  slug: string;
  title: string;
  role: "host" | "participant";
  open: boolean;
  visibility: "private" | "public";
  /** Listed under "Popular challenges" on Daydeck's homepage while active. */
  onHome: boolean;
  /** Whether the person shows their name and post links on the recap. */
  onRecap: boolean;
  days: number;
  /** Notifications turned off here: "all", or places such as "chat". */
  muted: string[];
  /** When the daily purge deletes it, in the person's time zone: known once it is closed. */
  deletion: { date: LocalDate; days: number } | null;
}

export interface ChannelData {
  id: string;
  name: string;
  service: string;
  /** Posts on it count for the person's challenges. */
  counts: boolean;
  disconnected: boolean;
}

export interface DataOverview {
  connectedAt: Date;
  scopes: string[];
  needsReconnect: boolean;
  channels: ChannelData[];
  challenges: ChallengeData[];
  /** Buffer posts tied to one of the person's days. */
  postsLinked: number;
  /** Buffer posts Daydeck looked at, so it does not check them twice. */
  postsSeen: number;
  /** Drafts the person showed their group for feedback (their text is kept). */
  draftsShared: number;
}

export async function dataOverview(
  db: Database,
  user: { id: string; createdAt: Date },
  now: Date,
): Promise<DataOverview> {
  const [[connection], channelRows, mine] = await Promise.all([
    db
      .select({
        grantedAt: bufferConnections.grantedAt,
        scopes: bufferConnections.scopes,
        status: bufferConnections.status,
      })
      .from(bufferConnections)
      .where(eq(bufferConnections.userId, user.id)),
    db
      .select({
        id: channels.id,
        name: channels.name,
        displayName: channels.displayName,
        service: channels.service,
        counts: channels.selected,
        disconnected: channels.isDisconnected,
      })
      .from(channels)
      .where(eq(channels.userId, user.id))
      .orderBy(desc(channels.selected), channels.name),
    db
      .select({
        id: participants.id,
        role: participants.role,
        onRecap: participants.wallOptIn,
        muted: participants.mutedPlaces,
        timezone: participants.timezone,
        slug: challenges.slug,
        title: challenges.title,
        status: challenges.status,
        visibility: challenges.visibility,
        onHome: challenges.showOnHome,
        closedAt: challenges.closedAt,
        challengeTimezone: challenges.timezone,
      })
      .from(participants)
      .innerJoin(challenges, eq(challenges.id, participants.challengeId))
      .where(eq(participants.userId, user.id))
      .orderBy(desc(participants.joinedAt)),
  ]);

  const ids = mine.map((row) => row.id);
  const none = Promise.resolve([{ n: 0 }]);
  const [dayRows, [linked], [seen], [shared]] = await Promise.all([
    ids.length
      ? db
          .select({ participantId: entries.participantId, n: count() })
          .from(entries)
          .where(inArray(entries.participantId, ids))
          .groupBy(entries.participantId)
      : Promise.resolve([]),
    ids.length
      ? db
          .select({ n: count() })
          .from(entryPosts)
          .innerJoin(entries, eq(entries.id, entryPosts.entryId))
          .where(inArray(entries.participantId, ids))
      : none,
    ids.length
      ? db.select({ n: count() }).from(seenPosts).where(inArray(seenPosts.participantId, ids))
      : none,
    ids.length
      ? db
          .select({ n: count() })
          .from(feedbackRequests)
          .where(inArray(feedbackRequests.requesterId, ids))
      : none,
  ]);
  const daysOf = new Map(dayRows.map((row) => [row.participantId, row.n]));

  return {
    connectedAt: connection?.grantedAt ?? user.createdAt,
    scopes: connection?.scopes ?? [],
    needsReconnect: connection ? connection.status !== "active" : false,
    channels: channelRows.map((row) => ({
      id: row.id,
      name: row.displayName || row.name,
      service: row.service,
      counts: row.counts,
      disconnected: row.disconnected,
    })),
    challenges: mine.map((row) => ({
      slug: row.slug,
      title: row.title,
      role: row.role,
      open: row.status === "open",
      visibility: row.visibility,
      onHome: row.onHome,
      onRecap: row.onRecap,
      muted: row.muted,
      days: daysOf.get(row.id) ?? 0,
      deletion:
        row.status === "closed" && row.closedAt
          ? deletionCountdown(
              { closedAt: row.closedAt, timeZone: row.challengeTimezone },
              now,
              row.timezone,
            )
          : null,
    })),
    postsLinked: linked?.n ?? 0,
    postsSeen: seen?.n ?? 0,
    draftsShared: shared?.n ?? 0,
  };
}
