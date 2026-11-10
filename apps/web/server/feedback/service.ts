// Feedback on drafts: a participant shares one draft with their challenge group, and the others
// reply. The shared draft text (draftSnapshot) is the one piece of post text Daydeck stores,
// because the participant chose to share it. Writing replies to Buffer lives in notes.ts.
import { BufferApiError, fetchPostText } from "@daydeck/buffer";
import {
  and,
  asc,
  type Database,
  desc,
  eq,
  type FeedbackItem,
  type FeedbackRequest,
  inArray,
  ne,
  schema,
  sql,
} from "@daydeck/db";
import { z } from "zod";
import { bufferDraftsUrl } from "@/lib/buffer-links";
import { callBuffer } from "../buffer/call";
import type { BufferDeps } from "../buffer/deps";
import { postsByEntry } from "../progress/day-posts";

const {
  entryPosts,
  feedbackRequests,
  feedbackItems,
  participants,
  entries,
  challenges,
  challengePrompts,
  users,
} = schema;

/** A request or reply the app refuses, with a plain sentence that is safe to show. */
export class FeedbackRefusedError extends Error {
  override name = "FeedbackRefusedError";
}

/** The longest draft text kept for the group. Longer drafts are cut here. */
export const MAX_SNAPSHOT_LENGTH = 10_000;

/** The longest reply. */
export const MAX_REPLY_LENGTH = 2_000;

/** How many replies one person can send to one request, so nobody floods someone's Buffer. */
export const MAX_REPLIES_PER_PERSON = 5;

export const replyTextSchema = z
  .string()
  .trim()
  .min(1, "Write a reply first.")
  .max(MAX_REPLY_LENGTH, "Keep your reply to 2,000 characters or fewer.");

/** Shown when a person did not set a name in Buffer. */
export const UNNAMED = "Someone in the group";

/** Buffer statuses that still count as a draft someone can improve. */
const DRAFT_STATUSES = new Set(["draft", "needs_approval", "scheduled", "error"]);

/**
 * Shares the draft of one of the caller's days with the group. Reads the draft text from Buffer
 * with the caller's own token and keeps it as the snapshot. Asking again while a request for
 * that day is open returns the open request.
 */
export async function requestFeedback(
  deps: BufferDeps,
  input: { userId: string; entryId: string },
): Promise<{ request: FeedbackRequest; created: boolean }> {
  const [row] = await deps.db
    .select({ entry: entries, participant: participants, challenge: challenges })
    .from(entries)
    .innerJoin(participants, eq(participants.id, entries.participantId))
    .innerJoin(challenges, eq(challenges.id, participants.challengeId))
    .where(eq(entries.id, input.entryId));
  if (!row || row.participant.userId !== input.userId || row.participant.status !== "active") {
    throw new FeedbackRefusedError("That day could not be found. Reload the page.");
  }
  if (row.challenge.status !== "open") {
    throw new FeedbackRefusedError("This challenge is closed, so it takes no new requests.");
  }
  // With posts on several channels, the group sees the first draft that is not published yet.
  const draftPost = (await postsByEntry(deps.db, [row.entry.id]))
    .get(row.entry.id)
    ?.filter((post) => DRAFT_STATUSES.has(post.status))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  const postId = draftPost?.bufferPostId;
  if (!postId) {
    throw new FeedbackRefusedError("Save this day as a draft in Buffer first, then ask again.");
  }

  const existing = await openRequestFor(deps.db, row.entry.id);
  if (existing) return { request: existing, created: false };

  let post: Awaited<ReturnType<typeof fetchPostText>>;
  try {
    post = await callBuffer(deps, input.userId, (options) => fetchPostText({ postId }, options));
  } catch (error) {
    if (error instanceof BufferApiError && error.code === "NOT_FOUND") {
      throw new FeedbackRefusedError(
        "Daydeck could not find this draft in Buffer. It may be deleted.",
      );
    }
    throw error;
  }
  if (!DRAFT_STATUSES.has(post.status)) {
    throw new FeedbackRefusedError("This post is already sent, so there is no draft to improve.");
  }
  const text = post.text.trim();
  if (!text) {
    throw new FeedbackRefusedError(
      "This draft has no text yet. Write it in Buffer, then ask again.",
    );
  }

  return deps.db.transaction(async (tx) => {
    // Locking the day makes two quick clicks create one request, not two.
    await tx
      .select({ id: entries.id })
      .from(entries)
      .where(eq(entries.id, row.entry.id))
      .for("update");
    const [open] = await tx
      .select()
      .from(feedbackRequests)
      .where(and(eq(feedbackRequests.entryId, row.entry.id), eq(feedbackRequests.status, "open")));
    if (open) return { request: open, created: false };
    const [created] = await tx
      .insert(feedbackRequests)
      .values({
        entryId: row.entry.id,
        requesterId: row.participant.id,
        bufferPostId: postId,
        draftSnapshot: text.slice(0, MAX_SNAPSHOT_LENGTH),
      })
      .returning();
    if (!created) throw new Error("Creating the feedback request returned no row");
    return { request: created, created: true };
  });
}

