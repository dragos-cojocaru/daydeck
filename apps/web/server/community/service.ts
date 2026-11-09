// A challenge's community: messages in three channels, emoji reactions, and what each member
// has not read yet. Every function checks membership itself, so a page or an action cannot
// show or change another challenge's messages by mistake.
import {
  alias,
  and,
  asc,
  type Challenge,
  type Database,
  desc,
  eq,
  inArray,
  ne,
  type Participant,
  schema,
  sql,
} from "@daydeck/db";
import { daysBetween, localDateOf, localDayRange, promptDates } from "@/lib/day-engine";
import { isReactionEmoji, REACTION_EMOJI } from "@/lib/reactions";
import { firstLink, serviceForUrl } from "./link-preview";

const {
  challenges,
  challengePrompts,
  entries,
  feedbackItems,
  feedbackRequests,
  linkPreviews,
  messageReactions,
  messages,
  participants,
  readMarks,
  users,
} = schema;

export type Channel = "updates" | "chat" | "posts";
export type Place = Channel | "feedback";
export const CHANNELS: Channel[] = ["updates", "chat", "posts"];
export const MAX_MESSAGE_LENGTH = 2000;

/** A refusal with a message people can read, such as "Only the host posts updates." */
export class CommunityError extends Error {
  override name = "CommunityError";
}

export interface Member {
  challenge: Challenge;
  participant: Participant;
  isHost: boolean;
}

/** The person's active place in the challenge, or null when they are not in it. */
export async function memberOf(db: Database, slug: string, userId: string): Promise<Member | null> {
  const [row] = await db
    .select({ challenge: challenges, participant: participants })
    .from(challenges)
    .innerJoin(
      participants,
      and(
        eq(participants.challengeId, challenges.id),
        eq(participants.userId, userId),
        eq(participants.status, "active"),
      ),
    )
    .where(eq(challenges.slug, slug));
  if (!row) return null;
  return { ...row, isHost: row.participant.role === "host" };
}

/** Why this member cannot write in a channel, or null when they can. */
export function writeRefusal(member: Member, channel: Channel): string | null {
  if (channel === "updates" && !member.isHost) return "Only the host posts in Updates.";
  if (channel !== "updates" && !member.challenge.chatEnabled) {
    return "The host has turned off chat and shared posts for this challenge.";
  }
  return null;
}

/** Tells every open page that something in the community changed. */
export async function bumpCommunity(db: Database, challengeId: string): Promise<void> {
  await db
    .update(challenges)
    .set({ communityVersion: sql`${challenges.communityVersion} + 1` })
    .where(eq(challenges.id, challengeId));
}

/**
 * For a challenge where everyone starts on the same date, adds each day's prompt to Updates
 * once its day has begun, dated at the start of that day. People who start on the day they join
 * each have their own day 1, so their challenges get no shared prompt posts.
 */
