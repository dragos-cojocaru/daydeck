import "server-only";
import { type Database, eq, schema } from "@daydeck/db";
import { cacheLife, cacheTag } from "next/cache";
import { peopleStamp } from "../challenges/cached";
import { getDb } from "../db";
import { loadRecap, type Recap } from "./recap";

// A public recap as visitors see it, kept with "use cache: remote" so every server instance
// shares one copy: a recap link shared widely, or the sample on the home page, costs one load
// instead of one per visitor. Nothing needs clearing by hand. The key holds the challenge's
// change counter (it goes up when a day changes or someone joins, leaves, hides their name or
// deletes their data), its status, a stamp of its people (new names and pictures), and a
// 15-minute time slot for the day's date.

const SLOT_MS = 15 * 60 * 1000;

/** The tag for one challenge's cached recaps, for clearing them all at once if ever needed. */
export function recapTag(slug: string): string {
  return `recap:${slug}`;
}

async function cachedVisitorRecap(
  slug: string,
  _boardVersion: number,
  _status: string,
  _people: string,
  slot: string,
): Promise<Recap | null> {
  "use cache: remote";
  cacheTag(recapTag(slug));
  cacheLife("hours");
  return loadRecap(getDb(), slug, null, new Date(slot));
}

/**
 * The recap for a visitor who is not signed in, or null when it is not public. Members and
 * signed-in people use loadRecap, which adds their own row and badge.
 */
export async function visitorRecap(db: Database, slug: string, now: Date): Promise<Recap | null> {
  const [row] = await db
    .select({
      id: schema.challenges.id,
      boardVersion: schema.challenges.boardVersion,
      status: schema.challenges.status,
      visibility: schema.challenges.visibility,
    })
    .from(schema.challenges)
    .where(eq(schema.challenges.slug, slug));
  // A private recap shows visitors nothing, so it is never cached.
  if (!row || row.visibility !== "public") return null;
  const slot = new Date(Math.floor(now.getTime() / SLOT_MS) * SLOT_MS).toISOString();
  const people = await peopleStamp(db, row.id);
  return cachedVisitorRecap(slug, row.boardVersion, row.status, people, slot);
}
