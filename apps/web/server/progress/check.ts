// One progress check for one participant: read their Buffer posts, decide which day each post
// answers, update the days, tag matched posts and raise alerts. Runs from the background job
// and from "Check now". Safe to run again: every write is an upsert or a plain state update.

import { createHash } from "node:crypto";
import { type BufferPost, fetchParticipantPosts, findIdeas, tagPost } from "@daydeck/buffer";
import {
  type AlertKind,
  type AlertPayload,
  and,
  type Database,
  type Entry,
  type EntryPost,
  eq,
  inArray,
  isNull,
  type PostMatchKind,
  type SeenPost,
  schema,
  sql,
} from "@daydeck/db";
import {
  addDays,
  daysBetween,
  type LocalDate,
  localDateOf,
  promptDates,
  scheduleTimeZone,
} from "@/lib/day-engine";
import { isWaiting, postPreview } from "@/lib/post-preview";
import { callBuffer } from "../buffer/call";
import { syncChannels } from "../buffer/channels";
import type { BufferDeps } from "../buffer/deps";
import { backgroundBudget, userActionBudget } from "../buffer/rate-limits";
import { challengeTagId } from "../challenges/save";
import { claimedElsewhere, postsByEntry, refreshDayState, upsertDayPost } from "./day-posts";

const {
  alerts,
  bufferConnections,
  challengePrompts,
  challenges,
  channels,
  entries,
  entryPosts,
  participants,
  seenPosts,
} = schema;

export interface MatchCandidate {
  /** The entry (one participant's day) this candidate stands for. */
  id: string;
  title: string;
  description: string;
}

export interface MatchDecision {
  kind: "auto" | "suggest" | "none";
  /** The candidate's ID for "auto" and "suggest"; null for "none". */
  entryId: string | null;
  confidence: number;
}

/** Decides which candidate a post answers. Null when no matcher is configured. */
export type MatchPost = (postText: string, candidates: MatchCandidate[]) => Promise<MatchDecision>;

export type CheckResult =
  | {
      status: "checked";
      posts: number;
      changedDays: number;
      suggested: number;
      unmatched: number;
    }
  | { status: "deferred"; retryAt: Date }
  | {
      status: "skipped";
      reason: "not-active" | "not-connected" | "needs-reconnect" | "no-channels";
    };

/** At most this many prompts go to the matcher as candidates (the plan's "about 10"). */
const MAX_CANDIDATES = 10;
/** At most this many new posts are matched per check; the rest wait for the next one. */
const MAX_NEW_MATCHES = 10;
/** Channels are synced again when older than this, for the channel health alerts. */
const CHANNEL_SYNC_MS = 24 * 60 * 60 * 1000;

/** The most text one candidate sends to the matcher, so ten candidates stay a small request. */
const MATCH_TEXT_LIMIT = 700;

/**
 * What the matcher reads about a day besides its title: the explanation, then the steps, which
 * say most clearly what the post is about. The theme is left out: a week shares one theme, so
 * it cannot tell its days apart.
 */
export function matchDescription(prompt: { description: string; steps?: string[] }): string {
  const text = [prompt.description, ...(prompt.steps ?? [])]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  return text.length > MATCH_TEXT_LIMIT ? `${text.slice(0, MATCH_TEXT_LIMIT - 1)}…` : text;
}

export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

interface DayRow extends Entry {
  date: LocalDate;
  title: string;
  description: string;
  /** The day's posts, at most one per channel. */
  posts: EntryPost[];
}

