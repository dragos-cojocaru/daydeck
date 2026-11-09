import "server-only";
import { cache } from "react";
import { formatDay } from "@/features/challenges/format";
import { firstPromptDay, localDateOf } from "@/lib/day-engine";
import { cachedInvitePreview, peopleStamp } from "../challenges/cached";
import { getChallengeByInvite } from "../challenges/service";
import { getDb } from "../db";

// What a shared invite link previews: the same facts the invite page shows anyone with the link
// (title, host, days, how many people are in), and no member names. Memoized per request, so
// the page's metadata and its preview image share one lookup.

export interface InviteCard {
  title: string;
  hostName: string;
  days: number;
  cadence: "daily" | "weekdays";
  people: number;
  /** How joining starts, in a few words. */
  start: string;
  /** Why nobody can join now, or null when people can. */
  closedReason: string | null;
  description: string;
}

export const inviteCard = cache(async (code: string): Promise<InviteCard | null> => {
  const db = getDb();
  const challenge = await getChallengeByInvite(db, code);
  if (!challenge) return null;
  const stamp = await peopleStamp(db, challenge.id);
  const preview = await cachedInvitePreview(challenge.id, `${stamp}:${challenge.boardVersion}`);
  if (!preview) return null;
  const hostName = preview.host.name ?? "A Daydeck host";
  const days = preview.prompts.length;
  const opensOn =
    challenge.startMode === "fixed" ? firstPromptDay(challenge.startDate, challenge.cadence) : null;
  const started = opensOn !== null && opensOn <= localDateOf(new Date(), challenge.timezone);
  const start = !opensOn
    ? "Your day 1 is the day you join"
    : started
      ? `Started ${formatDay(opensOn)}`
      : `Starts ${formatDay(opensOn)}`;
  const closedReason =
    challenge.status !== "open"
      ? "This challenge has finished"
      : challenge.invitePaused
        ? "Joining is paused for now"
        : null;
  const cadence = challenge.cadence === "daily" ? "one post every day" : "one post each weekday";
  return {
    title: challenge.title,
    hostName,
    days,
    cadence: challenge.cadence,
    people: preview.members.length,
    start,
    closedReason,
    description: `${hostName} invites you to a ${days}-day posting challenge on Daydeck: ${cadence}, drafted in Buffer. ${closedReason ?? `${start}.`}`,
  };
});