export async function ensurePromptMessages(
  db: Database,
  challenge: Challenge,
  now: Date,
): Promise<number> {
  if (challenge.startMode !== "fixed") return 0;
  const prompts = await db
    .select({ id: challengePrompts.id, dayIndex: challengePrompts.dayIndex })
    .from(challengePrompts)
    .where(eq(challengePrompts.challengeId, challenge.id))
    .orderBy(asc(challengePrompts.dayIndex));
  const dates = promptDates(challenge.startDate, challenge.cadence, prompts.length);
  const today = localDateOf(now, challenge.timezone);
  const due = prompts.flatMap((prompt, index) => {
    const date = dates[index];
    return date && daysBetween(date, today) >= 0 ? [{ prompt, date }] : [];
  });
  if (due.length === 0) return 0;
  const [existing] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(eq(messages.challengeId, challenge.id), eq(messages.kind, "prompt")));
  if ((existing?.n ?? 0) >= due.length) return 0;
  const added = await db
    .insert(messages)
    .values(
      due.map(({ prompt, date }) => ({
        challengeId: challenge.id,
        channel: "updates" as const,
        kind: "prompt" as const,
        promptId: prompt.id,
        createdAt: localDayRange(date, challenge.timezone).start,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: messages.id });
  if (added.length > 0) await bumpCommunity(db, challenge.id);
  return added.length;
}

export interface PostInput {
  channel: Channel;
  body: string;
  replyToId?: string | null;
  /** For a shared post: the member's own day it belongs to. */
  entryId?: string | null;
}

/** Adds a message. Shared posts need a link; replies stay in their channel. */
export async function postMessage(
  db: Database,
  member: Member,
  input: PostInput,
  now: Date,
): Promise<{ id: string; linkUrl: string | null }> {
  const refusal = writeRefusal(member, input.channel);
  if (refusal) throw new CommunityError(refusal);
  const body = input.body.trim();
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new CommunityError(`Keep it to ${MAX_MESSAGE_LENGTH} characters or fewer.`);
  }
  const linkUrl = firstLink(body);
  if (input.channel === "posts" && !linkUrl) {
    throw new CommunityError("Add the link to your post, for example from LinkedIn or X.");
  }
  if (!body) throw new CommunityError("Write something first.");

  if (input.replyToId) {
    const [target] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.id, input.replyToId),
          eq(messages.challengeId, member.challenge.id),
          eq(messages.channel, input.channel),
        ),
      );
    if (!target) throw new CommunityError("That message is gone. Reply without it.");
  }
  let entryId: string | null = null;
  if (input.channel === "posts" && input.entryId) {
    const [entry] = await db
      .select({ id: entries.id })
      .from(entries)
      .where(and(eq(entries.id, input.entryId), eq(entries.participantId, member.participant.id)));
    entryId = entry?.id ?? null;
  }

  const [row] = await db
    .insert(messages)
    .values({
      challengeId: member.challenge.id,
      channel: input.channel,
      kind: input.channel === "posts" ? "share" : "text",
      authorId: member.participant.userId,
      body,
      linkUrl,
      entryId,
      replyToId: input.replyToId ?? null,
      createdAt: now,
    })
    .returning({ id: messages.id, linkUrl: messages.linkUrl });
  if (!row) throw new Error("Adding the message returned no row");
  await bumpCommunity(db, member.challenge.id);
  // Your own message counts as read.
  await markRead(db, member, input.channel, now);
  return row;
}

/** Deletes one message: your own, or any as the host. The day's prompt posts stay. */
export async function deleteMessage(
  db: Database,
  member: Member,
  messageId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ authorId: messages.authorId, kind: messages.kind })
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.challengeId, member.challenge.id)));
  if (!row) return false;
  if (row.kind === "prompt") throw new CommunityError("The day's prompt cannot be deleted.");
  if (!member.isHost && row.authorId !== member.participant.userId) {
    throw new CommunityError("You can only delete your own messages.");
  }
  await db.delete(messages).where(eq(messages.id, messageId));
  await bumpCommunity(db, member.challenge.id);
  return true;
}

/** The host deletes every message one person wrote in this challenge. Returns how many. */
export async function deleteAllFrom(db: Database, member: Member, userId: string): Promise<number> {
  if (!member.isHost) throw new CommunityError("Only the host can do this.");
  const removed = await db
    .delete(messages)
    .where(and(eq(messages.challengeId, member.challenge.id), eq(messages.authorId, userId)))
    .returning({ id: messages.id });
  if (removed.length > 0) await bumpCommunity(db, member.challenge.id);
  return removed.length;
}

/**
 * Sets your reaction on or off. Without `on` it toggles. With `on` it is safe to repeat, so a
 * double click or a retry never flips it back.
 */
export async function toggleReaction(
  db: Database,
  member: Member,
  messageId: string,
  emoji: string,
  on?: boolean,
): Promise<{ added: boolean }> {
  if (!isReactionEmoji(emoji)) {
    throw new CommunityError("Choose one of the reactions in the list.");
  }
  const [target] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.challengeId, member.challenge.id)));
  if (!target) throw new CommunityError("That message is gone.");
  const userId = member.participant.userId;
  if (on === true) {
    await db.insert(messageReactions).values({ messageId, userId, emoji }).onConflictDoNothing();
    await bumpCommunity(db, member.challenge.id);
    return { added: true };
  }
  const removed = await db
    .delete(messageReactions)
    .where(
      and(
        eq(messageReactions.messageId, messageId),
        eq(messageReactions.userId, userId),
        eq(messageReactions.emoji, emoji),
      ),
    )
    .returning({ emoji: messageReactions.emoji });
  if (removed.length === 0 && on === undefined) {
    await db.insert(messageReactions).values({ messageId, userId, emoji }).onConflictDoNothing();
  }
  await bumpCommunity(db, member.challenge.id);
  return { added: removed.length === 0 && on === undefined };
}