async function openRequestFor(db: Database, entryId: string) {
  const [open] = await db
    .select()
    .from(feedbackRequests)
    .where(and(eq(feedbackRequests.entryId, entryId), eq(feedbackRequests.status, "open")));
  return open ?? null;
}

/** The days of this participant that have an open feedback request. */
export async function openFeedbackEntryIds(db: Database, participantId: string) {
  const rows = await db
    .select({ entryId: feedbackRequests.entryId })
    .from(feedbackRequests)
    .where(
      and(eq(feedbackRequests.requesterId, participantId), eq(feedbackRequests.status, "open")),
    );
  return new Set(rows.map((row) => row.entryId));
}

/**
 * Saves a reply from a member of the same challenge. Only active members reply, never to their
 * own request, and only while the request is open. `notesEnabled` decides whether the reply
 * waits to be written to Buffer (pending) or goes straight to "copy".
 */
export async function replyToRequest(
  db: Database,
  input: { userId: string; requestId: string; text: string },
  options: { notesEnabled: boolean },
): Promise<FeedbackItem> {
  const parsed = replyTextSchema.safeParse(input.text);
  if (!parsed.success) {
    throw new FeedbackRefusedError(parsed.error.issues[0]?.message ?? "Check your reply.");
  }
  const [row] = await db
    .select({ request: feedbackRequests, requester: participants, challenge: challenges })
    .from(feedbackRequests)
    .innerJoin(participants, eq(participants.id, feedbackRequests.requesterId))
    .innerJoin(challenges, eq(challenges.id, participants.challengeId))
    .where(eq(feedbackRequests.id, input.requestId));
  const [author] = row
    ? await db
        .select()
        .from(participants)
        .where(
          and(
            eq(participants.challengeId, row.challenge.id),
            eq(participants.userId, input.userId),
            eq(participants.status, "active"),
          ),
        )
    : [];
  // The same answer whether the request is missing or belongs to another group.
  if (!row || !author) {
    throw new FeedbackRefusedError("Only people in this challenge can reply to this request.");
  }
  if (author.id === row.requester.id) {
    throw new FeedbackRefusedError("This is your own request. The group replies to it.");
  }
  if (
    row.request.status !== "open" ||
    row.requester.status !== "active" ||
    row.challenge.status !== "open"
  ) {
    throw new FeedbackRefusedError("This request is closed, so it takes no new replies.");
  }
  const [sent] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(feedbackItems)
    .where(and(eq(feedbackItems.requestId, row.request.id), eq(feedbackItems.authorId, author.id)));
  if ((sent?.total ?? 0) >= MAX_REPLIES_PER_PERSON) {
    throw new FeedbackRefusedError(
      `You already sent ${MAX_REPLIES_PER_PERSON} replies to this request. Thank you for helping.`,
    );
  }

  const [item] = await db
    .insert(feedbackItems)
    .values({
      requestId: row.request.id,
      authorId: author.id,
      text: parsed.data,
      noteStatus: options.notesEnabled ? "pending" : "copy",
    })
    .returning();
  if (!item) throw new Error("Saving the reply returned no row");
  return item;
}

/** Closes a request, which hides it from the group. Only the person who asked can close it. */
export async function closeRequest(
  db: Database,
  input: { userId: string; requestId: string },
): Promise<void> {
  const [row] = await db
    .select({ requestId: feedbackRequests.id, userId: participants.userId })
    .from(feedbackRequests)
    .innerJoin(participants, eq(participants.id, feedbackRequests.requesterId))
    .where(eq(feedbackRequests.id, input.requestId));
  if (!row || row.userId !== input.userId) {
    throw new FeedbackRefusedError("Only the person who asked can close this request.");
  }
  await db
    .update(feedbackRequests)
    .set({ status: "closed" })
    .where(eq(feedbackRequests.id, row.requestId));
}

/** How a reply shows to the person who asked. */
export type ReplyDisplay = "saving" | "written" | "copy";

/** After this long, a reply still waiting for Buffer gets the copy button as well. */
export const PENDING_GRACE_MS = 30 * 60 * 1000;

export interface GroupRequestView {
  id: string;
  askerName: string;
  askerAvatarUrl: string | null;
  dayNumber: number;
  promptTitle: string;
  draftSnapshot: string;
  /** What the viewer already replied to this request. */
  myReplies: { id: string; text: string }[];
  /** How many replies others sent. Only the count: the asker alone sees what they say. */
  otherReplies: number;
  /** False once the viewer sent the most replies one person can send to this request. */
  canReply: boolean;
}

export interface OwnRequestView {
  id: string;
  status: "open" | "closed";
  dayNumber: number;
  promptTitle: string;
  draftSnapshot: string;
  /** The Drafts tab of the draft's channel in Buffer, when known. */
  draftsUrl: string | null;
  replies: {
    id: string;
    authorName: string;
    text: string;
    display: ReplyDisplay;
    /** The text to paste into Buffer: the same text a Note gets. */
    noteText: string;
  }[];
}

export interface FeedbackView {
  forGroup: GroupRequestView[];
  mine: OwnRequestView[];
}

