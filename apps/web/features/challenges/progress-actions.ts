"use server";

import { BufferRateLimitError } from "@daydeck/buffer";
import { and, eq, schema } from "@daydeck/db";
import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentSession } from "@/server/auth/current-user";
import { getBufferDeps } from "@/server/buffer/config";
import { bufferErrorMessage } from "@/server/buffer/messages";
import { getDb } from "@/server/db";
import { checkParticipant } from "@/server/progress/check";
import {
  assignPost,
  dismissAlert,
  ManualMatchError,
  rejectSuggestion,
} from "@/server/progress/manual";
import { matchPostFromEnv } from "@/server/progress/matcher";
import { queueCheck } from "@/server/progress/queue";
import { limitUser } from "@/server/security/rate-limit";

export type ProgressActionState =
  | { status: "idle" }
  | { status: "ok"; message: string; at: number }
  | { status: "error"; message: string; at: number };

function sessionEnded(): ProgressActionState {
  return {
    status: "error",
    message: "Your session ended. Connect Buffer again to continue.",
    at: Date.now(),
  };
}

/** "Check Buffer now": reads this person's Buffer posts straight away and updates their days. */
export async function checkNowAction(slug: string): Promise<ProgressActionState> {
  const session = await getCurrentSession();
  if (!session) return sessionEnded();
  const db = getDb();
  const [row] = await db
    .select({ id: schema.participants.id })
    .from(schema.participants)
    .innerJoin(schema.challenges, eq(schema.challenges.id, schema.participants.challengeId))
    .where(and(eq(schema.challenges.slug, slug), eq(schema.participants.userId, session.user.id)));
  if (!row) return { status: "error", message: "You are not in this challenge.", at: Date.now() };
  const limited = await limitUser(db, "checkNow", session.user.id);
  if (limited) return { status: "error", message: limited, at: Date.now() };

  try {
    const result = await checkParticipant(getBufferDeps(), row.id, {
      matchPost: matchPostFromEnv(),
      mode: "user",
    });
    refresh();
    if (result.status === "deferred") {
      return {
        status: "error",
        message: "Buffer is busy for a few minutes. Daydeck checks again on its own.",
        at: Date.now(),
      };
    }
    if (result.status === "skipped") {
      const why =
        result.reason === "no-channels"
          ? "Choose which channels count for this challenge first."
          : result.reason === "needs-reconnect" || result.reason === "not-connected"
            ? "Buffer needs you to connect again before Daydeck can check."
            : "This challenge is closed.";
      return { status: "error", message: why, at: Date.now() };
    }
    return {
      status: "ok",
      message:
        result.changedDays === 0
          ? "Checked Buffer. Nothing new."
          : `Checked Buffer. ${result.changedDays} ${result.changedDays === 1 ? "day" : "days"} updated.`,
      at: Date.now(),
    };
  } catch (error) {
    const message =
      error instanceof BufferRateLimitError
        ? "Buffer is busy for a few minutes. Daydeck checks again on its own."
        : bufferErrorMessage(error);
    return { status: "error", message, at: Date.now() };
  }
}

const answerSchema = z.object({
  seenPostId: z.uuid(),
  entryId: z.uuid().nullable(),
});

/**
 * The answer to "Is this post for…?": a day (yes, or another day) or null (no). A day
 * counts at once; the next check adds the challenge tag in Buffer.
 */
export async function answerPostAction(
  _previous: ProgressActionState,
  formData: FormData,
): Promise<ProgressActionState> {
  const session = await getCurrentSession();
  if (!session) return sessionEnded();
  const parsed = answerSchema.safeParse({
    seenPostId: formData.get("seenPostId"),
    entryId: formData.get("entryId") || null,
  });
  if (!parsed.success) {
    return { status: "error", message: "Choose a day for this post.", at: Date.now() };
  }
  const db = getDb();
  const limited = await limitUser(db, "answer", session.user.id);
  if (limited) return { status: "error", message: limited, at: Date.now() };
  try {
    if (parsed.data.entryId) {
      await assignPost(db, session.user.id, parsed.data.seenPostId, parsed.data.entryId);
      const [seen] = await db
        .select({ participantId: schema.seenPosts.participantId })
        .from(schema.seenPosts)
        .where(eq(schema.seenPosts.id, parsed.data.seenPostId));
      if (seen) queueCheck(seen.participantId);
    } else {
      await rejectSuggestion(db, session.user.id, parsed.data.seenPostId);
    }
  } catch (error) {
    if (error instanceof ManualMatchError) {
      return { status: "error", message: error.message, at: Date.now() };
    }
    throw error;
  }
  refresh();
  return {
    status: "ok",
    message: parsed.data.entryId ? "Counted for that day." : "Moved to Other posts.",
    at: Date.now(),
  };
}

/** Hides one alert. */
export async function dismissAlertAction(alertId: string): Promise<void> {
  const session = await getCurrentSession();
  if (!session || !z.uuid().safeParse(alertId).success) return;
  await dismissAlert(getDb(), session.user.id, alertId);
  refresh();
}
