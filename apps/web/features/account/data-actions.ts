"use server";

import { refresh, updateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { closeChallenge, deleteMyData, leaveChallenge, setDayPaused } from "@/server/account/data";
import { SESSION_COOKIE, secureCookie } from "@/server/auth/cookies";
import { getCurrentSession } from "@/server/auth/current-user";
import { getBufferDeps } from "@/server/buffer/config";
import { inviteTag, userTag } from "@/server/challenges/cached";
import { getDb } from "@/server/db";

export type DeleteResult = { ok: true; goodbye: string } | { ok: false; message: string };

/**
 * "Delete my data": revokes the Buffer grant and deletes everything about the person. Returns
 * the address of the confirmation page, which lists what was deleted; the browser then loads
 * it in full, so no signed-in page stays in the tab.
 */
export async function deleteMyDataAction(): Promise<DeleteResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, message: "Your session ended. Connect Buffer again first." };
  const deleted = await deleteMyData(getBufferDeps(), session.user.id);
  // Cached invite pages list members by name and picture: clear every one that showed them.
  updateTag(userTag(session.user.id));
  for (const id of deleted.challengeIds) updateTag(inviteTag(id));
  (await cookies()).delete({ name: SESSION_COOKIE, ...secureCookie });
  const query = new URLSearchParams({
    joined: String(deleted.challengesJoined),
    hosted: String(deleted.challengesHosted),
    days: String(deleted.daysTracked),
    channels: String(deleted.channels),
    feedback: String(deleted.feedbackWritten),
    messages: String(deleted.messagesWritten),
    revoked: deleted.revokedAtBuffer ? "1" : "0",
  });
  return { ok: true, goodbye: `/goodbye?${query}` };
}

const slugSchema = z.string().min(1).max(120);

/** Leaves a challenge. Returns an error message, or nothing when it worked. */
export async function leaveChallengeAction(slug: string): Promise<string | undefined> {
  const session = await getCurrentSession();
  if (!session || !slugSchema.safeParse(slug).success) return "Your session ended.";
  const left = await leaveChallenge(getDb(), session.user.id, slug);
  if (!left) return "This challenge could not be left. Reload the page and try again.";
  // The invite page lists who is in; it must not keep showing someone who left.
  updateTag(inviteTag(left));
  refresh();
  redirect("/challenges");
}

/** Closes a challenge (hosts only). Returns an error message, or nothing when it worked. */
export async function closeChallengeAction(slug: string): Promise<string | undefined> {
  const session = await getCurrentSession();
  if (!session || !slugSchema.safeParse(slug).success) return "Your session ended.";
  const closed = await closeChallenge(getDb(), session.user.id, slug, new Date());
  if (!closed) return "Only the host can close this challenge, and only once.";
  refresh();
}

/** Pauses a day off, or opens it again. */
export async function setDayPausedAction(entryId: string, paused: boolean): Promise<void> {
  const session = await getCurrentSession();
  if (!session || !z.uuid().safeParse(entryId).success) return;
  await setDayPaused(getDb(), session.user.id, entryId, paused);
  refresh();
}
