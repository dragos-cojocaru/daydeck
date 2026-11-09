// "Download a copy": everything Daydeck keeps about one person, as plain JSON. Only their own
// rows. Never access tokens, session IDs, post text hashes, or anything other people wrote.
import { asc, type Database, eq, inArray, schema, sql } from "@daydeck/db";

const {
  alerts,
  bufferConnections,
  challengeBans,
  challengePrompts,
  challenges,
  channels,
  entries,
  entryPosts,
  feedbackItems,
  feedbackRequests,
  messageReactions,
  messages,
  participants,
  readMarks,
  seenPosts,
  sessions,
  users,
} = schema;

export const EXPORT_FORMAT = "daydeck-data-export";

/** The whole file. Each list holds the person's own rows only. */
export async function exportMyData(db: Database, userId: string, now: Date) {
  const [user] = await db
    .select({
      bufferAccountId: users.bufferAccountId,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      timezone: users.timezone,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) return null;

  const mine = await db
    .select({ participant: participants, challenge: challenges })
    .from(participants)
    .innerJoin(challenges, eq(challenges.id, participants.challengeId))
    .where(eq(participants.userId, userId))
    .orderBy(asc(participants.joinedAt));
  const ids = mine.map((row) => row.participant.id);
  // Which challenge each of the person's rows belongs to, by slug.
  const slugOf = new Map(mine.map((row) => [row.participant.id, row.challenge.slug]));
  const ifAny = <T>(query: () => Promise<T[]>): Promise<T[]> =>
    ids.length ? query() : Promise.resolve([]);

  const [
    connection,
    sessionRows,
    channelRows,
    dayRows,
    postRows,
    seenRows,
    asked,
    written,
    messageRows,
    reactionRows,
    markRows,
    alertRows,
    banRows,
  ] = await Promise.all([
    db
      .select({
        organizationId: bufferConnections.organizationId,
        scopes: bufferConnections.scopes,
        status: bufferConnections.status,
        grantedAt: bufferConnections.grantedAt,
        refreshedAt: bufferConnections.refreshedAt,
      })
      .from(bufferConnections)
      .where(eq(bufferConnections.userId, userId)),
    db
      .select({ createdAt: sessions.createdAt, expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(asc(sessions.createdAt)),
    db
      .select({
        bufferChannelId: channels.bufferChannelId,
        organizationId: channels.organizationId,
        service: channels.service,
        name: channels.name,
        displayName: channels.displayName,
        avatarUrl: channels.avatarUrl,
        timezone: channels.timezone,
        countsForChallenges: channels.selected,
        disconnected: channels.isDisconnected,
        queuePaused: channels.isQueuePaused,
        locked: channels.isLocked,
        postingSchedule: channels.postingSchedule,
        syncedAt: channels.syncedAt,
      })
      .from(channels)
      .where(eq(channels.userId, userId))
      .orderBy(asc(channels.name)),
    ifAny(() =>
      db
        .select({
          id: entries.id,
          participantId: entries.participantId,
          day: challengePrompts.dayIndex,
          prompt: challengePrompts.title,
          state: entries.state,
          bufferIdeaId: entries.bufferIdeaId,
          createdAt: entries.createdAt,
          updatedAt: entries.updatedAt,
        })
        .from(entries)
        .innerJoin(challengePrompts, eq(challengePrompts.id, entries.challengePromptId))
        .where(inArray(entries.participantId, ids))
        .orderBy(asc(challengePrompts.dayIndex)),
    ),
    ifAny(() =>
      db
        .select({
          entryId: entryPosts.entryId,
          bufferPostId: entryPosts.bufferPostId,
          channelId: entryPosts.channelId,
          status: entryPosts.status,
          matchedBy: entryPosts.matchSource,
          matchConfidence: entryPosts.matchConfidence,
          confirmedByYou: entryPosts.confirmedByUser,
          dueAt: entryPosts.dueAt,
          sentAt: entryPosts.sentAt,
          link: entryPosts.externalLink,
          createdAt: entryPosts.createdAt,
        })
        .from(entryPosts)
        .innerJoin(entries, eq(entries.id, entryPosts.entryId))
        .where(inArray(entries.participantId, ids)),
    ),
    ifAny(() =>
      db
        .select({
          participantId: seenPosts.participantId,
          bufferPostId: seenPosts.bufferPostId,
          channelId: seenPosts.channelId,
          status: seenPosts.status,
          match: seenPosts.matchKind,
          dueAt: seenPosts.dueAt,
          sentAt: seenPosts.sentAt,
          link: seenPosts.externalLink,
          // The post's first 100 characters, only while it waits for its day.
          preview: seenPosts.preview,
          firstSeenAt: seenPosts.firstSeenAt,
          lastSeenAt: seenPosts.lastSeenAt,
        })
        .from(seenPosts)
        .where(inArray(seenPosts.participantId, ids))
        .orderBy(asc(seenPosts.firstSeenAt)),
    ),
    ifAny(() =>
      db
        .select({
          id: feedbackRequests.id,
          participantId: feedbackRequests.requesterId,
          bufferPostId: feedbackRequests.bufferPostId,
          draft: feedbackRequests.draftSnapshot,
          status: feedbackRequests.status,
          createdAt: feedbackRequests.createdAt,
        })
        .from(feedbackRequests)
        .where(inArray(feedbackRequests.requesterId, ids))
        .orderBy(asc(feedbackRequests.createdAt)),
    ),
    ifAny(() =>
      db
        .select({
          participantId: feedbackItems.authorId,
          requestId: feedbackItems.requestId,
          text: feedbackItems.text,
          noteStatus: feedbackItems.noteStatus,
          writtenAt: feedbackItems.writtenAt,
          createdAt: feedbackItems.createdAt,
        })
        .from(feedbackItems)
        .where(inArray(feedbackItems.authorId, ids))
        .orderBy(asc(feedbackItems.createdAt)),
    ),
    db
      .select({
        id: messages.id,
        challenge: challenges.slug,
        place: messages.channel,
        kind: messages.kind,
        text: messages.body,
        link: messages.linkUrl,
        replyToId: messages.replyToId,
        createdAt: messages.createdAt,
        editedAt: messages.editedAt,
      })
      .from(messages)
      .innerJoin(challenges, eq(challenges.id, messages.challengeId))
      .where(eq(messages.authorId, userId))
      .orderBy(asc(messages.createdAt)),
    db
      .select({
        messageId: messageReactions.messageId,
        challenge: challenges.slug,
        emoji: messageReactions.emoji,
        createdAt: messageReactions.createdAt,
      })
      .from(messageReactions)
      .innerJoin(messages, eq(messages.id, messageReactions.messageId))
      .innerJoin(challenges, eq(challenges.id, messages.challengeId))
      .where(eq(messageReactions.userId, userId))
      .orderBy(asc(messageReactions.createdAt)),
    ifAny(() =>
      db
        .select({
          participantId: readMarks.participantId,
          place: readMarks.place,
          readAt: readMarks.readAt,
        })
        .from(readMarks)
        .where(inArray(readMarks.participantId, ids)),
    ),
    ifAny(() =>
      db
        .select({
          participantId: alerts.participantId,
          kind: alerts.kind,
          details: alerts.payload,
          createdAt: alerts.createdAt,
          readAt: alerts.readAt,
        })
        .from(alerts)
        .where(inArray(alerts.participantId, ids))
        .orderBy(asc(alerts.createdAt)),
    ),
    db
      .select({
        challenge: challenges.title,
        nameKept: challengeBans.name,
        createdAt: challengeBans.createdAt,
      })
      .from(challengeBans)
      .innerJoin(challenges, eq(challenges.id, challengeBans.challengeId))
      .where(
        sql`${challengeBans.userId} = ${userId} or ${challengeBans.bufferAccountId} = ${user.bufferAccountId}`,
      ),
  ]);

  // Turn a participant row's ID into the challenge it belongs to, and drop the internal ID.
  const inChallenge = <T extends { participantId: string }>({ participantId, ...rest }: T) => ({
    challenge: slugOf.get(participantId) ?? null,
    ...rest,
  });
  const postsOf = new Map<string, typeof postRows>();
  for (const post of postRows)
    postsOf.set(post.entryId, [...(postsOf.get(post.entryId) ?? []), post]);

  return {
    format: EXPORT_FORMAT,
    version: 1,
    exportedAt: now.toISOString(),
    about:
      "Everything Daydeck keeps about you. Your posts themselves stay in Buffer. Other people's messages and names are not included.",
    account: user,
    bufferConnection: connection[0] ?? null,
    signIns: sessionRows,
    channels: channelRows,
    challenges: mine.map(({ participant, challenge }) => ({
      slug: challenge.slug,
      title: challenge.title,
      role: participant.role,
      challengeStatus: challenge.status,
      boardAndRecap: challenge.visibility === "public" ? "anyone with the link" : "members only",
      onDaydecksHomepage: challenge.showOnHome,
      joinedAt: participant.joinedAt,
      dayOne: participant.dayOne,
      timezone: participant.timezone,
      channelIds: participant.channelIds,
      showOnRecap: participant.wallOptIn,
      notificationsOff: participant.mutedPlaces,
      pausedDays: participant.pauseDates,
      lastCheckedAt: participant.lastCheckedAt,
      days: dayRows
        .filter((day) => day.participantId === participant.id)
        .map(({ id, participantId: _, ...day }) => ({
          ...day,
          posts: (postsOf.get(id) ?? []).map(({ entryId: _entry, ...post }) => post),
        })),
    })),
    postsSeen: seenRows.map(inChallenge),
    feedbackYouAskedFor: asked.map(inChallenge),
    feedbackYouWrote: written.map(inChallenge),
    messages: messageRows,
    reactions: reactionRows,
    lastRead: markRows.map(inChallenge),
    alerts: alertRows.map(inChallenge),
    bans: banRows,
  };
}

export type MyDataExport = NonNullable<Awaited<ReturnType<typeof exportMyData>>>;
