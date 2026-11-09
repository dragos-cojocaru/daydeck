import "server-only";
import { and, type Database, eq, inArray, schema, sql } from "@daydeck/db";
import { cacheLife } from "next/cache";
import { firstPromptDay, localDateOf } from "@/lib/day-engine";
import { VERY_ACTIVE } from "@/lib/home-listing";
import { visitorRecap } from "../board/cached-recap";
import type { Recap } from "../board/recap";
import { getDb } from "../db";
import { env } from "../env";

// "Popular challenges" on the homepage: the demo challenge first (while DEMO_UNTIL allows), then
// challenges that are very active right now. Every one of them, the demo too, needs its host's
// "Show it under Popular challenges" and must be public, open and joinable (see
// lib/home-listing.ts). Visitors see each one's public recap: only people who chose it are named.

/** The most challenges the homepage lists. */
export const HOME_LIMIT = 6;

const DAY_MS = 24 * 60 * 60 * 1000;
const SLOT_MS = 10 * 60 * 1000;

interface Candidate {
  slug: string;
  inviteCode: string;
  hostName: string | null;
  hostAvatarUrl: string | null;
  startMode: "fixed" | "rolling";
  startDate: string;
  cadence: "daily" | "weekdays";
  timezone: string;
  postsThisWeek: number;
}

export interface HomeChallenge {
  slug: string;
  inviteCode: string;
  hostName: string | null;
  hostAvatarUrl: string | null;
  cadence: "daily" | "weekdays";
  postsThisWeek: number;
  isDemo: boolean;
  /** The shared first day of a fixed challenge, or null when everyone starts on the day they join. */
  opensOn: string | null;
  /** Whether that shared first day is today or earlier. */
  started: boolean;
  recap: Recap;
}

const { challenges, users } = schema;

/** The columns every candidate needs, with the number of posts published since `weekAgo`. */
function candidateColumns(weekAgo: Date) {
  return {
    slug: challenges.slug,
    inviteCode: challenges.inviteCode,
    hostName: users.name,
    hostAvatarUrl: users.avatarUrl,
    startMode: challenges.startMode,
    startDate: challenges.startDate,
    cadence: challenges.cadence,
    timezone: challenges.timezone,
    postsThisWeek: sql<number>`(select count(*)::int from entry_posts ep join entries e on e.id = ep.entry_id join participants p on p.id = e.participant_id where p.challenge_id = ${challenges.id} and ep.status = 'sent' and ep.sent_at > ${weekAgo})`,
  };
}

/** The listing rule as SQL: the host opted in, and the challenge is public, open and joinable. */
const listable = sql`${challenges.showOnHome} and ${challenges.visibility} = 'public' and ${challenges.status} = 'open' and not ${challenges.invitePaused}`;

/** Public, open challenges whose host opted in and that meet every "very active" rule. */
export async function veryActiveChallenges(db: Database, now: Date): Promise<Candidate[]> {
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const quietSince = new Date(now.getTime() - VERY_ACTIVE.quietHours * 60 * 60 * 1000);
  const rows = await db
    .select({
      ...candidateColumns(weekAgo),
      people: sql<number>`(select count(*)::int from participants p where p.challenge_id = ${challenges.id} and p.status = 'active')`,
      lastPost: sql<Date | null>`(select max(ep.sent_at) from entry_posts ep join entries e on e.id = ep.entry_id join participants p on p.id = e.participant_id where p.challenge_id = ${challenges.id} and ep.status = 'sent')`,
      lastMessage: sql<Date | null>`(select max(m.created_at) from messages m where m.challenge_id = ${challenges.id} and m.kind <> 'prompt')`,
    })
    .from(challenges)
    .leftJoin(users, eq(users.id, challenges.hostUserId))
    .where(listable);
  const latest = (value: Date | string | null) => (value ? new Date(value).getTime() : 0);
  return rows
    .filter(
      (row) =>
        row.people >= VERY_ACTIVE.people &&
        row.postsThisWeek >= VERY_ACTIVE.postsThisWeek &&
        Math.max(latest(row.lastPost), latest(row.lastMessage)) > quietSince.getTime(),
    )
    .sort((a, b) => b.postsThisWeek - a.postsThisWeek || b.people - a.people)
    .slice(0, HOME_LIMIT)
    .map(({ people: _people, lastPost: _post, lastMessage: _message, ...candidate }) => candidate);
}

