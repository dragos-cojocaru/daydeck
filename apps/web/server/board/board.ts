// The board: everyone in a challenge by day. Columns are day numbers, not dates, because in a
// rolling challenge each person's day 1 is the day they joined. Database only: showing the
// board never costs a Buffer request.
import { and, asc, type Database, type EntryState, eq, schema } from "@daydeck/db";
import { localDateOf, positionOn, promptDates, scheduleTimeZone } from "@/lib/day-engine";
import { postsByEntry } from "@/server/progress/day-posts";

const { challengePrompts, challenges, channels, entries, participants, users } = schema;

/** What a board cell shows. "missed" reads as "waiting": a day to catch up, never a failure. */
export type CellState = EntryState;

export interface BoardCell {
  state: CellState;
  /** The full spoken label, for example "Ana, day 3, posted: A tool you use every day". */
  label: string;
}

export interface BoardRow {
  participantId: string;
  name: string;
  avatarUrl: string | null;
  isYou: boolean;
  isHost: boolean;
  /** This person's day today, or null before their day 1 or after the last day. */
  todayIndex: number | null;
  cells: BoardCell[];
  /** The local date ("YYYY-MM-DD") of each day, in order. In a rolling challenge they differ by person. */
  dates: string[];
}

/** One of the viewer's own posts, on one channel. Other people's are never sent. */
export interface YourPost {
  dayIndex: number;
  channelId: string;
  channelName: string;
  /** Buffer's service key, for the network's logo. */
  service: string;
  /** Buffer's status: draft, scheduled, sent and so on. */
  status: string;
  /** When it is scheduled to publish, as an ISO string. */
  dueAt: string | null;
  /** When it was published, as an ISO string. */
  sentAt: string | null;
  link: string | null;
}

export interface BoardData {
  /** Changes when progress changes or a new day starts; the live board polls with it. */
  cursor: string;
  title: string;
  days: { number: number; title: string }[];
  rows: BoardRow[];
  /** The viewer's day today, highlighted on the board. */
  viewerTodayIndex: number | null;
  /** The viewer's local date today, and the time zone their days follow. */
  viewerToday: string;
  timeZone: string;
  yourPosts: YourPost[];
  /** The viewer's channels that count in this challenge, for links to their Buffer schedule. */
  yourChannels: { id: string; name: string }[];
}

const STATE_WORDS: Record<CellState, string> = {
  open: "not saved yet",
  saved: "saved to Buffer",
  planned: "scheduled in Buffer",
  done: "posted",
  caught_up: "caught up",
  missed: "waiting to catch up",
  paused: "paused",
};

export function stateWords(state: CellState): string {
  return STATE_WORDS[state];
}

/**
 * The board of one challenge, for one viewer who is a member. The viewer comes first, then the
 * host, then everyone else in the order they joined. Returns null for a non-member.
 */
