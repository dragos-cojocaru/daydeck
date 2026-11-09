"use client";

import { Switch } from "@daydeck/ui/components/switch";
import { cn } from "@daydeck/ui/lib/utils";
import { HouseIcon } from "lucide-react";
import { useId, useOptimistic, useState, useTransition } from "react";
import { setShowOnHomeAction } from "@/features/community/actions";
import { VERY_ACTIVE_WORDS } from "@/lib/home-listing";

/**
 * The host's choice to list the challenge under "Popular challenges" on the homepage. The
 * switch moves at once and goes back if saving fails. It is off and locked while the
 * challenge is private, closed or paused, with the reason beside it.
 */
export function HomeListing({
  slug,
  on,
  blocked,
}: {
  slug: string;
  on: boolean;
  /** Why it cannot be listed now, or null. */
  blocked: string | null;
}) {
  const [shown, setShown] = useOptimistic(on);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const id = useId();

  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4"
    >
      <h2 id={`${id}-heading`} className="flex items-center gap-2 font-semibold text-sm">
        <HouseIcon aria-hidden="true" className="size-4 text-primary" />
        Daydeck's homepage
      </h2>
      <div className="flex items-start gap-3">
        <Switch
          id={id}
          checked={blocked ? false : shown}
          disabled={pending || blocked !== null}
          onCheckedChange={(next) =>
            startTransition(async () => {
              setShown(next);
              const result = await setShowOnHomeAction(slug, next);
              setMessage(
                !result.ok
                  ? result.message
                  : next
                    ? "Saved. It shows on the homepage while it is active."
                    : "Saved. It is off the homepage now.",
              );
            })
          }
          aria-labelledby={`${id}-label`}
          // The reason it is locked is read out with the switch, not only shown under it.
          aria-describedby={blocked ? `${id}-hint ${id}-reason` : `${id}-hint`}
          className="mt-0.5"
        />
        <label htmlFor={id} className="flex flex-col gap-0.5 text-sm">
          <span id={`${id}-label`}>Show it under Popular challenges</span>
          <span id={`${id}-hint`} className="text-muted-foreground text-xs leading-5">
            Anyone on Daydeck's homepage can then find it and join. It shows only while it is
            active: {VERY_ACTIVE_WORDS}. Visitors see the title, your name and picture, and the
            recap, where only people who chose it are named.
          </span>
        </label>
      </div>
      {blocked ? (
        <p id={`${id}-reason`} className="text-sm leading-5">
          {blocked}
        </p>
      ) : null}
      {/* Always there for screen readers; hidden while empty, so it adds no space. */}
      <output
        aria-live="polite"
        className={cn("text-muted-foreground text-xs", !message && "sr-only")}
      >
        {message}
      </output>
    </section>
  );
}
