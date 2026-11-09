// Asks the background job to check a participant soon, without making the caller wait or fail.
// Without Inngest (local runs with no dev server), the hourly sweep or "Check now" covers it.
import { after } from "next/server";
import { CHECK_EVENT, inngest } from "@/inngest/client";

export function queueCheck(participantId: string): void {
  after(async () => {
    try {
      await inngest.send({ name: CHECK_EVENT, data: { participantId } });
    } catch (error) {
      console.warn("Could not queue a progress check", (error as Error).message);
    }
  });
}
