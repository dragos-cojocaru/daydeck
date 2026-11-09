import { Button } from "@daydeck/ui/components/button";
import { cookies } from "next/headers";
import { ScrollToHash } from "@/components/scroll-to-hash";
import { HIDE_GETTING_STARTED_COOKIE } from "@/server/onboarding";
import { showGettingStarted } from "./actions";

/**
 * At the top of "How Daydeck works", only for someone who hid the getting-started checklist:
 * one line to bring it back. The sidebar's "Hide checklist" points here (/guide#checklist).
 * It reads only a cookie, so it arrives with the first part of the page.
 */
export async function ShowGettingStarted() {
  const hidden = (await cookies()).get(HIDE_GETTING_STARTED_COOKIE)?.value === "1";
  if (!hidden) return null;
  return (
    <section
      id="checklist"
      aria-label="Getting started checklist"
      className="flex scroll-mt-20 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-dashed px-4 py-2"
    >
      <ScrollToHash id="checklist" />
      <p className="text-muted-foreground text-sm">
        You hid the Getting started checklist. It shows your next step until all four are done.
      </p>
      <form action={showGettingStarted}>
        <Button type="submit" variant="outline" className="h-11 px-4 md:h-9">
          Show the checklist again
        </Button>
      </form>
    </section>
  );
}
