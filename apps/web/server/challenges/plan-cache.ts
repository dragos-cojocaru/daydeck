import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getBufferDeps } from "../buffer/config";
import { findWeekSlots, type PlanResult } from "./plan";

/**
 * What the week plan depends on in Daydeck: today's date, which days of the coming week are still
 * open, and which channels count. It is part of the cache key, so taking a day off, saving one,
 * a check that finds a post, a new channel or a new day all give a fresh plan, without every
 * action having to clear it.
 */
export function planKey(data: {
  today: string;
  days: { date: string; entry: { id: string; state: string } }[];
  participant: { channelIds: string[] } | null;
}): string {
  const open = data.days
    .filter((day) => day.entry.state === "open" && day.date >= data.today)
    .slice(0, 7)
    .map((day) => day.entry.id);
  return [
    data.today,
    open.join(","),
    [...(data.participant?.channelIds ?? [])].sort().join(","),
  ].join("|");
}

/** The cache tag for one person's week plan. Actions that change their days clear it. */
export function planTag(userId: string): string {
  return `plan:${userId}`;
}

/**
 * The last week plan Buffer gave, kept for a day per person with "use cache: remote", so the
 * Schedule page shows it at once instead of waiting for Buffer. The page then asks Buffer again
 * in the background when the copy is over a minute old (see findSlotsAction), and that fresh
 * answer replaces this copy. Our own saves clear it. Callers resolve the signed-in user first, so
 * nobody can ask for someone else's plan.
 */
export async function cachedWeekSlots(
  userId: string,
  slug: string,
  _key: string,
): Promise<PlanResult> {
  "use cache: remote";
  cacheTag(planTag(userId));
  // Only the page refreshes it, never the server on its own, so Buffer is not asked twice.
  cacheLife({ stale: 60, revalidate: 60 * 60 * 24, expire: 60 * 60 * 24 });
  return findWeekSlots(getBufferDeps(), userId, slug);
}
