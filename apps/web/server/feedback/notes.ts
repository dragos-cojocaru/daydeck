// Writes a feedback reply to Buffer as a Note on the asker's draft. Only the asker can reach
// their post, so the Note is written with the asker's token. Notes are an experimental Buffer
// API behind FEATURE_BUFFER_NOTES: when it is off, or Buffer refuses, the reply gets "copy"
// and the asker copies it into Buffer by hand.
import {
  BufferApiError,
  BufferError,
  BufferOAuthError,
  BufferRateLimitError,
  createCollaborationNote,
} from "@daydeck/buffer";
import { and, type Database, eq, schema } from "@daydeck/db";
import { callBuffer } from "../buffer/call";
import type { BufferDeps } from "../buffer/deps";
import { BufferNotConnectedError, BufferReconnectRequiredError } from "../buffer/errors";
import { env } from "../env";
import { noteText } from "./service";

const { feedbackItems, feedbackRequests, participants, users } = schema;

export type NoteStatus = "pending" | "written" | "copy";

/** True when FEATURE_BUFFER_NOTES is "true". */
export function notesEnabledFromEnv(): boolean {
  return env.FEATURE_BUFFER_NOTES === "true";
}

export interface WriteNoteOptions {
  /** Defaults to FEATURE_BUFFER_NOTES. */
  notesEnabled?: boolean;
  /**
   * The background job passes true: a passing failure (rate limit, Buffer down) is thrown so
   * the job tries again. Otherwise every failure turns the reply into "copy" at once.
   */
  retryable?: boolean;
}

/**
 * Writes one reply as a Buffer Note and returns its note status. Safe to run more than once:
 * a reply that is not pending stays as it is.
 */
export async function writeNote(
  deps: BufferDeps,
  itemId: string,
  { notesEnabled = notesEnabledFromEnv(), retryable = false }: WriteNoteOptions = {},
): Promise<NoteStatus> {
  const [row] = await deps.db
    .select({ item: feedbackItems, request: feedbackRequests, askerUserId: participants.userId })
    .from(feedbackItems)
    .innerJoin(feedbackRequests, eq(feedbackRequests.id, feedbackItems.requestId))
    .innerJoin(participants, eq(participants.id, feedbackRequests.requesterId))
    .where(eq(feedbackItems.id, itemId));
  if (!row) throw new Error(`Feedback reply ${itemId} does not exist`);
  if (row.item.noteStatus !== "pending") return row.item.noteStatus;
  if (!notesEnabled) return markCopy(deps.db, itemId);

  const [author] = await deps.db
    .select({ name: users.name })
    .from(participants)
    .innerJoin(users, eq(users.id, participants.userId))
    .where(eq(participants.id, row.item.authorId));

  let noteId: string;
  try {
    ({ noteId } = await callBuffer(
      deps,
      row.askerUserId,
      (options) =>
        createCollaborationNote(
          { postId: row.request.bufferPostId, text: noteText(author?.name ?? null, row.item.text) },
          options,
        ),
      // A missing notes:write scope must not stop the asker's connection for everything else.
      { scopeIsOptional: true },
    ));
  } catch (error) {
    if (retryable && isPassing(error)) throw error;
    console.warn("Could not write a Buffer Note; the asker can copy it", describe(error));
    return markCopy(deps.db, itemId);
  }

  // The Note exists in Buffer, so the reply counts as written whatever its status was.
  await deps.db
    .update(feedbackItems)
    .set({ noteStatus: "written", bufferNoteId: noteId, writtenAt: deps.now() })
    .where(eq(feedbackItems.id, itemId));
  return "written";
}

/** Gives up on writing the Note: the asker gets the copy button. Leaves written replies alone. */
export async function markCopy(db: Database, itemId: string): Promise<NoteStatus> {
  const [changed] = await db
    .update(feedbackItems)
    .set({ noteStatus: "copy" })
    .where(and(eq(feedbackItems.id, itemId), eq(feedbackItems.noteStatus, "pending")))
    .returning({ noteStatus: feedbackItems.noteStatus });
  if (changed) return changed.noteStatus;
  const [current] = await db
    .select({ noteStatus: feedbackItems.noteStatus })
    .from(feedbackItems)
    .where(eq(feedbackItems.id, itemId));
  return current?.noteStatus ?? "copy";
}

// Failures worth trying again later. Anything Buffer refused on purpose (an error type, a
// missing scope, a changed experimental API) or a lost connection is not.
function isPassing(error: unknown): boolean {
  if (error instanceof BufferRateLimitError) return true;
  if (error instanceof BufferApiError) return error.isRetryable;
  if (error instanceof BufferOAuthError) return error.status >= 500;
  if (error instanceof BufferError) return false;
  // Only the asker can fix these, by connecting Buffer again.
  if (error instanceof BufferNotConnectedError || error instanceof BufferReconnectRequiredError) {
    return false;
  }
  // Anything else, such as a database hiccup.
  return true;
}

// The class name and Buffer's message only. Buffer errors never carry a token.
function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
