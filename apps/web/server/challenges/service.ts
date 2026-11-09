// Challenges: creating them, joining them and reading them. Only database work happens here;
// Buffer calls live in save.ts and templates.ts.
import {
  and,
  asc,
  type Challenge,
  type ChallengePrompt,
  type Database,
  type Entry,
  type EntryPost,
  type EntryState,
  eq,
  inArray,
  type Participant,
  STARTER_SETS,
  schema,
  sql,
  type User,
} from "@daydeck/db";
import {
  type DayPosition,
  dayOneFor,
  localDateOf,
  localDayRange,
  positionOn,
  promptDates,
  scheduleTimeZone,
} from "@/lib/day-engine";
import { deletionCountdown } from "../account/retention";
import { isBanned } from "../community/moderation";
import { postsByEntry } from "../progress/day-posts";
import { generateInviteCode, slugFor, tagNameFor } from "./codes";

const { challenges, challengePrompts, participants, entries, users, channels } = schema;

export interface PromptInput {
  title: string;
  description: string;
  body: string;
  emoji: string;
  /** A short label over the day, such as the week's theme. Empty when there is none. */
  theme?: string;
  /** What to do, as short steps. */
  steps?: string[];
  bufferTemplateId: string | null;
}

export interface CreateChallengeInput {
  title: string;
  prompts: PromptInput[];
  cadence: "daily" | "weekdays";
  startMode: "fixed" | "rolling";
  /** The fixed start date, or for rolling challenges the day joining opens. */
  startDate: string;
  timezone: string;
  visibility: "private" | "public";
  /** Listed on the homepage while active. Only kept for a public challenge. Off when missing. */
  showOnHome?: boolean;
  /** Buffer services whose posts count, such as "linkedin". Empty or missing means all. */
  allowedServices?: string[];
  /** Group chat and shared posts. On when missing. */
  chatEnabled?: boolean;
}

/** Limits a channel query to the challenge's networks, when it has a list. */
function onAllowedNetworks(allowed: string[]) {
  return allowed.length > 0 ? inArray(channels.service, allowed) : undefined;
}

/** The person's day boundaries: their own time zone, or the challenge's when they have none. */
export function timeZoneOfUser(user: Pick<User, "timezone">, fallback: string): string {
  return user.timezone ?? fallback;
}

/** Buffer channel IDs the person picked on the channels page, to prefill a challenge. */
export async function selectedChannelIds(
  db: Database,
  userId: string,
  allowed: string[] = [],
): Promise<string[]> {
  const rows = await db
    .select({ id: channels.bufferChannelId })
    .from(channels)
    .where(
      and(
        eq(channels.userId, userId),
        eq(channels.selected, true),
        eq(channels.isDisconnected, false),
        eq(channels.isLocked, false),
        onAllowedNetworks(allowed),
      ),
    );
  return rows.map((row) => row.id);
}

/** Keeps only IDs of the person's own usable channels, on the challenge's networks. */
export async function usableChannelIds(
  db: Database,
  userId: string,
  requested: string[],
  allowed: string[] = [],
): Promise<string[]> {
  if (requested.length === 0) return [];
  const rows = await db
    .select({ id: channels.bufferChannelId })
    .from(channels)
    .where(
      and(
        eq(channels.userId, userId),
        inArray(channels.bufferChannelId, requested),
        eq(channels.isDisconnected, false),
        eq(channels.isLocked, false),
        onAllowedNetworks(allowed),
      ),
    );
  return rows.map((row) => row.id);
}

/**
 * Creates the challenge with its own copy of the prompts, and makes the host its first
 * participant (with the channels they picked on the channels page).
 */
