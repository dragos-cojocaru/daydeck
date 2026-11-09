"use client";

import { Button } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import { RefreshCwIcon } from "lucide-react";
import { useActionState, useId } from "react";
import { type ActionResult, refreshChannels } from "./actions";

/** "Refresh from Buffer", with its result shown right below the button. */
export function RefreshChannelsButton({
  variant = "outline",
  disabledReason,
}: {
  variant?: "outline" | "default";
  /** When set, the button is off and this text says why. */
  disabledReason?: string;
}) {
  const [result, action, pending] = useActionState<ActionResult>(refreshChannels, {
    status: "idle",
  });
  const statusId = useId();

  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <Button
        type="submit"
        variant={variant}
        className="h-11 px-4"
        disabled={pending || Boolean(disabledReason)}
        aria-describedby={statusId}
      >
        <RefreshCwIcon aria-hidden="true" className={cn(pending && "motion-safe:animate-spin")} />
        {pending ? "Refreshing…" : "Refresh from Buffer"}
      </Button>
      <output
        id={statusId}
        className={cn(
          "block text-sm empty:sr-only",
          result.status === "error" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {disabledReason ?? (result.status === "idle" || pending ? "" : result.message)}
      </output>
    </form>
  );
}