export async function checkParticipant(
  deps: BufferDeps,
  participantId: string,
  options: { matchPost: MatchPost | null; mode: "background" | "user" },
): Promise<CheckResult> {
  const { db } = deps;
  const now = deps.now();
  const [row] = await db
    .select({ participant: participants, challenge: challenges })
    .from(participants)
    .innerJoin(challenges, eq(challenges.id, participants.challengeId))
    .where(eq(participants.id, participantId));
  if (!row || row.participant.status !== "active" || row.challenge.status !== "open") {
    return { status: "skipped", reason: "not-active" };
  }
  const { participant, challenge } = row;

  const [connection] = await db
    .select({
      status: bufferConnections.status,
      organizationId: bufferConnections.organizationId,
      scopes: bufferConnections.scopes,
    })
    .from(bufferConnections)
    .where(eq(bufferConnections.userId, participant.userId));
  if (!connection) return { status: "skipped", reason: "not-connected" };
  if (connection.status !== "active") {
    await raiseAlert(db, participantId, "needs_reconnect", `reconnect:${participantId}`, {});
    return { status: "skipped", reason: "needs-reconnect" };
  }
  await resolveAlerts(db, participantId, ["needs_reconnect"]);

  const budget =
    options.mode === "background"
      ? await backgroundBudget(db, now)
      : await userActionBudget(db, now);
  if (!budget.ok) return { status: "deferred", retryAt: budget.retryAt };
  if (participant.channelIds.length === 0) return { status: "skipped", reason: "no-channels" };

  const timeZone = scheduleTimeZone(challenge, participant.timezone);
  const today = localDateOf(now, timeZone);
  await checkChannelHealth(deps, participant, today, now);

  // Every day of this participant, with its date.
  const prompts = await db
    .select()
    .from(challengePrompts)
    .where(eq(challengePrompts.challengeId, challenge.id))
    .orderBy(challengePrompts.dayIndex);
  const dates = promptDates(participant.dayOne, challenge.cadence, prompts.length);
  const entryRows = await db.select().from(entries).where(eq(entries.participantId, participantId));
  const postsOf = await postsByEntry(
    db,
    entryRows.map((entry) => entry.id),
  );
  const promptById = new Map(prompts.map((prompt) => [prompt.id, prompt]));
  const days: DayRow[] = entryRows.flatMap((entry) => {
    const prompt = promptById.get(entry.challengePromptId);
    const date = prompt ? dates[prompt.dayIndex] : undefined;
    return prompt && date
      ? [
          {
            ...entry,
            date,
            title: prompt.title,
            description: matchDescription(prompt),
            posts: postsOf.get(entry.id) ?? [],
          },
        ]
      : [];
  });
  const dayById = new Map(days.map((day) => [day.id, day]));
  const dayByPost = new Map(
    days.flatMap((day) => day.posts.map((post) => [post.bufferPostId, day] as const)),
  );

  // One read for every post since joining: posts made before joining never count.
  const { posts, complete } = await callBuffer(deps, participant.userId, (requestOptions) =>
    fetchParticipantPosts(
      {
        organizationId: connection.organizationId,
        channelIds: participant.channelIds,
        since: participant.joinedAt.toISOString(),
      },
      requestOptions,
    ),
  );

  const seenRows = await db
    .select()
    .from(seenPosts)
    .where(eq(seenPosts.participantId, participantId));
  const seenByPost = new Map(seenRows.map((seen) => [seen.bufferPostId, seen]));
  // A post counts in one challenge only: posts another challenge already counts stay here as
  // "Other posts", marked with that challenge, and are never sent to the matcher.
  const claimed = await claimedElsewhere(
    db,
    participantId,
    posts.filter((post) => !dayByPost.has(post.id)).map((post) => post.id),
  );
  const channelNames = await channelNameMap(db, participant.userId);

  let changedDays = 0;
  let newMatches = 0;
  const tagId = { value: undefined as string | null | undefined };
  const ensureTagId = async () => {
    if (tagId.value === undefined) {
      tagId.value = await challengeTagId(
        deps,
        participant,
        challenge.tagName,
        connection.organizationId,
      );
    }
    return tagId.value;
  };

  const ordered = [...posts].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const post of ordered) {
    const seen = seenByPost.get(post.id);
    const textHash = hashText(post.text);
    let kind: PostMatchKind;
    let entryId: string | null = null;
    let suggestedEntryId: string | null = null;
    let confidence: number | null = seen?.confidence ?? null;

    const appDay = dayByPost.get(post.id);
    if (!appDay && claimed.has(post.id)) {
      kind = "none";
    } else if (appDay) {
      // A post this app created from a prompt, or one already linked to a day.
      kind = seen?.matchKind === "auto" || seen?.matchKind === "manual" ? seen.matchKind : "app";
      entryId = appDay.id;
    } else if (seen && (seen.matchKind === "manual" || seen.matchKind === "auto") && seen.entryId) {
      kind = seen.matchKind;
      entryId = seen.entryId;
    } else if (seen && seen.textHash === textHash) {
      // Seen before with the same text: keep the earlier decision.
      kind = seen.matchKind;
      suggestedEntryId = seen.suggestedEntryId;
    } else {
      if (newMatches >= MAX_NEW_MATCHES) continue;
      newMatches += 1;
      const candidates = candidatesFor(days, today);
      const decision =
        options.matchPost && candidates.length > 0
          ? await options.matchPost(post.text, candidates)
          : { kind: "none" as const, entryId: null, confidence: 0 };
      confidence = decision.confidence;
      const target = decision.entryId ? dayById.get(decision.entryId) : undefined;
      const free = (day: DayRow) => !day.posts.some((p) => p.channelId === post.channelId);
      if (decision.kind === "auto" && target && free(target)) {
        kind = "auto";
        entryId = target.id;
      } else if (decision.kind !== "none" && target) {
        kind = "suggested";
        suggestedEntryId = target.id;
      } else {
        kind = "none";
      }
    }

    const day = entryId ? dayById.get(entryId) : undefined;
    if (day && day.state !== "paused") {
      // One post per channel per day: a second one on the same channel waits under "Other posts".
      const clash = day.posts.find(
        (p) => p.channelId === post.channelId && p.bufferPostId !== post.id,
      );
      if (clash && kind !== "app") {
        kind = "none";
        entryId = null;
      } else if (await applyPost(db, day, post, timeZone, kind, confidence)) {
        changedDays += 1;
      }
    }

    await db
      .insert(seenPosts)
      .values({
        participantId,
        bufferPostId: post.id,
        channelId: post.channelId,
        status: post.status,
        textHash,
        matchKind: kind,
        entryId,
        suggestedEntryId,
        confidence,
        dueAt: post.dueAt ? new Date(post.dueAt) : null,
        sentAt: post.sentAt ? new Date(post.sentAt) : null,
        externalLink: post.externalLink,
        preview: isWaiting(kind) ? postPreview(post.text) : null,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [seenPosts.participantId, seenPosts.bufferPostId],
        set: {
          channelId: post.channelId,
          status: post.status,
          textHash,
          matchKind: kind,
          entryId,
          suggestedEntryId,
          confidence,
          dueAt: post.dueAt ? new Date(post.dueAt) : null,
          sentAt: post.sentAt ? new Date(post.sentAt) : null,
          externalLink: post.externalLink,
          // Kept only while the post waits for its day; gone once it has one.
          preview: isWaiting(kind) ? postPreview(post.text) : null,
          lastSeenAt: now,
        },
      });

    // A matched post the app did not create gets the challenge tag, while it can still be edited.
    if (
      (kind === "auto" || kind === "manual") &&
      (post.status === "draft" || post.status === "scheduled")
    ) {
      const id = await ensureTagId();
      if (id && !post.tags.some((tag) => tag.id === id)) {
        await callBuffer(deps, participant.userId, (requestOptions) =>
          tagPost(
            { postId: post.id, tagIds: [...post.tags.map((tag) => tag.id), id] },
            requestOptions,
          ),
        ).catch((error) => console.error("Tagging a matched post failed", error));
      }
    }

    // A failed challenge post gets an alert with Buffer's own reason; a fixed one clears it.
    const failedKey = `failed:${participantId}:${post.id}`;
    if (post.status === "error" && (kind === "app" || kind === "auto" || kind === "manual")) {
      await raiseAlert(db, participantId, "failed_post", failedKey, {
        postId: post.id,
        channelId: post.channelId,
        channelName: channelNames.get(post.channelId),
        message: post.error?.message,
        supportUrl: post.error?.supportUrl ?? null,
      });
    } else if (seen?.status === "error") {
      await db
        .update(alerts)
        .set({ readAt: now })
        .where(and(eq(alerts.dedupeKey, failedKey), isNull(alerts.readAt)));
    }
  }

  // A post deleted in Buffer no longer answers its day; a published one always stays. Only
  // trusted when every page was read.
  if (complete) {
    const returned = new Set(posts.map((post) => post.id));
    for (const day of days) {
      const gone = day.posts.filter(
        (p) =>
          !returned.has(p.bufferPostId) &&
          participant.channelIds.includes(p.channelId) &&
          p.status !== "sent",
      );
      if (gone.length === 0) continue;
      await db.delete(entryPosts).where(
        inArray(
          entryPosts.id,
          gone.map((p) => p.id),
        ),
      );
      day.posts = day.posts.filter((p) => !gone.includes(p));
      await refreshDayState(db, day.id, day.date, timeZone);
      changedDays += 1;
    }
    const goneSeen = seenRows
      .filter((seen) => !returned.has(seen.bufferPostId))
      .map((seen) => seen.id);
    if (goneSeen.length > 0) await db.delete(seenPosts).where(inArray(seenPosts.id, goneSeen));
  }

  // An idea deleted in Buffer no longer saves its day. Only for connections that granted
  // ideas:read: older ones did not, and they keep working as before, with no new sign-in.
  if (connection.scopes.includes("ideas:read")) {
    changedDays += await dropDeletedIdeas(deps, participant.userId, connection.organizationId, {
      days,
      timeZone,
    });
  }

  await db
    .update(participants)
    .set({ lastCheckedAt: now, checkCursor: now })
    .where(eq(participants.id, participantId));
  if (changedDays > 0) {
    await db
      .update(challenges)
      .set({ boardVersion: sql`${challenges.boardVersion} + 1` })
      .where(eq(challenges.id, challenge.id));
  }

  const after = await db
    .select({ kind: seenPosts.matchKind })
    .from(seenPosts)
    .where(eq(seenPosts.participantId, participantId));
  return {
    status: "checked",
    posts: posts.length,
    changedDays,
    suggested: after.filter((seen) => seen.kind === "suggested").length,
    unmatched: after.filter((seen) => seen.kind === "none" || seen.kind === "rejected").length,
  };
}

