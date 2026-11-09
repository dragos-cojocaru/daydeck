"use client";

import { Button } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import { useActionState, useEffect, useId, useState } from "react";
import { UserAvatar } from "@/components/user-avatar";
import { type ActionResult, saveChannels } from "./actions";
import { NetworkIcon } from "./network-icon";
import { serviceName } from "./services";

export interface PickerChannel {
  id: string;
  name: string;
  service: string;
  avatarUrl: string | null;
  isDisconnected: boolean;
  isLocked: boolean;
  isQueuePaused: boolean;
  selected: boolean;
}

/**
 * Channel cards with native checkboxes. The whole card is the tap target. Choices are kept as
 * local edits on top of the saved state, so a refresh from Buffer never wipes unsaved taps.
 */
export function ChannelPicker({ channels }: { channels: PickerChannel[] }) {
  const [edits, setEdits] = useState<Record<string, boolean>>({});
  const [result, action, pending] = useActionState<ActionResult, FormData>(saveChannels, {
    status: "idle",
  });

  // After a save, the server's saved state matches the screen again.
  useEffect(() => {
    if (result.status === "success") setEdits({});
  }, [result]);

  const isChecked = (channel: PickerChannel) =>
    usable(channel) && (edits[channel.id] ?? channel.selected);
  const hasUnsavedChanges = channels.some(
    (channel) => usable(channel) && isChecked(channel) !== channel.selected,
  );
  // An error stays until the next save; otherwise unsaved edits beat the last success message.
  const status = pending
    ? ""
    : result.status === "error"
      ? result.message
      : hasUnsavedChanges
        ? "You have changes that are not saved yet."
        : result.status === "success"
          ? result.message
          : "";

  return (
    <form action={action} className="flex flex-col gap-6">
      <fieldset className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        <legend className="mb-3 font-semibold text-xl">Channels that count</legend>
        {channels.map((channel) => (
          <ChannelCard
            key={channel.id}
            channel={channel}
            checked={isChecked(channel)}
            onChange={(checked) => setEdits((current) => ({ ...current, [channel.id]: checked }))}
          />
        ))}
      </fieldset>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Button type="submit" className="h-11 px-5" disabled={pending}>
          {pending ? "Saving…" : "Save channels"}
        </Button>
        <output
          className={cn(
            "block text-sm",
            result.status === "error" && !pending ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {status}
        </output>
      </div>
    </form>
  );
}

function usable(channel: PickerChannel): boolean {
  return !channel.isDisconnected && !channel.isLocked;
}

function ChannelCard({
  channel,
  checked,
  onChange,
}: {
  channel: PickerChannel;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const nameId = useId();
  const serviceId = useId();
  const noteId = useId();
  const disabled = !usable(channel);
  const status = channel.isDisconnected
    ? "Disconnected"
    : channel.isLocked
      ? "Locked"
      : channel.isQueuePaused
        ? "Queue paused"
        : null;
  const note = channel.isDisconnected
    ? "Disconnected in Buffer. Reconnect it in Buffer, then refresh this page."
    : channel.isLocked
      ? "Locked in Buffer, because your plan allows fewer channels than are connected."
      : channel.isQueuePaused
        ? "Queue paused in Buffer. Scheduled posts wait until you resume it."
        : null;

  return (
    <label
      className={cn(
        "group flex min-h-16 items-start gap-3 rounded-xl border bg-card p-4 transition-colors",
        "has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
        disabled
          ? "cursor-not-allowed bg-muted/40"
          : "cursor-pointer hover:border-foreground/30 has-checked:border-primary has-checked:bg-accent/50",
      )}
    >
      {/* The network's logo sits on the avatar's corner, as in Buffer itself. */}
      <span className="relative shrink-0">
        <UserAvatar
          name={channel.name}
          src={channel.avatarUrl}
          size="lg"
          className={cn(disabled && "opacity-60 grayscale")}
        />
        <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-card ring-2 ring-card">
          <NetworkIcon service={channel.service} className="size-3.5" />
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span id={nameId} className="truncate font-medium">
          {channel.name}
        </span>
        {/* The logo is on the avatar; the network's name stays as text, for anyone who does
            not know the logo and for screen readers. */}
        <span id={serviceId} className="text-muted-foreground text-sm">
          {serviceName(channel.service)}
        </span>
        {status ? (
          <span className="flex flex-col items-start gap-1">
            <span className="inline-flex h-6 items-center rounded-full bg-tile px-2 font-medium text-muted-foreground text-xs">
              {status}
            </span>
            <span id={noteId} className="text-muted-foreground text-xs leading-5">
              {note}
            </span>
          </span>
        ) : null}
      </span>
      <input
        type="checkbox"
        name="channelIds"
        value={channel.id}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        // A short name ("ana.makes Instagram"); the note is read as the description.
        aria-labelledby={`${nameId} ${serviceId}`}
        aria-describedby={note ? noteId : undefined}
        className="mt-0.5 size-5 shrink-0 accent-primary"
      />
    </label>
  );
}