/** The note text: the reply with the name of the person who wrote it. */
export function noteText(authorName: string | null, text: string): string {
  return `Feedback from ${authorName?.trim() || UNNAMED} (via Daydeck): ${text}`;
}

/**
 * What one participant sees on a challenge page: other members' open requests to reply to, and
 * their own requests with every reply. Empty unless the participant is an active member of this
 * challenge and belongs to `userId`.
 */
export async function feedbackForParticipant(
  db: Database,
  input: { participantId: string; challengeId: string; userId: string },
  now: Date,
): Promise<FeedbackView> {
  const [viewer] = await db
    .select({ id: participants.id })
    .from(participants)
    .where(
      and(
        eq(participants.id, input.participantId),
        eq(participants.challengeId, input.challengeId),
        eq(participants.userId, input.userId),
        eq(participants.status, "active"),
      ),
    );
  if (!viewer) return { forGroup: [], mine: [] };

  const requestColumns = {
    id: feedbackRequests.id,
    status: feedbackRequests.status,
    draftSnapshot: feedbackRequests.draftSnapshot,
    dayIndex: challengePrompts.dayIndex,
    promptTitle: challengePrompts.title,
    channelId: entryPosts.channelId,
  };
  const [group, own] = await Promise.all([
    db
      .select({ ...requestColumns, askerName: users.name, askerAvatarUrl: users.avatarUrl })
      .from(feedbackRequests)
      .innerJoin(participants, eq(participants.id, feedbackRequests.requesterId))
      .innerJoin(challenges, eq(challenges.id, participants.challengeId))
      .innerJoin(users, eq(users.id, participants.userId))
      .innerJoin(entries, eq(entries.id, feedbackRequests.entryId))
      .innerJoin(challengePrompts, eq(challengePrompts.id, entries.challengePromptId))
      // The shared draft's channel, for the link to its Drafts tab in Buffer.
      .leftJoin(entryPosts, eq(entryPosts.bufferPostId, feedbackRequests.bufferPostId))
      .where(
        and(
          eq(participants.challengeId, input.challengeId),
          eq(challenges.status, "open"),
          eq(participants.status, "active"),
          ne(participants.id, viewer.id),
          eq(feedbackRequests.status, "open"),
        ),
      )
      .orderBy(desc(feedbackRequests.createdAt))
      .limit(20),
    db
      .select(requestColumns)
      .from(feedbackRequests)
      .innerJoin(entries, eq(entries.id, feedbackRequests.entryId))
      .innerJoin(challengePrompts, eq(challengePrompts.id, entries.challengePromptId))
      // The shared draft's channel, for the link to its Drafts tab in Buffer.
      .leftJoin(entryPosts, eq(entryPosts.bufferPostId, feedbackRequests.bufferPostId))
      .where(eq(feedbackRequests.requesterId, viewer.id))
      .orderBy(desc(feedbackRequests.createdAt))
      .limit(10),
  ]);

  const requestIds = [...group, ...own].map((request) => request.id);
  const items =
    requestIds.length === 0
      ? []
      : await db
          .select({ item: feedbackItems, authorName: users.name })
          .from(feedbackItems)
          .innerJoin(participants, eq(participants.id, feedbackItems.authorId))
          .innerJoin(users, eq(users.id, participants.userId))
          .where(inArray(feedbackItems.requestId, requestIds))
          .orderBy(asc(feedbackItems.createdAt));

  const forGroup = group.map((request): GroupRequestView => {
    const myReplies = items
      .filter(({ item }) => item.requestId === request.id && item.authorId === viewer.id)
      .map(({ item }) => ({ id: item.id, text: item.text }));
    return {
      id: request.id,
      askerName: request.askerName?.trim() || UNNAMED,
      askerAvatarUrl: request.askerAvatarUrl,
      dayNumber: request.dayIndex + 1,
      promptTitle: request.promptTitle,
      draftSnapshot: request.draftSnapshot,
      myReplies,
      otherReplies: items.filter(
        ({ item }) => item.requestId === request.id && item.authorId !== viewer.id,
      ).length,
      canReply: myReplies.length < MAX_REPLIES_PER_PERSON,
    };
  });

  const mine = own.map(
    (request): OwnRequestView => ({
      id: request.id,
      status: request.status,
      dayNumber: request.dayIndex + 1,
      promptTitle: request.promptTitle,
      draftSnapshot: request.draftSnapshot,
      draftsUrl: request.channelId ? bufferDraftsUrl(request.channelId) : null,
      replies: items
        .filter(({ item }) => item.requestId === request.id)
        .map(({ item, authorName }) => ({
          id: item.id,
          authorName: authorName?.trim() || UNNAMED,
          text: item.text,
          display: replyDisplay(item, now),
          noteText: noteText(authorName, item.text),
        })),
    }),
  );

  return { forGroup, mine };
}

function replyDisplay(item: FeedbackItem, now: Date): ReplyDisplay {
  if (item.noteStatus === "written") return "written";
  if (item.noteStatus === "copy") return "copy";
  // Still waiting for Buffer after a long time: offer the copy button, so nothing is stuck.
  return now.getTime() - item.createdAt.getTime() > PENDING_GRACE_MS ? "copy" : "saving";
}
