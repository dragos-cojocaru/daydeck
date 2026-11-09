// The recap: the whole challenge as one mosaic, with the posts of the people who chose to be
// shown. Public pages show only opted-in data: everyone else appears as an unnamed row.
import { and, asc, type Database, type EntryState, eq, schema } from "@daydeck/db";
import { localDateOf, promptDates, scheduleTimeZone } from "@/lib/day-engine";
import { postsByEntry } from "@/server/progress/day-posts";

const { challengePrompts, challenges, entries, participants, users } = schema;

export interface RecapRow {
  participantId: string;
  /** Null when this person has not opted in to the public recap. */
  name: string | null;
  avatarUrl: string | null;
  isYou: boolean;
  states: EntryState[];
  posted: number;
  /** Links to their sent posts, only for people who opted in. */
  links: { day: number; title: string; url: string }[];
}

export interface Recap {
  slug: string;
  title: string;
  isOpen: boolean;
  isPublic: boolean;
  days: number;
  people: number;
  posts: number;
  rows: RecapRow[];
  /** The viewer's own row, for the badge and the opt-in switch; null for visitors. */
  you: { participantId: string; wallOptIn: boolean; isHost: boolean } | null;
}

const FINISHED: EntryState[] = ["done", "caught_up"];

/** The recap, or null when this viewer may not see it (a private challenge, not a member). */
export async function loadRecap(
  db: Database,
  slug: string,
  viewerUserId: string | null,
  now: Date,
): Promise<Recap | null> {
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
  const viewer = members.find((member) => member.user.id === viewerUserId) ?? null;
  if (challenge.visibility !== "public" && !viewer) return null;

  const entryRows = await db
    .select({ entry: entries })
    .from(entries)
    .innerJoin(participants, eq(participants.id, entries.participantId))
    .where(eq(participants.challengeId, challenge.id));
  const byKey = new Map(
    entryRows.map(({ entry }) => [`${entry.participantId}:${entry.challengePromptId}`, entry]),
  );
  // The link to a day's published post: the first one, when it went out on several networks.
  const postsOf = await postsByEntry(
    db,
    entryRows.map(({ entry }) => entry.id),
  );
  const linkOf = (entryId: string) =>
    (postsOf.get(entryId) ?? [])
      .filter((post) => post.status === "sent" && post.externalLink)
      .sort((a, b) => (a.sentAt?.getTime() ?? 0) - (b.sentAt?.getTime() ?? 0))[0]?.externalLink ??
    null;

  const rows: RecapRow[] = members.map(({ participant, user }) => {
    const shown = participant.wallOptIn || user.id === viewerUserId;
    const today = localDateOf(now, scheduleTimeZone(challenge, participant.timezone));
    const dates = promptDates(participant.dayOne, challenge.cadence, prompts.length);
    const states = prompts.map((prompt) => {
      const state = byKey.get(`${participant.id}:${prompt.id}`)?.state ?? "open";
      const date = dates[prompt.dayIndex];
      return state === "open" && date && date < today ? "missed" : state;
    });
    const links = participant.wallOptIn
      ? prompts.flatMap((prompt) => {
          const entry = byKey.get(`${participant.id}:${prompt.id}`);
          const url = entry ? linkOf(entry.id) : null;
          return url && entry && FINISHED.includes(entry.state)
            ? [
                {
                  day: prompt.dayIndex + 1,
                  title: `${prompt.emoji} ${prompt.title}`.trim(),
                  url,
                },
              ]
            : [];
        })
      : [];
    return {
      participantId: participant.id,
      name: shown ? (user.name ?? "Someone") : null,
      avatarUrl: shown ? user.avatarUrl : null,
      isYou: user.id === viewerUserId,
      states,
      posted: states.filter((state) => FINISHED.includes(state)).length,
      links,
    };
  });

  return {
    slug: challenge.slug,
    title: challenge.title,
    isOpen: challenge.status === "open",
    isPublic: challenge.visibility === "public",
    days: prompts.length,
    people: members.length,
    posts: rows.reduce((sum, row) => sum + row.posted, 0),
    rows,
    you: viewer
      ? {
          participantId: viewer.participant.id,
          wallOptIn: viewer.participant.wallOptIn,
          isHost: viewer.participant.role === "host",
        }
      : null,
  };
}