/**
 * Clears the saved idea of each day whose idea is gone from Buffer, then sets the day's state
 * again: open, or missed once its date has passed. Only days with no posts depend on their idea.
 * Returns how many days changed. A failure here never fails the check; it tries again next time.
 */
async function dropDeletedIdeas(
  deps: BufferDeps,
  userId: string,
  organizationId: string,
  input: { days: DayRow[]; timeZone: string },
): Promise<number> {
  const ideaDays = input.days.filter((day) => day.bufferIdeaId && day.posts.length === 0);
  if (ideaDays.length === 0) return 0;
  try {
    const { found, complete } = await callBuffer(
      deps,
      userId,
      (requestOptions) =>
        findIdeas(
          { organizationId, ids: ideaDays.flatMap((day) => day.bufferIdeaId ?? []) },
          requestOptions,
        ),
      // A grant without ideas:read must not stop the connection for everything else.
      { scopeIsOptional: true },
    );
    // Only trusted when every page was read.
    if (!complete) return 0;
    let changed = 0;
    for (const day of ideaDays) {
      if (!day.bufferIdeaId || found.has(day.bufferIdeaId)) continue;
      await deps.db.update(entries).set({ bufferIdeaId: null }).where(eq(entries.id, day.id));
      day.bufferIdeaId = null;
      if (await refreshDayState(deps.db, day.id, day.date, input.timeZone)) changed += 1;
    }
    return changed;
  } catch (error) {
    // The class name and Buffer's message only, never the request or a token.
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.warn("Reading Buffer ideas failed; days keep their ideas until the next check", reason);
    return 0;
  }
}