/** The very active list, shared by every server for ten minutes at a time. */
async function cachedVeryActive(slot: string): Promise<Candidate[]> {
  "use cache: remote";
  cacheLife({ stale: 300, revalidate: 600, expire: 3600 });
  return veryActiveChallenges(getDb(), new Date(slot));
}

/**
 * The demo challenge from DEMO_INVITE_CODE, while today is on or before DEMO_UNTIL. It skips the
 * "very active" rules, not the listing rule: its host must still have it listed.
 */
async function demoCandidate(db: Database, now: Date): Promise<Candidate | null> {
  const code = env.DEMO_INVITE_CODE;
  if (!code) return null;
  if (env.DEMO_UNTIL && localDateOf(now, "UTC") > env.DEMO_UNTIL) return null;
  const [row] = await db
    .select(candidateColumns(new Date(now.getTime() - 7 * DAY_MS)))
    .from(challenges)
    .leftJoin(users, eq(users.id, challenges.hostUserId))
    .where(and(eq(challenges.inviteCode, code), listable));
  return row ?? null;
}

/**
 * The slugs still listable right now, with their current invite codes. The active list is cached
 * for up to ten minutes, so this fresh check makes a host's "off", a private recap, a paused
 * link or a new link count at once.
 */
async function stillListable(db: Database, slugs: string[]): Promise<Map<string, string>> {
  if (slugs.length === 0) return new Map();
  const rows = await db
    .select({ slug: challenges.slug, inviteCode: challenges.inviteCode })
    .from(challenges)
    .where(and(inArray(challenges.slug, slugs), listable));
  return new Map(rows.map((row) => [row.slug, row.inviteCode]));
}

/**
 * The list without the risk: if the database cannot answer, the pages show no challenges
 * instead of an error, because the rest of the page still works.
 */
export async function homeChallengesOrNone(db: Database, now: Date): Promise<HomeChallenge[]> {
  try {
    return await homeChallenges(db, now);
  } catch (error) {
    console.error("Loading the popular challenges failed", error);
    return [];
  }
}

/** What the homepage lists: the demo first, then very active challenges, at most six. */
export async function homeChallenges(db: Database, now: Date): Promise<HomeChallenge[]> {
  const slot = new Date(Math.floor(now.getTime() / SLOT_MS) * SLOT_MS).toISOString();
  const [demo, active] = await Promise.all([demoCandidate(db, now), cachedVeryActive(slot)]);
  const fresh = await stillListable(
    db,
    active.map((candidate) => candidate.slug),
  );
  const demoCode = demo?.inviteCode ?? env.DEMO_INVITE_CODE;
  const list = [
    ...(demo ? [{ ...demo, isDemo: true }] : []),
    // The demo never shows as an ordinary card: after DEMO_UNTIL, its samples would look real.
    ...active.flatMap((candidate) => {
      const inviteCode = fresh.get(candidate.slug);
      if (!inviteCode || inviteCode === demoCode || candidate.slug === demo?.slug) return [];
      return [{ ...candidate, inviteCode, isDemo: false }];
    }),
  ].slice(0, HOME_LIMIT);
  const cards = await Promise.all(
    list.map(async ({ startMode, startDate, timezone, ...item }) => {
      const recap = await visitorRecap(db, item.slug, now);
      if (!recap) return null;
      const opensOn = startMode === "fixed" ? firstPromptDay(startDate, item.cadence) : null;
      const started = opensOn !== null && opensOn <= localDateOf(now, timezone);
      return { ...item, opensOn, started, recap };
    }),
  );
  return cards.filter((card): card is HomeChallenge => card !== null);
}
