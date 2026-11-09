import { BufferRateLimitError } from "@daydeck/buffer";
import { NonRetriableError, RetryAfterError } from "inngest";
import { z } from "zod";
import { getBufferDeps } from "@/server/buffer/config";
import { getDb } from "@/server/db";
import { markCopy, type NoteStatus, writeNote } from "@/server/feedback/notes";
import { FEEDBACK_NOTE_EVENT } from "@/server/feedback/queue";
import { inngest } from "./client";

const noteData = z.object({ itemId: z.uuid() });

/** Writes one Note; Buffer's own "retry after" becomes Inngest's retry time. */
async function runWriteNote(itemId: string): Promise<NoteStatus> {
  try {
    return await writeNote(getBufferDeps(), itemId, { retryable: true });
  } catch (error) {
    if (error instanceof BufferRateLimitError) {
      throw new RetryAfterError("Buffer's rate limit is reached", error.retryAfterSeconds * 1000, {
        cause: error,
      });
    }
    throw error;
  }
}

/**
 * One feedback reply, written as a Buffer Note on the asker's draft. One run per reply (the
 * idempotency key), up to 4 retries for passing failures, and when they run out the asker
 * gets the "Copy into Buffer" button.
 */
export const feedbackWriteNote = inngest.createFunction(
  {
    id: "feedback-write-note",
    triggers: [{ event: FEEDBACK_NOTE_EVENT }],
    idempotency: "event.data.itemId",
    retries: 4,
    onFailure: async ({ event }) => {
      const parsed = noteData.safeParse(event.data.event.data);
      if (parsed.success) await markCopy(getDb(), parsed.data.itemId);
    },
  },
  async ({ event, step }) => {
    const parsed = noteData.safeParse(event.data);
    // Data that is wrong now is wrong on every retry, so stop at once.
    if (!parsed.success)
      throw new NonRetriableError("The feedback note event has data it cannot use.");
    const { itemId } = parsed.data;
    const status = await step.run("write-note", () => runWriteNote(itemId));
    return { status };
  },
);