/**
 * The days a post written elsewhere could answer: this week's open prompts and any catch-up
 * days, closest to today first, at most ten.
 */
export function candidatesFor(
  days: Pick<DayRow, "id" | "date" | "state" | "title" | "description" | "posts">[],
  today: LocalDate,
): MatchCandidate[] {
  const weekEnd = addDays(today, 6);
  return days
    .filter(
      (day) =>
        day.posts.length === 0 &&
        (day.state === "open" || day.state === "missed" || day.state === "saved") &&
        day.date <= weekEnd,
    )
    .sort((a, b) => Math.abs(daysBetween(today, a.date)) - Math.abs(daysBetween(today, b.date)))
    .slice(0, MAX_CANDIDATES)
    .map((day) => ({ id: day.id, title: day.title, description: day.description }));
}

/** Records a post on its day and sets the day's state from all its posts. */
async function applyPost(
  db: Database,
  day: DayRow,
  post: BufferPost,
  timeZone: string,
  kind: PostMatchKind,
  confidence: number | null,
): Promise<boolean> {
  const matchSource = kind === "app" ? "app" : kind === "manual" ? "manual" : "matcher";
  const facts = {
    channelId: post.channelId,
    bufferPostId: post.id,
    status: post.status,
    dueAt: post.dueAt ? new Date(post.dueAt) : null,
    sentAt: post.sentAt ? new Date(post.sentAt) : null,
    externalLink: post.externalLink,
  };
  const existing = day.posts.find((p) => p.bufferPostId === post.id);
  const changed = await upsertDayPost(db, day.id, facts, {
    // An app or hand-picked post keeps its source; the matcher only fills new ones.
    matchSource: existing?.matchSource ?? matchSource,
    confidence: existing?.matchConfidence ?? (matchSource === "matcher" ? confidence : null),
    confirmedByUser: existing?.confirmedByUser ?? matchSource === "manual",
  });
  if (changed) {
    const rest = day.posts.filter((p) => p.channelId !== post.channelId);
    day.posts = [
      ...rest,
      { ...(existing ?? ({} as EntryPost)), ...facts, entryId: day.id } as EntryPost,
    ];
  }
  const stateChanged = await refreshDayState(db, day.id, day.date, timeZone);
  return changed || stateChanged;
}

