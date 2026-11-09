import "server-only";
import { BufferMutationError, BufferRateLimitError } from "@daydeck/buffer";
import { SaveRefusedError } from "../challenges/save";
import { BufferNotConnectedError, BufferReconnectRequiredError } from "./errors";

/** A plain sentence for a failed Buffer call: the cause and one next step. */
export function bufferErrorMessage(error: unknown): string {
  if (error instanceof BufferReconnectRequiredError || error instanceof BufferNotConnectedError) {
    return "Buffer needs you to connect again before anything can be saved.";
  }
  if (error instanceof BufferRateLimitError) {
    const minutes = Math.max(1, Math.ceil(error.retryAfterSeconds / 60));
    return `Buffer is busy right now. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
  }
  if (error instanceof SaveRefusedError) return error.message;
  if (error instanceof BufferMutationError) return `Buffer said: ${error.message}`;
  console.error("Buffer call failed", error);
  return "Buffer could not be reached. Nothing was saved; try again in a moment.";
}