/**
 * The first message from someone else that the member has not read yet in a channel: where
 * the "New" line goes when they open it. Null when everything there is read.
 */
export async function firstUnreadId(
  db: Database,
  member: Member,
  channel: Channel,
): Promise<string | null> {
  const [mark] = await db
    .select({ readAt: readMarks.readAt })
    .from(readMarks)
    .where(and(eq(readMarks.participantId, member.participant.id), eq(readMarks.place, channel)));
  const since = mark?.readAt ?? member.participant.joinedAt;
  const [row] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.challengeId, member.challenge.id),
        eq(messages.channel, channel),
        ne(messages.kind, "prompt"),
        sql`${messages.authorId} is distinct from ${member.participant.userId}`,
        sql`${messages.createdAt} > ${since}`,
      ),
    )
    .orderBy(asc(messages.createdAt))
    .limit(1);
  return row?.id ?? null;
}

/** Remembers that the member has seen everything in a place up to now. */
export async function markRead(db: Database, member: Member, place: Place, now: Date) {
  await db
    .insert(readMarks)
    .values({ participantId: member.participant.id, place, readAt: now })
    .onConflictDoUpdate({
      target: [readMarks.participantId, readMarks.place],
      set: { readAt: now },
    });
}

export interface PreviewView {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  host: string;
  /** Buffer's key for the network, such as "linkedin", for its logo. */
  service: string | null;
}

export interface AuthorView {
  userId: string;
  name: string;
  avatarUrl: string | null;
  isHost: boolean;
  isYou: boolean;
  /** False once they left or were removed: the message stays, the name shows without a link. */
  isMember: boolean;
}

export interface ReactionView {
  emoji: string;
  count: number;
  mine: boolean;
  names: string[];
}

