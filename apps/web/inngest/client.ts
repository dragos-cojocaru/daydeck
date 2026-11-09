import { Inngest } from "inngest";

// One Inngest client for the whole app. Job functions live next to this file
// and are registered in app/api/inngest/route.ts.
export const inngest = new Inngest({ id: "daydeck" });

/** The event that asks for one participant's progress check. */
export const CHECK_EVENT = "participant/check";
