"use server";

import { and, eq, schema } from "@daydeck/db";
import { refresh } from "next/cache";
import { z } from "zod";
import { bumpBoards } from "@/server/account/data";
import { getCurrentSession } from "@/server/auth/current-user";
import { getDb } from "@/server/db";

export type RecapSettingState =
  | { status: "idle" }
  | { status: "saved" | "error"; message: string; at: number };

const slugSchema = z.string().min(1).max(120);
const failed = (message: string): RecapSettingState => ({
  status: "error",
  message,
  at: Date.now(),
});

/** Shows or hides the signed-in person's name and post links on a challenge's recap. */
export async function setRecapOptInAction(
  slug: string,
  _previous: RecapSettingState,
  formData: FormData,
): Promise<RecapSettingState> {
  const session = await getCurrentSession();
  if (!session) return failed("Your session ended. Connect Buffer again, then try once more.");
  if (!slugSchema.safeParse(slug).success) return failed("That challenge could not be found.");
  const optIn = formData.get("optIn") === "on";
  const db = getDb();
  const [challenge] = await db
    .select({ id: schema.challenges.id })
    .from(schema.challenges)
    .where(eq(schema.challenges.slug, slug));
  if (!challenge) return failed("That challenge could not be found.");
  await db
    .update(schema.participants)
    .set({ wallOptIn: optIn })
    .where(
      and(
        eq(schema.participants.challengeId, challenge.id),
        eq(schema.participants.userId, session.user.id),
      ),
    );
  // Names on the recap change: cached recaps, keyed by this counter, are read fresh at once.
  await bumpBoards(db, [challenge.id]);
  refresh();
  return {
    status: "saved",
    message: optIn ? "Saved. Your name and post links show here." : "Saved. You show as unnamed.",
    at: Date.now(),
  };
}

/** The host decides who can open the recap: members only, or anyone with its link. */
export async function setRecapVisibilityAction(
  slug: string,
  _previous: RecapSettingState,
  formData: FormData,
): Promise<RecapSettingState> {
  const session = await getCurrentSession();
  if (!session) return failed("Your session ended. Connect Buffer again, then try once more.");
  const visibility = z.enum(["private", "public"]).safeParse(formData.get("visibility"));
  if (!slugSchema.safeParse(slug).success || !visibility.success) {
    return failed("That choice could not be read. Reload the page and try again.");
  }
  const db = getDb();
  const [row] = await db
    .select({ id: schema.challenges.id })
    .from(schema.challenges)
    .innerJoin(schema.participants, eq(schema.participants.challengeId, schema.challenges.id))
    .where(
      and(
        eq(schema.challenges.slug, slug),
        eq(schema.participants.userId, session.user.id),
        eq(schema.participants.role, "host"),
        eq(schema.participants.status, "active"),
      ),
    );
  if (!row) return failed("Only the host can change who sees the recap.");
  await db
    .update(schema.challenges)
    // A private recap also takes the challenge off the homepage, which shows the recap.
    .set(
      visibility.data === "private"
        ? { visibility: "private", showOnHome: false }
        : { visibility: "public" },
    )
    .where(eq(schema.challenges.id, row.id));
  refresh();
  return {
    status: "saved",
    message:
      visibility.data === "public"
        ? "Saved. Anyone with the recap's link can open it."
        : "Saved. Only people in the challenge can open the recap.",
    at: Date.now(),
  };
}