export async function createChallenge(
  db: Database,
  host: User,
  input: CreateChallengeInput,
  now: Date,
): Promise<Challenge> {
  const allowedServices = [...new Set(input.allowedServices ?? [])];
  const hostChannels = await selectedChannelIds(db, host.id, allowedServices);
  const dates = promptDates(input.startDate, input.cadence, input.prompts.length);
  const lastDate = dates.at(-1);
  const endsAt =
    input.startMode === "fixed" && lastDate ? localDayRange(lastDate, input.timezone).end : null;

  return db.transaction(async (tx) => {
    const [challenge] = await tx
      .insert(challenges)
      .values({
        slug: slugFor(input.title),
        hostUserId: host.id,
        title: input.title,
        cadence: input.cadence,
        startMode: input.startMode,
        startDate: input.startDate,
        timezone: input.timezone,
        visibility: input.visibility,
        showOnHome: input.visibility === "public" && (input.showOnHome ?? false),
        allowedServices,
        chatEnabled: input.chatEnabled ?? true,
        inviteCode: generateInviteCode(),
        tagName: tagNameFor(input.title),
        endsAt,
      })
      .returning();
    if (!challenge) throw new Error("Creating the challenge returned no row");

    const prompts = await tx
      .insert(challengePrompts)
      .values(
        input.prompts.map((prompt, dayIndex) => ({
          challengeId: challenge.id,
          dayIndex,
          ...prompt,
        })),
      )
      .returning({ id: challengePrompts.id });

    const participantTimeZone = timeZoneOfUser(host, input.timezone);
    const [participant] = await tx
      .insert(participants)
      .values({
        challengeId: challenge.id,
        userId: host.id,
        role: "host",
        joinedAt: now,
        dayOne: dayOneFor(challenge, now, participantTimeZone),
        timezone: participantTimeZone,
        channelIds: hostChannels,
      })
      .returning({ id: participants.id });
    if (!participant) throw new Error("Adding the host returned no row");

    await tx
      .insert(entries)
      .values(
        prompts.map((prompt) => ({ participantId: participant.id, challengePromptId: prompt.id })),
      );
    return challenge;
  });
}

/** Joining was refused, with a message people can read. */
export class JoinRefusedError extends Error {
  override name = "JoinRefusedError";
}

/** Adds the person to the challenge, or returns their existing participation. */
export async function joinChallenge(
  db: Database,
  user: User,
  challenge: Challenge,
  requestedChannelIds: string[],
  now: Date,
): Promise<Participant> {
  // A banned Buffer account never gets back in, whatever link it uses.
  if (await isBanned(db, challenge.id, user.bufferAccountId)) {
    throw new JoinRefusedError("You cannot join this challenge.");
  }
  const channelIds = await usableChannelIds(
    db,
    user.id,
    requestedChannelIds,
    challenge.allowedServices,
  );
  const participantTimeZone = timeZoneOfUser(user, challenge.timezone);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(participants)
      .where(and(eq(participants.challengeId, challenge.id), eq(participants.userId, user.id)));
    if (existing) {
      if (existing.status === "active") return existing;
      const [rejoined] = await tx
        .update(participants)
        .set({ status: "active", channelIds })
        .where(eq(participants.id, existing.id))
        .returning();
      return rejoined ?? existing;
    }

    const [participant] = await tx
      .insert(participants)
      .values({
        challengeId: challenge.id,
        userId: user.id,
        role: "participant",
        joinedAt: now,
        dayOne: dayOneFor(challenge, now, participantTimeZone),
        timezone: participantTimeZone,
        channelIds,
      })
      .returning();
    if (!participant) throw new Error("Joining returned no row");

    const prompts = await tx
      .select({ id: challengePrompts.id })
      .from(challengePrompts)
      .where(eq(challengePrompts.challengeId, challenge.id));
    await tx
      .insert(entries)
      .values(
        prompts.map((prompt) => ({ participantId: participant.id, challengePromptId: prompt.id })),
      );
    await tx
      .update(challenges)
      .set({ boardVersion: sql`${challenges.boardVersion} + 1` })
      .where(eq(challenges.id, challenge.id));
    return participant;
  });
}

export async function getChallengeByInvite(db: Database, inviteCode: string) {
  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.inviteCode, inviteCode));
  return challenge ?? null;
}

/** What the invite page shows: host, schedule, first prompts and who is in. No private data. */
export async function invitePreview(db: Database, challenge: Challenge) {
  const [host] = await db
    .select({ name: users.name, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, challenge.hostUserId));
  const prompts = await db
    .select({ title: challengePrompts.title, emoji: challengePrompts.emoji })
    .from(challengePrompts)
    .where(eq(challengePrompts.challengeId, challenge.id))
    .orderBy(asc(challengePrompts.dayIndex));
  // `shown`: the host, or someone who chose to be named on the public recap. A challenge listed
  // on the homepage names only these people on its invite page.
  const members = await db
    .select({
      userId: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      shown: sql<boolean>`(${participants.wallOptIn} or ${participants.role} = 'host')`,
    })
    .from(participants)
    .innerJoin(users, eq(users.id, participants.userId))
    .where(and(eq(participants.challengeId, challenge.id), eq(participants.status, "active")))
    .orderBy(asc(participants.joinedAt));
  return { host: host ?? { name: null, avatarUrl: null }, prompts, members };
}

export interface DayView {
  prompt: ChallengePrompt;
  entry: Entry;
  /** The day's Buffer posts, at most one per channel. */
  posts: EntryPost[];
  /** The local date of this prompt for this participant. */
  date: string;
}