export async function loadBoard(
  db: Database,
  slug: string,
  viewerUserId: string,
  now: Date,
): Promise<BoardData | null> {
  const [challenge] = await db.select().from(challenges).where(eq(challenges.slug, slug));
  if (!challenge) return null;

  const [members, prompts] = await Promise.all([
    db
      .select({ participant: participants, user: users })
      .from(participants)
      .innerJoin(users, eq(users.id, participants.userId))
      .where(and(eq(participants.challengeId, challenge.id), eq(participants.status, "active")))
      .orderBy(asc(participants.joinedAt)),
    db
      .select()
      .from(challengePrompts)
      .where(eq(challengePrompts.challengeId, challenge.id))
      .orderBy(asc(challengePrompts.dayIndex)),
  ]);
  const viewer = members.find((member) => member.user.id === viewerUserId);
  if (!viewer) return null;

  const entryRows = await db
    .select({
      participantId: entries.participantId,
      promptId: entries.challengePromptId,
      state: entries.state,
      entryId: entries.id,
    })
    .from(entries)
    .innerJoin(participants, eq(participants.id, entries.participantId))
    .where(eq(participants.challengeId, challenge.id));
  const stateOf = new Map(
    entryRows.map((row) => [`${row.participantId}:${row.promptId}`, row.state]),
  );

  const rows: BoardRow[] = members.map(({ participant, user }) => {
    const timeZone = scheduleTimeZone(challenge, participant.timezone);
    const today = localDateOf(now, timeZone);
    const dates = promptDates(participant.dayOne, challenge.cadence, prompts.length);
    const position = positionOn(today, dates);
    const name = user.name ?? "Someone";
    const cells = prompts.map((prompt) => {
      const date = dates[prompt.dayIndex] ?? today;
      let state: CellState = stateOf.get(`${participant.id}:${prompt.id}`) ?? "open";
      // A passed day shows as waiting at once, before the rollover job marks it.
      if (state === "open" && date < today) state = "missed";
      if (participant.pauseDates.includes(date) && (state === "open" || state === "missed")) {
        state = "paused";
      }
      const title = `${prompt.emoji} ${prompt.title}`.trim();
      return {
        state,
        label: `${name}, day ${prompt.dayIndex + 1}, ${STATE_WORDS[state]}: ${title}`,
      };
    });
    return {
      participantId: participant.id,
      name,
      avatarUrl: user.avatarUrl,
      isYou: user.id === viewerUserId,
      isHost: participant.role === "host",
      todayIndex: position.kind === "prompt" ? position.index : null,
      cells,
      dates: prompts.map((prompt) => dates[prompt.dayIndex] ?? today),
    };
  });
  rows.sort((a, b) => Number(b.isYou) - Number(a.isYou) || Number(b.isHost) - Number(a.isHost));

  const viewerRow = rows.find((row) => row.isYou);
  const viewerTimeZone = scheduleTimeZone(challenge, viewer.participant.timezone);
  const viewerToday = localDateOf(now, viewerTimeZone);
  const dayIndexOf = new Map(prompts.map((prompt) => [prompt.id, prompt.dayIndex]));
  const viewerChannels = await db
    .select({
      id: channels.bufferChannelId,
      name: channels.name,
      displayName: channels.displayName,
      service: channels.service,
    })
    .from(channels)
    .where(eq(channels.userId, viewerUserId));
  const yourChannels = viewerChannels
    .filter((channel) => viewer.participant.channelIds.includes(channel.id))
    .map((channel) => ({ id: channel.id, name: channel.displayName || channel.name }));
  const ownEntries = entryRows.filter((row) => row.participantId === viewer.participant.id);
  const ownPosts = await postsByEntry(
    db,
    ownEntries.map((row) => row.entryId),
  );
  const channelOf = new Map(viewerChannels.map((channel) => [channel.id, channel]));
  const yourPosts: YourPost[] = ownEntries.flatMap((row) =>
    (ownPosts.get(row.entryId) ?? []).map((post) => {
      const channel = channelOf.get(post.channelId);
      return {
        dayIndex: dayIndexOf.get(row.promptId) ?? 0,
        channelId: post.channelId,
        channelName: channel ? channel.displayName || channel.name : "a channel",
        service: channel?.service ?? "",
        status: post.status,
        dueAt: post.dueAt?.toISOString() ?? null,
        sentAt: post.sentAt?.toISOString() ?? null,
        link: post.externalLink,
      };
    }),
  );
  return {
    cursor: `${challenge.boardVersion}:${members.length}:${viewerToday}`,
    title: challenge.title,
    days: prompts.map((prompt) => ({
      number: prompt.dayIndex + 1,
      title: `${prompt.emoji} ${prompt.title}`.trim(),
    })),
    rows,
    viewerTodayIndex: viewerRow?.todayIndex ?? null,
    viewerToday,
    timeZone: viewerTimeZone,
    yourPosts,
    yourChannels,
  };
}

/**
 * The live board's cheap first question: has anything changed? Reads one challenge row, the
 * member count and the viewer's time zone. Null for a non-member.
 */
export async function boardCursor(
  db: Database,
  slug: string,
  viewerUserId: string,
  now: Date,
): Promise<string | null> {
  const rows = await db
    .select({ challenge: challenges, participant: participants })
    .from(challenges)
    .innerJoin(participants, eq(participants.challengeId, challenges.id))
    .where(and(eq(challenges.slug, slug), eq(participants.status, "active")));
  const viewer = rows.find((row) => row.participant.userId === viewerUserId);
  if (!viewer) return null;
  const viewerToday = localDateOf(
    now,
    scheduleTimeZone(viewer.challenge, viewer.participant.timezone),
  );
  return `${viewer.challenge.boardVersion}:${rows.length}:${viewerToday}`;
}
