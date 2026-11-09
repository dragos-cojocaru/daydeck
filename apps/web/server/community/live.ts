// What open pages need to stay current, and the notifications built from it: per challenge,
// its change counters, when your posts were last checked, unread counts and what you muted.
// The live stream sends this whenever the cheap stamp below changes.
import { and, type Database, desc, eq, inArray, ne, schema, sql } from "@daydeck/db";
import { type Place, type UnreadCounts, unreadForUser } from "./service";

const { challenges, messages, participants, readMarks, users } = schema;

/** Everything people can turn off: one place, or the whole challenge. */
export const MUTABLE = ["all", "updates", "chat", "posts", "feedback"] as const;
export type Mutable = (typeof MUTABLE)[number];
export const PLACE_LIST: Place[] = ["updates", "chat", "posts", "feedback"];

export interface LiveEntry {
  /** Goes up when anyone's days change. */
  board: number;
  /** Goes up on every message, reaction or removal. */
  community: number;
  /** When Daydeck last read your Buffer posts here, also after a check in the background. */
  checked: string | null;
  unread: UnreadCounts;
  /** Notifications you turned off here. */
  muted: Mutable[];
}

export type LiveSnapshot = Record<string, LiveEntry>;

/** Your active challenges, with the fields that change what open pages show. */
function memberships(db: Database, userId: string) {
  return db
    .select({
      id: challenges.id,
      slug: challenges.slug,
      board: challenges.boardVersion,
      community: challenges.communityVersion,
      checked: participants.lastCheckedAt,
      muted: participants.mutedPlaces,
      // Reading in another tab changes the unread counts here too.
      read: sql<
        string | null
      >`(select max(${readMarks.readAt})::text from ${readMarks} where ${readMarks.participantId} = ${participants.id})`,
    })
    .from(participants)
    .innerJoin(challenges, eq(challenges.id, participants.challengeId))
    .where(and(eq(participants.userId, userId), eq(participants.status, "active")))
    .orderBy(challenges.id);
}

/**
 * One small query whose answer changes whenever anything an open page shows could change: a new
 * message or reaction, someone's day, a check in the background, a read mark, a mute.
 */
export async function liveStamp(db: Database, userId: string): Promise<string> {
  const rows = await memberships(db, userId);
  return rows
    .map((row) =>
      [
        row.id,
        row.board,
        row.community,
        row.checked?.getTime() ?? "",
        row.read ?? "",
        row.muted.join(","),
      ].join(":"),
    )
    .join("|");
}

/** The full picture for open pages: counters, unread counts and mutes, by challenge slug. */
export async function liveSnapshot(db: Database, userId: string): Promise<LiveSnapshot> {
  const rows = await memberships(db, userId);
  const unread = await unreadForUser(
    db,
    userId,
    rows.map((row) => row.id),
  );
  return Object.fromEntries(
    rows.map((row) => [
      row.slug,
      {
        board: row.board,
        community: row.community,
        checked: row.checked?.toISOString() ?? null,
        unread: unread.get(row.id) ?? { updates: 0, chat: 0, posts: 0, feedback: 0 },
        muted: row.muted.filter((value): value is Mutable =>
          (MUTABLE as readonly string[]).includes(value),
        ),
      },
    ]),
  );
}

/** Unread items you get notified about: every place you did not turn off. */
export function notifiedCount(entry: Pick<LiveEntry, "unread" | "muted"> | undefined): number {
  if (!entry || entry.muted.includes("all")) return 0;
  return PLACE_LIST.filter((place) => !entry.muted.includes(place)).reduce(
    (sum, place) => sum + entry.unread[place],
    0,
  );
}

export interface NotificationRow {
  slug: string;
  title: string;
  place: Place;
  count: number;
  /** The newest unread message there, when the place has messages. */
  latest: { author: string; text: string; at: string } | null;
}

