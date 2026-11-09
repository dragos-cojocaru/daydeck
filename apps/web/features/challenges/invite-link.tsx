"use client";

import { Button } from "@daydeck/ui/components/button";
import { Switch } from "@daydeck/ui/components/switch";
import { cn } from "@daydeck/ui/lib/utils";
import { RefreshCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { CopyLink } from "@/components/copy-link";
import { newInviteLinkAction, setInvitePausedAction } from "@/features/community/actions";

/**
 * The invite link with a copy button, for the host, and what the host can do with it: pause
 * joining for a while, or replace the link so the old one stops working.
 */
export function InviteLink({
  slug,
  inviteCode,
  paused,
}: {
  slug: string;
  inviteCode: string;
  paused: boolean;
}) {
  const [isPaused, setPaused] = useState(paused);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const switchId = useId();

  return (
    <div className="flex flex-col gap-4">
      <CopyLink path={`/c/${inviteCode}`} label="Invite link" />
      <div className="flex items-start gap-3">
        <Switch
          id={switchId}
          checked={isPaused}
          disabled={pending}
          onCheckedChange={(next) => {
            setPaused(next);
            startTransition(async () => {
              const result = await setInvitePausedAction(slug, next);
              if (!result.ok) {
                setPaused(!next);
                setMessage(result.message);
                return;
              }
              setMessage(next ? "Joining is paused." : "Joining is open again.");
            });
          }}
          aria-labelledby={`${switchId}-label`}
          aria-describedby={`${switchId}-hint`}
          className="mt-0.5"
        />
        <label htmlFor={switchId} className="flex flex-col text-sm">
          <span id={`${switchId}-label`}>Pause joining</span>
          <span id={`${switchId}-hint`} className="text-muted-foreground text-xs leading-5">
            The link shows a notice instead of the join form. Nobody new can join until you turn
            this off. Pausing also takes the challenge off Daydeck's homepage.
          </span>
        </label>
      </div>
      <div className="flex flex-col gap-2 border-t pt-3">
        {confirming ? (
          <>
            <p className="text-sm leading-6">
              Make a new link? The current link stops working at once, for everyone who has it.
              People already in the challenge stay in. If the challenge is on Daydeck's homepage, it
              comes off until you list it again.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="destructive"
                className="h-11 px-4 md:h-9"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await newInviteLinkAction(slug);
                    setConfirming(false);
                    setMessage(result.ok ? "New link made. Share it from here." : result.message);
                    router.refresh();
                  })
                }
              >
                {pending ? "Making…" : "Make a new link"}
              </Button>
              <Button
                variant="outline"
                className="h-11 px-4 md:h-9"
                disabled={pending}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <Button
            variant="outline"
            className="h-11 w-fit gap-2 px-3 md:h-9"
            onClick={() => setConfirming(true)}
          >
            <RefreshCwIcon aria-hidden="true" />
            Make a new link
          </Button>
        )}
      </div>
      {/* Always there for screen readers; hidden while empty, so it adds no space. */}
      <output
        aria-live="polite"
        className={cn("text-muted-foreground text-xs", !message && "sr-only")}
      >
        {message}
      </output>
    </div>
  );
}
