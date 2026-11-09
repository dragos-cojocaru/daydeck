import { and, type Database, eq, notInArray, schema, sql } from "@daydeck/db";

const { channels, participants, entries, challenges } = schema;

/** The cookie that hides the getting-started card. The guide page can show it again. */
export const HIDE_GETTING_STARTED_COOKIE = "daydeck-hide-getting-started";

export interface GettingStartedStep {
  key: "connect" | "channels" | "challenge" | "save";
  label: string;
  /** Plain words on what the step is for. */
  hint: string;
  done: boolean;
  href: string;
}

/**
 * The four steps from a first visit to the first prompt in Buffer, in the order they happen.
 * Each one is worked out from data the app already has; nothing is stored for this.
 */
export async function gettingStarted(db: Database, userId: string): Promise<GettingStartedStep[]> {
  // Three independent reads, run at the same time.
  const [[picked], [membership], [saved]] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(channels)
      .where(and(eq(channels.userId, userId), eq(channels.selected, true))),
    db
      .select({ slug: challenges.slug })
      .from(participants)
      .innerJoin(challenges, eq(challenges.id, participants.challengeId))
      .where(and(eq(participants.userId, userId), eq(participants.status, "active")))
      .orderBy(sql`${participants.joinedAt} desc`)
      .limit(1),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(entries)
      .innerJoin(participants, eq(participants.id, entries.participantId))
      .where(and(eq(participants.userId, userId), notInArray(entries.state, ["open", "missed"]))),
  ]);

  const hasChannels = (picked?.count ?? 0) > 0;
  return [
    {
      key: "connect",
      label: "Connect Buffer",
      hint: "Daydeck works through your Buffer account.",
      done: true,
      href: "/settings/channels",
    },
    {
      key: "channels",
      label: "Choose your channels",
      hint: "The social accounts whose posts count.",
      // Choosing channels for one challenge counts too.
      done: hasChannels || Boolean(membership),
      href: "/settings/channels",
    },
    {
      key: "challenge",
      label: "Host or join a challenge",
      hint: "Start your own, or open an invite link.",
      done: Boolean(membership),
      href: "/challenges/new",
    },
    {
      key: "save",
      label: "Save a prompt to Buffer",
      hint: "It lands in Buffer as a draft for you to finish.",
      done: (saved?.count ?? 0) > 0,
      href: membership ? `/challenges/${membership.slug}` : "/challenges",
    },
  ];
}
