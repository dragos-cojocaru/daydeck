"use client";

import { Button } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import { useActionState } from "react";
import { UserAvatar } from "@/components/user-avatar";
import { NetworkIcon } from "@/features/settings/network-icon";
import { serviceName } from "@/features/settings/services";
import { type ChannelsState, setChallengeChannelsAction } from "./actions";

export interface ChallengeChannel {
  id: string;
  name: string;
  /** Buffer's service key, such as "linkedin", for its logo. */
  service: string;
  avatarUrl: string | null;
  counts: boolean;
}

/** Which of the person's channels count for this one challenge. */
export function ChallengeChannels({
  challengeId,
  channels,
}: {
  challengeId: string;
  channels: ChallengeChannel[];
}) {
  const [state, action, pending] = useActionState<ChannelsState, FormData>(
    setChallengeChannelsAction,
    {
      status: "idle",
    },
  );
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="challengeId" value={challengeId} />
      {/* Logo chips, the same as on a prompt card. Each is a real checkbox. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium text-sm">Channels for this challenge</legend>
        <p className="text-muted-foreground text-xs leading-5">
          Posts on these channels count, and new drafts go to all of them. When you save one day,
          you can still turn some off for that day.
        </p>
        <div className="flex flex-wrap gap-2">
          {channels.map((channel) => (
            <label
              key={channel.id}
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border bg-background px-3 text-sm transition-colors hover:border-foreground/30 has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50 md:h-9"
            >
              <input
                type="checkbox"
                name="channelIds"
                value={channel.id}
                defaultChecked={channel.counts || channels.length === 1}
                className="sr-only"
              />
              <span className="relative">
                <UserAvatar name={channel.name} src={channel.avatarUrl} size="sm" />
                <span className="absolute -right-1 -bottom-1 flex size-3.5 items-center justify-center rounded-full bg-card">
                  <NetworkIcon service={channel.service} className="size-2.5" />
                </span>
              </span>
              <span className="max-w-40 truncate">{channel.name}</span>
              <span className="sr-only">({serviceName(channel.service)})</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Button type="submit" className="h-11 w-fit px-5" disabled={pending}>
          {pending ? "Saving…" : "Save channels"}
        </Button>
        <output className={cn("block text-sm", state.status === "error" && "text-destructive")}>
          {state.status === "idle" || pending ? "" : state.message}
        </output>
      </div>
    </form>
  );
}
