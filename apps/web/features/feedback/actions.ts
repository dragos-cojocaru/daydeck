"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentSession } from "@/server/auth/current-user";
import { getBufferDeps } from "@/server/buffer/config";
import { BufferNotConnectedError, BufferReconnectRequiredError } from "@/server/buffer/errors";
import { bufferErrorMessage } from "@/server/buffer/messages";
import { bumpCommunityForEntry, bumpCommunityForRequest } from "@/server/community/service";
import { getDb } from "@/server/db";
import { notesEnabledFromEnv } from "@/server/feedback/notes";
import { queueNote } from "@/server/feedback/queue";
import {
  closeRequest,
  FeedbackRefusedError,
  replyTextSchema,
  replyToRequest,
  requestFeedback,
} from "@/server/feedback/service";

export type FeedbackActionState =
  | { status: "idle" }
  | { status: "ok"; message: string; at: number }
  | { status: "error"; message: string; reconnect?: boolean; at: number };

const ok = (message: string): FeedbackActionState => ({ status: "ok", message, at: Date.now() });
const failed = (message: string, reconnect = false): FeedbackActionState => ({
  status: "error",
  message,
  reconnect,
  at: Date.now(),
});
const sessionEnded = () => failed("Your session ended. Connect Buffer again to continue.", true);

/** "Ask the group for feedback" on a day that has a draft in Buffer. */
export async function askFeedbackAction(entryId: string): Promise<FeedbackActionState> {
  const session = await getCurrentSession();
  if (!session) return sessionEnded();
  const parsed = z.uuid().safeParse(entryId);
  if (!parsed.success) return failed("That day could not be read. Reload the page.");

  try {
    const { created } = await requestFeedback(getBufferDeps(), {
      userId: session.user.id,
      entryId: parsed.data,
    });
    await bumpCommunityForEntry(getDb(), parsed.data);
    refresh();
    return ok(created ? "Shared with the group." : "You already asked the group about this draft.");
  } catch (error) {
    if (error instanceof FeedbackRefusedError) return failed(error.message);
    const reconnect =
      error instanceof BufferReconnectRequiredError || error instanceof BufferNotConnectedError;
    if (reconnect) refresh();
    return failed(bufferErrorMessage(error), reconnect);
  }
}

const replySchema = z.object({ requestId: z.uuid(), text: replyTextSchema });

/** Sends a reply to someone's request. With Buffer Notes on, it is then written to their draft. */
export async function replyFeedbackAction(input: {
  requestId: string;
  text: string;
}): Promise<FeedbackActionState> {
  const session = await getCurrentSession();
  if (!session) return sessionEnded();
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) return failed(parsed.error.issues[0]?.message ?? "Check your reply.");

  try {
    const item = await replyToRequest(
      getDb(),
      { userId: session.user.id, ...parsed.data },
      { notesEnabled: notesEnabledFromEnv() },
    );
    if (item.noteStatus === "pending") queueNote(item.id);
    await bumpCommunityForRequest(getDb(), parsed.data.requestId);
  } catch (error) {
    if (error instanceof FeedbackRefusedError) return failed(error.message);
    console.error("Saving a feedback reply failed", error);
    return failed("Your reply could not be sent. It is still here; try again in a moment.");
  }
  refresh();
  return ok("Sent. Thank you for helping.");
}

/** Closes one of the person's own requests, which hides it from the group. */
export async function closeFeedbackAction(requestId: string): Promise<FeedbackActionState> {
  const session = await getCurrentSession();
  if (!session) return sessionEnded();
  const parsed = z.uuid().safeParse(requestId);
  if (!parsed.success) return failed("That request could not be read. Reload the page.");

  try {
    await closeRequest(getDb(), { userId: session.user.id, requestId: parsed.data });
  } catch (error) {
    if (error instanceof FeedbackRefusedError) return failed(error.message);
    throw error;
  }
  refresh();
  return ok("Closed. It is hidden from the group, and your replies stay here.");
}