/** Everything the challenge page needs, for a member. Null when the person is not a member. */
/**
 * The few fields the breadcrumb bar above a challenge's pages needs: its title, and for the
 * host of an open challenge, the invite code. Null when the person is not an active member.
 */
export async function challengeHeader(db: Database, slug: string, userId: string) {
  const [found] = await db
    .select({
      title: challenges.title,
      slug: challenges.slug,
      status: challenges.status,
      inviteCode: challenges.inviteCode,
      invitePaused: challenges.invitePaused,
      role: participants.role,
    })
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
  if (!found) return null;
  const canInvite = found.role === "host" && found.status === "open";
  return {
    title: found.title,
    slug: found.slug,
    inviteCode: canInvite ? found.inviteCode : null,
    invitePaused: found.invitePaused,
  };
}

export async function challengeForMember(db: Database, slug: string, userId: string, now: Date) {
  // One query for the challenge and this person's place in it, then the rest at the same time:
  // each round trip to the database counts, so none waits on another it does not need.
  const [found] = await db
    .select({ challenge: challenges, participant: participants })
    .from(challenges)
    .leftJoin(
      participants,
      and(
        eq(participants.challengeId, challenges.id),
        eq(participants.userId, userId),
        eq(participants.status, "active"),
      ),
    )
    .where(eq(challenges.slug, slug));
  if (!found) return null;
  const { challenge, participant } = found;
  if (!participant) return { challenge, participant: null } as const;

  const [prompts, rows, memberCount] = await Promise.all([
    db
      .select()
      .from(challengePrompts)
      .where(eq(challengePrompts.challengeId, challenge.id))
      .orderBy(asc(challengePrompts.dayIndex)),
    db.select().from(entries).where(eq(entries.participantId, participant.id)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(participants)
      .where(and(eq(participants.challengeId, challenge.id), eq(participants.status, "active"))),
  ]);
  const entryByPrompt = new Map(rows.map((entry) => [entry.challengePromptId, entry]));

  const timeZone = scheduleTimeZone(challenge, participant.timezone);
  const dates = promptDates(participant.dayOne, challenge.cadence, prompts.length);
  const postsOf = await postsByEntry(
    db,
    [...entryByPrompt.values()].map((entry) => entry.id),
  );
  const days: DayView[] = prompts.flatMap((prompt, index) => {
    const entry = entryByPrompt.get(prompt.id);
    const date = dates[index];
    return entry && date ? [{ prompt, entry, posts: postsOf.get(entry.id) ?? [], date }] : [];
  });

  return {
    challenge,
    participant,
    days,
    dates,
    timeZone,
    today: localDateOf(now, timeZone),
    memberCount: memberCount[0]?.count ?? 1,
  } as const;
}

/** The person's challenges, newest first, with their role. */
export async function listChallenges(db: Database, userId: string) {
  return db
    .select({
      slug: challenges.slug,
      title: challenges.title,
      role: participants.role,
      cadence: challenges.cadence,
      startMode: challenges.startMode,
      startDate: challenges.startDate,
      status: challenges.status,
    })
    .from(participants)
    .innerJoin(challenges, eq(challenges.id, participants.challengeId))
    .where(and(eq(participants.userId, userId), eq(participants.status, "active")))
    .orderBy(sql`${participants.joinedAt} desc`);
}

/** Changes which channels count for one participant. */
export async function setParticipantChannels(
  db: Database,
  participant: Participant,
  requested: string[],
): Promise<string[]> {
  const [challenge] = await db
    .select({ allowedServices: challenges.allowedServices })
    .from(challenges)
    .where(eq(challenges.id, participant.challengeId));
  const channelIds = await usableChannelIds(
    db,
    participant.userId,
    requested,
    challenge?.allowedServices ?? [],
  );
  await db.update(participants).set({ channelIds }).where(eq(participants.id, participant.id));
  return channelIds;
}

/** The starter prompt sets, with their prompts in order, for the setup wizard. */
export async function starterSets(db: Database) {
  const { promptSets, prompts } = schema;
  const sets = await db
    .select()
    .from(promptSets)
    .where(eq(promptSets.source, "starter"))
    .orderBy(asc(promptSets.createdAt), asc(promptSets.slug));
  if (sets.length === 0) return [];
  const rows = await db
    .select()
    .from(prompts)
    .where(
      inArray(
        prompts.promptSetId,
        sets.map((set) => set.id),
      ),
    )
    .orderBy(asc(prompts.position));
  // The order of the seed file: the first set is the recommended one.
  const order = (slug: string | null) => {
    const index = STARTER_SETS.findIndex((set) => set.slug === slug);
    return index === -1 ? STARTER_SETS.length : index;
  };
  sets.sort((a, b) => order(a.slug) - order(b.slug));
  return sets.map((set) => ({
    slug: set.slug ?? set.id,
    title: set.title,
    description: set.description,
    prompts: rows
      .filter((row) => row.promptSetId === set.id)
      .map((row) => ({
        title: row.title,
        description: row.description,
        body: row.body,
        emoji: row.emoji,
        bufferTemplateId: row.bufferTemplateId,
      })),
  }));
}

export interface ChallengeToday {
  slug: string;
  title: string;
  role: "host" | "participant";
  days: number;
  position: DayPosition;
  /** Today's prompt (or the next one on a rest day), with its state. */
  prompt: { dayNumber: number; title: string; emoji: string; state: EntryState } | null;
  savedCount: number;
  status: "open" | "closed";
  /** When the challenge closed, as an ISO string; its data is deleted 30 days later. */
  closedAt: string | null;
  /** For a closed challenge: the day it is deleted, in your time zone, and how many days away. */
  deletion: { date: string; days: number } | null;
  memberCount: number;
  /** Your state on each day, in order; a passed day without a post shows as waiting. */
  strip: EntryState[];
}

/**
 * Where each of the person's challenges stands today, for the home page. Three queries, however
 * many challenges there are.
 */
export async function todayOverview(
  db: Database,
  userId: string,
  now: Date,
): Promise<ChallengeToday[]> {
  const memberships = await db
    .select({ challenge: challenges, participant: participants })
    .from(participants)
    .innerJoin(challenges, eq(challenges.id, participants.challengeId))
    .where(and(eq(participants.userId, userId), eq(participants.status, "active")))
    .orderBy(sql`${participants.joinedAt} desc`);
  if (memberships.length === 0) return [];

  const challengeIds = memberships.map((row) => row.challenge.id);
  const participantIds = memberships.map((row) => row.participant.id);
  const [promptRows, entryRows, counts] = await Promise.all([
    db
      .select()
      .from(challengePrompts)
      .where(inArray(challengePrompts.challengeId, challengeIds))
      .orderBy(asc(challengePrompts.dayIndex)),
    db.select().from(entries).where(inArray(entries.participantId, participantIds)),
    db
      .select({ challengeId: participants.challengeId, count: sql<number>`count(*)::int` })
      .from(participants)
      .where(
        and(inArray(participants.challengeId, challengeIds), eq(participants.status, "active")),
      )
      .groupBy(participants.challengeId),
  ]);
  const memberCountOf = new Map(counts.map((row) => [row.challengeId, row.count]));
  const entryByKey = new Map(
    entryRows.map((entry) => [`${entry.participantId}:${entry.challengePromptId}`, entry]),
  );

  return memberships.map(({ challenge, participant }) => {
    const prompts = promptRows.filter((prompt) => prompt.challengeId === challenge.id);
    const timeZone = scheduleTimeZone(challenge, participant.timezone);
    const dates = promptDates(participant.dayOne, challenge.cadence, prompts.length);
    const today = localDateOf(now, timeZone);
    const position = positionOn(today, dates);
    const index =
      position.kind === "prompt"
        ? position.index
        : position.kind === "rest"
          ? position.nextIndex
          : position.kind === "before"
            ? 0
            : -1;
    const prompt = index >= 0 ? prompts[index] : undefined;
    const states: EntryState[] = prompts.map(
      (p) => entryByKey.get(`${participant.id}:${p.id}`)?.state ?? "open",
    );
    const strip = states.map((state, day) => {
      const date = dates[day] ?? today;
      if (participant.pauseDates.includes(date) && (state === "open" || state === "missed")) {
        return "paused" as const;
      }
      return state === "open" && date < today ? ("missed" as const) : state;
    });
    return {
      slug: challenge.slug,
      title: challenge.title,
      role: participant.role,
      days: prompts.length,
      position,
      prompt: prompt
        ? {
            dayNumber: prompt.dayIndex + 1,
            title: prompt.title,
            emoji: prompt.emoji,
            state: states[index] ?? "open",
          }
        : null,
      savedCount: states.filter((state) => state !== "open" && state !== "missed").length,
      status: challenge.status,
      closedAt: challenge.closedAt?.toISOString() ?? null,
      deletion:
        challenge.status === "closed" && challenge.closedAt
          ? deletionCountdown(
              { closedAt: challenge.closedAt, timeZone: challenge.timezone },
              now,
              participant.timezone,
            )
          : null,
      memberCount: memberCountOf.get(challenge.id) ?? 1,
      strip,
    };
  });
}