async function channelNameMap(db: Database, userId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({
      id: channels.bufferChannelId,
      name: channels.name,
      displayName: channels.displayName,
    })
    .from(channels)
    .where(eq(channels.userId, userId));
  return new Map(rows.map((row) => [row.id, row.displayName || row.name]));
}

/**
 * Warns before the next post when a counted channel is disconnected or its queue is paused.
 * Channels sync from Buffer at most once a day here; a healthy channel clears its warnings.
 */
async function checkChannelHealth(
  deps: BufferDeps,
  participant: { id: string; userId: string; channelIds: string[] },
  today: LocalDate,
  now: Date,
): Promise<void> {
  const { db } = deps;
  const counted = () =>
    db
      .select()
      .from(channels)
      .where(
        and(
          eq(channels.userId, participant.userId),
          inArray(channels.bufferChannelId, participant.channelIds),
        ),
      );
  let rows = await counted();
  if (rows.some((channel) => now.getTime() - channel.syncedAt.getTime() > CHANNEL_SYNC_MS)) {
    await syncChannels(deps, participant.userId);
    rows = await counted();
  }
  for (const channel of rows) {
    const name = channel.displayName || channel.name;
    const problems: [AlertKind, boolean][] = [
      ["channel_disconnected", channel.isDisconnected],
      ["queue_paused", channel.isQueuePaused],
    ];
    for (const [kind, active] of problems) {
      if (active) {
        await raiseAlert(
          db,
          participant.id,
          kind,
          `${kind}:${participant.id}:${channel.bufferChannelId}:${today}`,
          {
            channelId: channel.bufferChannelId,
            channelName: name,
          },
        );
      } else {
        await db
          .update(alerts)
          .set({ readAt: now })
          .where(
            and(
              eq(alerts.participantId, participant.id),
              eq(alerts.kind, kind),
              isNull(alerts.readAt),
              sql`${alerts.payload}->>'channelId' = ${channel.bufferChannelId}`,
            ),
          );
      }
    }
  }
}

/** Adds an alert unless one with the same key exists. */
export async function raiseAlert(
  db: Database,
  participantId: string,
  kind: AlertKind,
  dedupeKey: string,
  payload: AlertPayload,
): Promise<void> {
  await db.insert(alerts).values({ participantId, kind, dedupeKey, payload }).onConflictDoNothing();
}

async function resolveAlerts(
  db: Database,
  participantId: string,
  kinds: AlertKind[],
): Promise<void> {
  await db
    .update(alerts)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(alerts.participantId, participantId),
        inArray(alerts.kind, kinds),
        isNull(alerts.readAt),
      ),
    );
}

export type { SeenPost };
