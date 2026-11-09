// Asks the background job to write a reply as a Buffer Note, after the response is sent.
// Without Inngest (local runs with no dev server), the Note is written right here instead.
import { after } from "next/server";
import { inngest } from "@/inngest/client";
import { getBufferDeps } from "../buffer/config";
import { writeNote } from "./notes";

/** The event that asks for one reply to be written as a Buffer Note. */
export const FEEDBACK_NOTE_EVENT = "feedback/write-note";

export function queueNote(itemId: string): void {
  after(async () => {
    try {
      await inngest.send({ name: FEEDBACK_NOTE_EVENT, data: { itemId } });
      return;
    } catch (error) {
      console.warn(
        "Could not queue a feedback note; writing it directly",
        (error as Error).message,
      );
    }
    try {
      await writeNote(getBufferDeps(), itemId);
    } catch (error) {
      console.error("Writing a feedback note failed", (error as Error).message);
    }
  });
}