export interface MessageView {
  id: string;
  channel: Channel;
  kind: "text" | "prompt" | "share";
  body: string;
  createdAt: string;
  author: AuthorView | null;
  prompt: {
    dayNumber: number;
    title: string;
    description: string;
    emoji: string;
    theme: string;
    steps: string[];
  } | null;
  /** For a shared post: the day it belongs to. */
  dayNumber: number | null;
  replyTo: { id: string; authorName: string; snippet: string } | null;
  reactions: ReactionView[];
  preview: PreviewView | null;
  canDelete: boolean;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** The latest messages of one channel, oldest first, with everything a message card shows. */
export async function listMessages(
  db: Database,
  member: Member,
  channel: Channel,
  now: Date,
  limit = 80,
): Promise<MessageView[]> {
  if (channel === "updates") await ensurePromptMessages(db, member.challenge, now);
  const rows = (
    await db
      .select({
        message: messages,
        authorName: users.name,
        authorAvatar: users.avatarUrl,
        authorActive: participants.status,
      })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.authorId))
      .leftJoin(
        participants,
        and(
          eq(participants.challengeId, messages.challengeId),
          eq(participants.userId, messages.authorId),
        ),
      )
      .where(and(eq(messages.challengeId, member.challenge.id), eq(messages.channel, channel)))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(limit)
  ).reverse();
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.message.id);
  const me = member.participant.userId;

  const promptIds = rows.flatMap((row) => (row.message.promptId ? [row.message.promptId] : []));
  const entryIds = rows.flatMap((row) => (row.message.entryId ? [row.message.entryId] : []));
  const replyIds = rows.flatMap((row) => (row.message.replyToId ? [row.message.replyToId] : []));
  const urls = [
    ...new Set(rows.flatMap((row) => (row.message.linkUrl ? [row.message.linkUrl] : []))),
  ];

  const [reactionRows, promptRows, entryRows, replyRows, previewRows] = await Promise.all([
    db
      .select({
        messageId: messageReactions.messageId,
        emoji: messageReactions.emoji,
        userId: messageReactions.userId,
        name: users.name,
      })
      .from(messageReactions)
      .innerJoin(users, eq(users.id, messageReactions.userId))
      .where(inArray(messageReactions.messageId, ids))
      .orderBy(asc(messageReactions.createdAt)),
    promptIds.length > 0
      ? db.select().from(challengePrompts).where(inArray(challengePrompts.id, promptIds))
      : Promise.resolve([]),
    entryIds.length > 0
      ? db
          .select({ id: entries.id, dayIndex: challengePrompts.dayIndex })
          .from(entries)
          .innerJoin(challengePrompts, eq(challengePrompts.id, entries.challengePromptId))
          .where(inArray(entries.id, entryIds))
      : Promise.resolve([]),
    replyIds.length > 0
      ? db
          .select({ id: messages.id, body: messages.body, name: users.name })
          .from(messages)
          .leftJoin(users, eq(users.id, messages.authorId))
          .where(inArray(messages.id, replyIds))
      : Promise.resolve([]),
    urls.length > 0
      ? db.select().from(linkPreviews).where(inArray(linkPreviews.url, urls))
      : Promise.resolve([]),
  ]);

  const promptById = new Map(promptRows.map((row) => [row.id, row]));
  const dayByEntry = new Map(entryRows.map((row) => [row.id, row.dayIndex + 1]));
  const replyById = new Map(replyRows.map((row) => [row.id, row]));
  const previewByUrl = new Map(previewRows.map((row) => [row.url, row]));
  const reactionsByMessage = new Map<string, ReactionView[]>();
  for (const row of reactionRows) {
    const list = reactionsByMessage.get(row.messageId) ?? [];
    let entry = list.find((item) => item.emoji === row.emoji);
    if (!entry) {
      entry = { emoji: row.emoji, count: 0, mine: false, names: [] };
      list.push(entry);
    }
    entry.count += 1;
    if (row.userId === me) entry.mine = true;
    entry.names.push(row.userId === me ? "You" : (row.name ?? "Someone"));
    reactionsByMessage.set(row.messageId, list);
  }
  // Reactions keep the order of the fixed list, so they never jump around between visits.
  const order = (emoji: string) => (REACTION_EMOJI as readonly string[]).indexOf(emoji);

  return rows.map(({ message, authorName, authorAvatar, authorActive }) => {
    const prompt = message.promptId ? promptById.get(message.promptId) : undefined;
    const reply = message.replyToId ? replyById.get(message.replyToId) : undefined;
    const preview = message.linkUrl ? previewByUrl.get(message.linkUrl) : undefined;
    const isMine = message.authorId === me;
    return {
      id: message.id,
      channel: message.channel,
      kind: message.kind,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      author: message.authorId
        ? {
            userId: message.authorId,
            name: authorName ?? "Someone",
            avatarUrl: authorAvatar,
            isHost: message.authorId === member.challenge.hostUserId,
            isYou: isMine,
            isMember: authorActive === "active",
          }
        : null,
      prompt: prompt
        ? {
            dayNumber: prompt.dayIndex + 1,
            title: prompt.title,
            description: prompt.description,
            emoji: prompt.emoji,
            theme: prompt.theme,
            steps: prompt.steps,
          }
        : null,
      dayNumber: message.entryId ? (dayByEntry.get(message.entryId) ?? null) : null,
      replyTo: reply
        ? {
            id: reply.id,
            authorName: reply.name ?? "Someone",
            snippet: reply.body.slice(0, 140),
          }
        : null,
      reactions: (reactionsByMessage.get(message.id) ?? []).sort(
        (a, b) => order(a.emoji) - order(b.emoji),
      ),
      preview: message.linkUrl
        ? {
            url: message.linkUrl,
            title: preview?.status === "ok" ? preview.title : null,
            description: preview?.status === "ok" ? preview.description : null,
            imageUrl: preview?.status === "ok" ? preview.imageUrl : null,
            siteName: preview?.status === "ok" ? preview.siteName : null,
            host: hostOf(message.linkUrl),
            service: serviceForUrl(message.linkUrl),
          }
        : null,
      canDelete: message.kind !== "prompt" && (member.isHost || isMine),
    };
  });
}

export type UnreadCounts = Record<Place, number>;

/**
 * Unread items per place for one member: messages from others since they last looked (or since
 * they joined), and feedback requests and replies for them. Day prompts are not counted: today's
 * prompt is already the first thing on the challenge page.
 */
export async function unreadCounts(db: Database, member: Member): Promise<UnreadCounts> {
  const all = await unreadForUser(db, member.participant.userId, [member.challenge.id]);
  return all.get(member.challenge.id) ?? { updates: 0, chat: 0, posts: 0, feedback: 0 };
}

