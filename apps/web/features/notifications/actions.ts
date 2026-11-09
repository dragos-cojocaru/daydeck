"use server";

import { z } from "zod";
import { getCurrentSession } from "@/server/auth/current-user";
import { MUTABLE, markAllRead, setMuted } from "@/server/community/live";
import { getDb } from "@/server/db";
import { limitUser } from "@/server/security/rate-limit";

export type NotifyResult = { ok: true } | { ok: false; message: string };

const MuteInput = z.object({
  slug: z.string().min(1).max(120),
  what: z.enum(MUTABLE),
  muted: z.boolean(),
});

/** Turns notifications for one place of a challenge, or the whole challenge, off or on. */
export async function setMutedAction(input: unknown): Promise<NotifyResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, message: "Your session ended. Connect Buffer again." };
  const parsed = MuteInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That setting is not valid." };
  const db = getDb();
  const wait = await limitUser(db, "notifications", session.user.id);
  if (wait) return { ok: false, message: wait };
  const { slug, what, muted } = parsed.data;
  const done = await setMuted(db, session.user.id, slug, what, muted);
  return done ? { ok: true } : { ok: false, message: "You are not in that challenge any more." };
}

/** "Mark all as read" in the notification panel. */
export async function markAllReadAction(): Promise<NotifyResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, message: "Your session ended. Connect Buffer again." };
  const db = getDb();
  const wait = await limitUser(db, "notifications", session.user.id);
  if (wait) return { ok: false, message: wait };
  await markAllRead(db, session.user.id, new Date());
  return { ok: true };
}