/** The notification panel: one row per challenge and place with unread items you get told about. */
export async function notificationFeed(db: Database, userId: string): Promise<NotificationRow[]> {
  const [snapshot, titles] = await Promise.all([
    liveSnapshot(db, userId),
    db
      .select({ slug: challenges.slug, title: challenges.title, id: challenges.id })
      .from(participants)
      .innerJoin(challenges, eq(challenges.id, participants.challengeId))
      .where(and(eq(participants.userId, userId), eq(participants.status, "active"))),
  ]);
  const titleOf = new Map(titles.map((row) => [row.slug, row.title]));
  const idOf = new Map(titles.map((row) => [row.id, row.slug]));
  // The newest unread message per challenge and channel, from someone else.
  const latest = await db
    .selectDistinctOn([messages.challengeId, messages.channel], {
      challengeId: messages.challengeId,
      channel: messages.channel,
      body: messages.body,
      linkUrl: messages.linkUrl,
      createdAt: messages.createdAt,
      author: users.name,
    })
    .from(participants)
    .innerJoin(messages, eq(messages.challengeId, participants.challengeId))
    .leftJoin(users, eq(users.id, messages.authorId))
    .leftJoin(
      readMarks,
      and(
        eq(readMarks.participantId, participants.id),
        sql`${readMarks.place}::text = ${messages.channel}::text`,
      ),
    )
    .where(
      and(
        eq(participants.userId, userId),
        eq(participants.status, "active"),
        ne(messages.kind, "prompt"),
        sql`${messages.authorId} is distinct from ${userId}`,
        sql`${messages.createdAt} > coalesce(${readMarks.readAt}, ${participants.joinedAt})`,
      ),
    )
    .orderBy(messages.challengeId, messages.channel, desc(messages.createdAt));
  const latestOf = new Map<string, (typeof latest)[number]>(
    latest.map((row) => [`${idOf.get(row.challengeId)}#${row.channel}`, row]),
  );

  const rows: NotificationRow[] = [];
  for (const [slug, entry] of Object.entries(snapshot)) {
    if (entry.muted.includes("all")) continue;
    for (const place of PLACE_LIST) {
      const count = entry.unread[place];
      if (count === 0 || entry.muted.includes(place)) continue;
      const message = latestOf.get(`${slug}#${place}`);
      rows.push({
        slug,
        title: titleOf.get(slug) ?? slug,
        place,
        count,
        latest: message
          ? {
              author: message.author ?? "Someone",
              text: (message.body.trim() || message.linkUrl || "").slice(0, 140),
              at: message.createdAt.toISOString(),
            }
          : null,
      });
    }
  }
  // Newest first; rows without a message (feedback) keep their challenge's order.
  return rows.sort((a, b) => (b.latest?.at ?? "").localeCompare(a.latest?.at ?? ""));
}

/**
 * Turns a place, or the whole challenge ("all"), off or on again for one person. Returns false
 * when they are not in that challenge.
 */
export async function setMuted(
  db: Database,
  userId: string,
  slug: string,
  what: Mutable,
  muted: boolean,
): Promise<boolean> {
  const updated = await db
    .update(participants)
    .set({
      mutedPlaces: muted
        ? sql`array(select distinct unnest(array_append(${participants.mutedPlaces}, ${what})))`
        : sql`array_remove(${participants.mutedPlaces}, ${what})`,
    })
    .where(
      and(
        eq(participants.userId, userId),
        eq(participants.status, "active"),
        inArray(
          participants.challengeId,
          db.select({ id: challenges.id }).from(challenges).where(eq(challenges.slug, slug)),
        ),
      ),
    )
    .returning({ id: participants.id });
  return updated.length > 0;
}

/** "Mark all as read": every place of every challenge you are in, read up to now. */
export async function markAllRead(db: Database, userId: string, now: Date): Promise<void> {
  const mine = await db
    .select({ id: participants.id })
    .from(participants)
    .where(and(eq(participants.userId, userId), eq(participants.status, "active")));
  if (mine.length === 0) return;
  await db
    .insert(readMarks)
    .values(
      mine.flatMap((row) =>
        PLACE_LIST.map((place) => ({ participantId: row.id, place, readAt: now })),
      ),
    )
    .onConflictDoUpdate({
      target: [readMarks.participantId, readMarks.place],
      set: { readAt: now },
    });
}

export interface NotificationSetting {
  slug: string;
  title: string;
  muted: Mutable[];
}

/** Every challenge you are in, with what you turned off: the panel's settings view. */
export async function notificationSettings(
  db: Database,
  userId: string,
): Promise<NotificationSetting[]> {
  const rows = await db
    .select({ slug: challenges.slug, title: challenges.title, muted: participants.mutedPlaces })
    .from(participants)
    .innerJoin(challenges, eq(challenges.id, participants.challengeId))
    .where(and(eq(participants.userId, userId), eq(participants.status, "active")))
    .orderBy(challenges.title);
  return rows.map((row) => ({
    ...row,
    muted: row.muted.filter((value): value is Mutable =>
      (MUTABLE as readonly string[]).includes(value),
    ),
  }));
}