/** Unread counts for several of one person's challenges at once, by challenge ID. */
export async function unreadForUser(
  db: Database,
  userId: string,
  challengeIds: string[],
): Promise<Map<string, UnreadCounts>> {
  const result = new Map<string, UnreadCounts>();
  if (challengeIds.length === 0) return result;
  for (const id of challengeIds) result.set(id, { updates: 0, chat: 0, posts: 0, feedback: 0 });
  const mine = await db
    .select({
      id: participants.id,
      challengeId: participants.challengeId,
      joinedAt: participants.joinedAt,
      feedbackReadAt: readMarks.readAt,
    })
    .from(participants)
    .leftJoin(
      readMarks,
      and(eq(readMarks.participantId, participants.id), eq(readMarks.place, "feedback")),
    )
    .where(
      and(
        eq(participants.userId, userId),
        eq(participants.status, "active"),
        inArray(participants.challengeId, challengeIds),
      ),
    );
  if (mine.length === 0) return result;
  const ids = mine.map((row) => row.challengeId);
  const since = new Map(mine.map((row) => [row.challengeId, row.feedbackReadAt ?? row.joinedAt]));
  const requester = alias(participants, "requester");

  const [messageRows, requestRows, replyRows] = await Promise.all([
    db
      .select({
        challengeId: messages.challengeId,
        channel: messages.channel,
        n: sql<number>`count(*)::int`,
      })
      .from(participants)
      .innerJoin(messages, eq(messages.challengeId, participants.challengeId))
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
          inArray(participants.challengeId, ids),
          ne(messages.kind, "prompt"),
          sql`${messages.authorId} is distinct from ${userId}`,
          sql`${messages.createdAt} > coalesce(${readMarks.readAt}, ${participants.joinedAt})`,
        ),
      )
      .groupBy(messages.challengeId, messages.channel),
    // Open requests from others in the same challenges.
    db
      .select({ challengeId: requester.challengeId, createdAt: feedbackRequests.createdAt })
      .from(feedbackRequests)
      .innerJoin(requester, eq(requester.id, feedbackRequests.requesterId))
      .where(
        and(
          inArray(requester.challengeId, ids),
          ne(requester.userId, userId),
          eq(feedbackRequests.status, "open"),
        ),
      ),
    // Replies from others to your own requests.
    db
      .select({ challengeId: requester.challengeId, createdAt: feedbackItems.createdAt })
      .from(feedbackItems)
      .innerJoin(feedbackRequests, eq(feedbackRequests.id, feedbackItems.requestId))
      .innerJoin(requester, eq(requester.id, feedbackRequests.requesterId))
      .where(
        and(
          inArray(
            feedbackRequests.requesterId,
            mine.map((row) => row.id),
          ),
          ne(feedbackItems.authorId, feedbackRequests.requesterId),
        ),
      ),
  ]);
  for (const row of messageRows) {
    const counts = result.get(row.challengeId);
    if (counts) counts[row.channel] = Number(row.n);
  }
  for (const row of [...requestRows, ...replyRows]) {
    const counts = result.get(row.challengeId);
    const after = since.get(row.challengeId);
    if (counts && after && row.createdAt > after) counts.feedback += 1;
  }
  return result;
}

/** The sum of a member's unread items, for one badge. */
export function totalUnread(counts: UnreadCounts): number {
  return counts.updates + counts.chat + counts.posts + counts.feedback;
}

/** Bumps the community counter of the challenge a day belongs to (feedback on drafts). */
export async function bumpCommunityForEntry(db: Database, entryId: string): Promise<void> {
  await db
    .update(challenges)
    .set({ communityVersion: sql`${challenges.communityVersion} + 1` })
    .where(
      inArray(
        challenges.id,
        db
          .select({ id: participants.challengeId })
          .from(entries)
          .innerJoin(participants, eq(participants.id, entries.participantId))
          .where(eq(entries.id, entryId)),
      ),
    );
}

/** Bumps the community counter of the challenge a feedback request belongs to. */
export async function bumpCommunityForRequest(db: Database, requestId: string): Promise<void> {
  await db
    .update(challenges)
    .set({ communityVersion: sql`${challenges.communityVersion} + 1` })
    .where(
      inArray(
        challenges.id,
        db
          .select({ id: participants.challengeId })
          .from(feedbackRequests)
          .innerJoin(participants, eq(participants.id, feedbackRequests.requesterId))
          .where(eq(feedbackRequests.id, requestId)),
      ),
    );
}
