// A day's Buffer posts, at most one per channel, and the day's state that follows from them.
// Saving, planning, the progress check and choosing a day by hand all write through here, so
// they agree on what a day with several posts means.
import {
  and,
  type Database,
  type EntryPost,
  type EntryState,
  eq,
  inArray,
  schema,
} from "@daydeck/db";
import type { LocalDate } from "@/lib/day-engine";
import { type BufferPostStatus, stateForPost } from "./rules";

const { entries, entryPosts } = schema;

export type MatchSource = "app" | "matcher" | "manual";

export interface PostFacts {
  channelId: string;
  bufferPostId: string;
  status: string;
  dueAt: Date | null;
  sentAt: Date | null;
  externalLink: string | null;
}

/**
 * A day's state from all of its posts: posted as soon as any post is published (on time beats
 * late), else scheduled, else saved. Without posts, an idea still counts as saved; otherwise the
 * day keeps its own open, missed or paused state.
 */
export function combinedState(
  posts: Pick<EntryPost, "status" | "sentAt">[],
  day: { date: LocalDate; current: EntryState; hasIdea: boolean },
  timeZone: string,
): EntryState {
  const states = posts.map((post) =>
    stateForPost(
      { status: post.status as BufferPostStatus, sentAt: post.sentAt?.toISOString() ?? null },
      day.date,
      timeZone,
    ),
  );
  if (states.includes("done")) return "done";
  if (states.includes("caught_up")) return "caught_up";
  if (states.includes("planned")) return "planned";
  if (states.length > 0 || day.hasIdea) return "saved";
  return day.current === "paused" || day.current === "missed" ? day.current : "open";
}

/** The posts of these days, grouped by day. */
export async function postsByEntry(
  db: Database,
  entryIds: string[],
): Promise<Map<string, EntryPost[]>> {
  const byEntry = new Map<string, EntryPost[]>();
  if (entryIds.length === 0) return byEntry;
  const rows = await db.select().from(entryPosts).where(inArray(entryPosts.entryId, entryIds));
  for (const row of rows) {
    const list = byEntry.get(row.entryId) ?? [];
    list.push(row);
    byEntry.set(row.entryId, list);
  }
  return byEntry;
}

/**
 * Records a post for a day. The day's earlier post on the same channel, if any, is replaced
 * (saving again makes a new draft). Returns whether anything changed.
 */
export async function upsertDayPost(
  db: Database,
  entryId: string,
  post: PostFacts,
  source: { matchSource: MatchSource; confidence?: number | null; confirmedByUser?: boolean },
): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(entryPosts)
    .where(and(eq(entryPosts.entryId, entryId), eq(entryPosts.channelId, post.channelId)));
  const values = {
    bufferPostId: post.bufferPostId,
    status: post.status,
    dueAt: post.dueAt,
    sentAt: post.sentAt,
    externalLink: post.externalLink,
    matchSource: source.matchSource,
    matchConfidence: source.confidence ?? null,
    confirmedByUser: source.confirmedByUser ?? false,
  };
  if (existing) {
    const same =
      existing.bufferPostId === values.bufferPostId &&
      existing.status === values.status &&
      (existing.dueAt?.getTime() ?? null) === (values.dueAt?.getTime() ?? null) &&
      (existing.sentAt?.getTime() ?? null) === (values.sentAt?.getTime() ?? null) &&
      existing.externalLink === values.externalLink &&
      existing.matchSource === values.matchSource;
    if (same) return false;
    await db.update(entryPosts).set(values).where(eq(entryPosts.id, existing.id));
    return true;
  }
  await db.insert(entryPosts).values({ entryId, channelId: post.channelId, ...values });
  return true;
}

/** Sets a day's state from its posts. Returns whether the state changed. */
export async function refreshDayState(
  db: Database,
  entryId: string,
  date: LocalDate,
  timeZone: string,
): Promise<boolean> {
  const [entry] = await db.select().from(entries).where(eq(entries.id, entryId));
  if (!entry) return false;
  const posts = await db.select().from(entryPosts).where(eq(entryPosts.entryId, entryId));
  const state = combinedState(
    posts,
    { date, current: entry.state, hasIdea: Boolean(entry.bufferIdeaId) },
    timeZone,
  );
  if (state === entry.state) return false;
  await db.update(entries).set({ state }).where(eq(entries.id, entryId));
  return true;
}

/**
 * The Buffer posts among these that already count for a different participant, so for another
 * of the person's challenges (or someone else's). A post counts in one challenge only.
 */
export async function claimedElsewhere(
  db: Database,
  participantId: string,
  bufferPostIds: string[],
): Promise<Map<string, string>> {
  const claimed = new Map<string, string>();
  if (bufferPostIds.length === 0) return claimed;
  const rows = await db
    .select({
      bufferPostId: entryPosts.bufferPostId,
      participantId: entries.participantId,
      title: schema.challenges.title,
    })
    .from(entryPosts)
    .innerJoin(entries, eq(entries.id, entryPosts.entryId))
    .innerJoin(schema.participants, eq(schema.participants.id, entries.participantId))
    .innerJoin(schema.challenges, eq(schema.challenges.id, schema.participants.challengeId))
    .where(inArray(entryPosts.bufferPostId, bufferPostIds));
  for (const row of rows) {
    if (row.participantId !== participantId) claimed.set(row.bufferPostId, row.title);
  }
  return claimed;
}
