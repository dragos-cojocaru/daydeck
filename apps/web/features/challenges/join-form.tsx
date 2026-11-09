"use client";

import { Button } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import { useActionState, useId } from "react";
import { UserAvatar } from "@/components/user-avatar";
import { type JoinState, joinChallengeAction } from "./actions";

export interface JoinChannel {
  id: string;
  name: string;
  service: string;
  avatarUrl: string | null;
  selected: boolean;
}

/** Channels that count, the privacy note, and one button. */
export function JoinForm({
  code,
  channels,
  listed = false,
}: {
  code: string;
  channels: JoinChannel[];
  /** Listed on Daydeck's homepage, so its invite page and recap are public. */
  listed?: boolean;
}) {
  const [state, action, pending] = useActionState<JoinState, FormData>(joinChallengeAction, {
    status: "idle",
  });
  const noteId = useId();
  // With one channel, or none picked yet, start with everything ticked: fewer taps.
  const anySelected = channels.some((channel) => channel.selected);

  return (
    <form action={action} className="flex flex-col gap-6 rounded-xl border p-5">
      <input type="hidden" name="code" value={code} />
      <h2 className="font-semibold text-lg">Join this challenge</h2>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-medium">Channels that count</legend>
        {channels.map((channel) => (
          <label
            key={channel.id}
            className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border bg-card p-3 has-checked:border-primary has-checked:bg-accent/50 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
          >
            <UserAvatar name={channel.name} src={channel.avatarUrl} />
            <span className="flex flex-1 flex-col">
              <span className="font-medium">{channel.name}</span>
              <span className="text-muted-foreground text-sm">{channel.service}</span>
            </span>
            <input
              type="checkbox"
              name="channelIds"
              value={channel.id}
              defaultChecked={anySelected ? channel.selected : true}
              className="size-5 accent-primary"
            />
          </label>
        ))}
      </fieldset>

      <div id={noteId} className="flex flex-col gap-2 rounded-lg bg-muted p-4 text-sm">
        <p className="font-medium">What joining shares</p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            People in this challenge see your Buffer name, your picture and which days you posted.
            {listed
              ? null
              : " Anyone with the invite link also sees your name and picture in the list of who is in."}
          </li>
          {listed ? (
            <li>
              This challenge is on Daydeck's homepage, so anyone can open its invite page and recap.
              There, your name shows only if you turn on the option below.
            </li>
          ) : null}
          <li>
            In the challenge's Community they also see what you write and your reactions. The host
            can delete messages, remove people and ban them.
          </li>
          <li>
            Daydeck reads the posts on the channels you pick, and whether the ideas it saved for you
            are still there, only to check off your days. It keeps no post text, except a draft you
            choose to share for feedback, what you write or share in Community, and the first 100
            characters of a post that waits for you to give it a day.
          </li>
          <li>You can leave the challenge at any time.</li>
        </ul>
      </div>
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="agreed"
          required
          aria-describedby={noteId}
          className="mt-0.5 size-5 accent-primary"
        />
        <span>I understand what joining shares</span>
      </label>
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <input type="checkbox" name="wallOptIn" className="mt-0.5 size-5 accent-primary" />
        <span className="flex flex-col">
          <span>Show my name and post links on the challenge's recap page</span>
          <span className="text-muted-foreground text-sm">
            {listed
              ? "Optional. This challenge is on Daydeck's homepage, so anyone can see its recap. You can change this later."
              : "Optional. Anyone with the recap's link can see it. You can change this later."}
          </span>
        </span>
      </label>

      <div className="flex flex-col gap-2">
        <Button type="submit" className="h-11 w-full px-5 sm:w-fit" disabled={pending}>
          {pending ? "Joining…" : "Join challenge"}
        </Button>
        <output className={cn("block text-sm", state.status === "error" && "text-destructive")}>
          {state.status === "error" ? state.message : ""}
        </output>
      </div>
    </form>
  );
}
