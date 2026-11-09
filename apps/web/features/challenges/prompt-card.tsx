"use client";

import { Button, buttonVariants } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import { CalendarClockIcon, ExternalLinkIcon, PencilIcon, RotateCcwIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { type ReactNode, useActionState, useEffect, useId, useState, useTransition } from "react";
import { setDayPausedAction } from "@/features/account/data-actions";
import { NetworkIcon } from "@/features/settings/network-icon";
import { serviceName } from "@/features/settings/services";
import {
  BUFFER_HOME_URL,
  BUFFER_IDEAS_URL,
  bufferDraftsUrl,
  bufferQueueUrl,
} from "@/lib/buffer-links";
import { type SaveState, saveToBufferAction } from "./actions";
import { PromptLabel } from "./prompt-label";

export interface CardChannel {
  id: string;
  name: string;
  /** Buffer's service key, such as "linkedin", for its logo. */
  service: string;
}

/** One of the day's posts in Buffer, on one channel. */
export interface CardPost {
  channelId: string;
  channelName: string;
  service: string;
  /** Buffer's status: draft, scheduled, sent and so on. */
  status: string;
  externalLink: string | null;
}

export interface PromptCardProps {
  entryId: string;
  dayNumber: number;
  dateLabel: string;
  prompt: {
    emoji: string;
    title: string;
    description: string;
    body: string;
    /** A short label over the day, such as the week's theme. */
    theme?: string;
    /** What to do, as short steps. */
    steps?: string[];
  };
  /** The day's stored state, such as "open" or "saved". */
  state: string;
  /** The day's posts in Buffer, one per channel. */
  posts: CardPost[];
  savedAsIdea: boolean;
  /** The channels that count for this challenge: where drafts can go. */
  channels: CardChannel[];
  variant: "today" | "catch-up" | "ahead";
  /** This day on the Schedule page, the one place where days get a time. */
  scheduleHref?: string;
  /** Extra actions for a saved draft, such as "Ask the group for feedback". */
  feedback?: ReactNode;
}

const STATE_LABELS: Record<string, string> = {
  saved: "Saved to Buffer",
  planned: "Scheduled in Buffer",
  done: "Posted",
  caught_up: "Caught up",
  paused: "Paused",
};

export function PromptCard(props: PromptCardProps) {
  const { entryId, dayNumber, dateLabel, prompt, state, channels, variant } = props;
  const [result, action, pending] = useActionState<SaveState, FormData>(saveToBufferAction, {
    status: "idle",
  });
  const [kind, setKind] = useState<"draft" | "idea">("draft");
  const [saveAgain, setSaveAgain] = useState(false);
  const destinationId = useId();
  // Where the draft goes: every channel of the challenge, until the person turns some off.
  const [chosen, setChosen] = useState<string[]>(() => channels.map((channel) => channel.id));
  const headingId = useId();
  const draftId = useId();

  // The draft the participant can edit before saving. It stays in this browser tab only
  // (session storage), so a reload keeps it; Daydeck's server never stores it.
  const original = prompt.body.trim() || prompt.title.trim();
  const storageKey = `daydeck:draft:${entryId}`;
  const [draft, setDraft] = useState(original);
  const [editing, setEditing] = useState(false);
  const edited = draft.trim() !== original;
  // biome-ignore lint/correctness/useExhaustiveDependencies: read the kept edit once, on mount
  useEffect(() => {
    try {
      const kept = sessionStorage.getItem(storageKey);
      if (kept) setDraft(kept);
    } catch {}
  }, []);
  const changeDraft = (value: string) => {
    setDraft(value);
    try {
      if (value.trim() === original) sessionStorage.removeItem(storageKey);
      else sessionStorage.setItem(storageKey, value);
    } catch {}
  };

  const paused = state === "paused";
  const alreadySaved = state !== "open" && state !== "missed" && !paused;
  const [pausing, startPausing] = useTransition();
  const togglePause = (next: boolean) =>
    startPausing(async () => {
      await setDayPausedAction(entryId, next);
    });
  const justSaved = result.status === "saved";
  // Once saved, the edit lives in Buffer; forget the copy kept in this tab.
  useEffect(() => {
    if (!justSaved) return;
    try {
      sessionStorage.removeItem(storageKey);
    } catch {}
  }, [justSaved, storageKey]);
  const showActions = ((!alreadySaved && !justSaved) || saveAgain) && !paused;
  // The message from a save shows until a check moves the day on (scheduled, posted).
  const movedOn = state === "planned" || state === "done" || state === "caught_up";
  const postNames = listNames(props.posts.map((post) => post.channelName));
  const savedLine =
    justSaved && !movedOn
      ? result.message
      : alreadySaved
        ? `${STATE_LABELS[state] ?? "Saved"}${
            props.posts.length > 0
              ? state === "saved"
                ? ` · ${props.posts.length === 1 ? "draft" : "drafts"} on ${postNames}`
                : ` · on ${postNames}`
              : props.savedAsIdea
                ? " · in your Ideas"
                : ""
          }`
        : null;

  // One link per post: a published post opens on its network, a scheduled one in the channel's
  // Queue tab, a draft in its Drafts tab.
  const posted = state === "done" || state === "caught_up";
  const justSavedPosts: CardPost[] =
    justSaved && result.kind === "draft"
      ? result.channelIds.flatMap((id) => {
          const channel = channels.find((c) => c.id === id);
          return channel
            ? [
                {
                  channelId: id,
                  channelName: channel.name,
                  service: channel.service,
                  status: "draft",
                  externalLink: null,
                },
              ]
            : [];
        })
      : [];
  const linkPosts = justSaved && !movedOn ? justSavedPosts : props.posts;
  const links =
    linkPosts.length > 0
      ? linkPosts.map((post) => ({
          key: post.channelId,
          post,
          ...(post.status === "sent" && post.externalLink
            ? { href: post.externalLink, label: "View post" }
            : post.status === "draft" || post.status === "error"
              ? { href: bufferDraftsUrl(post.channelId), label: "See drafts in Buffer" }
              : { href: bufferQueueUrl(post.channelId), label: "See queue in Buffer" }),
        }))
      : // An idea opens Buffer's Ideas board; with nothing saved yet, Buffer's home.
        (justSaved && result.kind === "idea") || props.savedAsIdea
        ? [{ key: "ideas", post: null, href: BUFFER_IDEAS_URL, label: "Open your ideas in Buffer" }]
        : [{ key: "buffer", post: null, href: BUFFER_HOME_URL, label: "Open Buffer" }];

  return (
    <article
      aria-labelledby={headingId}
      className={cn(
        "flex flex-col gap-4 rounded-2xl border bg-card p-5",
        variant === "today" && "border-primary/40 shadow-sm sm:p-6",
      )}
    >
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <PromptLabel
            dayNumber={dayNumber}
            detail={variant === "catch-up" ? `${dateLabel} · waiting for you` : dateLabel}
          />
          {prompt.theme ? (
            <span className="rounded-full bg-accent px-2 py-0.5 font-medium text-accent-foreground text-xs">
              {prompt.theme}
            </span>
          ) : null}
        </div>
        <h3
          id={headingId}
          className={cn("font-semibold", variant === "today" ? "text-2xl" : "text-lg")}
        >
          {prompt.emoji ? <span aria-hidden="true">{prompt.emoji} </span> : null}
          {prompt.title}
        </h3>
        {prompt.description ? <p className="text-muted-foreground">{prompt.description}</p> : null}
        {prompt.steps && prompt.steps.length > 0 && variant !== "ahead" ? (
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 leading-6">
            {prompt.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        ) : null}
      </header>

      {variant !== "ahead" ? (
        <div className="flex flex-col gap-2 rounded-xl bg-muted p-4">
          <div className="-my-2 flex flex-wrap items-center justify-between gap-x-2">
            {editing ? (
              <label htmlFor={draftId} className="text-muted-foreground text-sm">
                Your draft
              </label>
            ) : (
              <span className="text-muted-foreground text-sm">
                Your draft starts with{edited ? " (edited)" : ""}
              </span>
            )}
            <div className="-mr-2 flex">
              {edited ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 gap-1.5 px-3"
                  onClick={() => changeDraft(original)}
                >
                  <RotateCcwIcon aria-hidden="true" />
                  Undo changes
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                className="h-11 gap-1.5 px-3"
                aria-expanded={editing}
                onClick={() => {
                  setEditing((open) => !open);
                  if (!editing)
                    requestAnimationFrame(() => document.getElementById(draftId)?.focus());
                }}
              >
                {editing ? null : <PencilIcon aria-hidden="true" />}
                {editing ? "Done" : "Edit"}
                <span className="sr-only">{editing ? " editing" : " the draft"}</span>
              </Button>
            </div>
          </div>
          {editing ? (
            <textarea
              id={draftId}
              value={draft}
              maxLength={10_000}
              rows={4}
              onChange={(event) => changeDraft(event.target.value)}
              className="field-sizing-content min-h-[calc(4lh+1.25rem+2px)] resize-y rounded-lg border bg-background px-3 py-2.5 text-base leading-6 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          ) : (
            <p id={draftId} className="whitespace-pre-line">
              {draft}
            </p>
          )}
        </div>
      ) : null}

      {paused ? (
        <div className="flex flex-col gap-3 rounded-xl bg-muted p-4">
          <p className="font-medium">You took this day off.</p>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-fit px-4"
            disabled={pausing}
            onClick={() => togglePause(false)}
          >
            {pausing ? "Resuming…" : "Resume this day"}
          </Button>
        </div>
      ) : null}

      {savedLine && !paused ? (
        <div
          className={cn(
            "flex flex-col gap-3 rounded-xl bg-accent/50 p-4",
            // Just saved: the notice rises in once, like the draft landing in Buffer.
            justSaved &&
              "duration-300 ease-out animate-in slide-in-from-bottom-2 motion-reduce:animate-none",
          )}
        >
          <output className="block font-medium">{savedLine}</output>
          <div className="flex flex-wrap gap-2">
            {links.map((link) => (
              <a
                key={link.key}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "outline" }), "h-11 gap-2 px-3")}
              >
                {/* With several channels, each link shows its network. */}
                {link.post && linkPosts.length > 1 ? (
                  <NetworkIcon service={link.post.service} />
                ) : null}
                {link.label}
                {link.post && linkPosts.length > 1 ? (
                  <span className="sr-only"> on {link.post.channelName}</span>
                ) : null}
                <ExternalLinkIcon aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ))}
            {!showActions && !posted ? (
              <Button
                type="button"
                variant="ghost"
                className="h-11 px-3"
                onClick={() => setSaveAgain(true)}
              >
                Save again
              </Button>
            ) : null}
          </div>
          {props.feedback}
        </div>
      ) : null}

      {showActions ? (
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="entryId" value={entryId} />
          {edited ? <input type="hidden" name="draftText" value={draft} /> : null}
          {channels.length > 0 ? (
            // One draft per chosen channel. Each chip is a real checkbox, so keyboards and
            // screen readers work as usual; all are on until the person turns some off.
            <fieldset className="flex flex-col gap-2" aria-describedby={destinationId}>
              <legend className="mb-1 font-medium text-sm">Save to</legend>
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
                      checked={chosen.includes(channel.id)}
                      onChange={(event) =>
                        setChosen((current) =>
                          event.target.checked
                            ? [...current, channel.id]
                            : current.filter((id) => id !== channel.id),
                        )
                      }
                      className="sr-only"
                    />
                    <NetworkIcon service={channel.service} />
                    <span className="max-w-48 truncate">{channel.name}</span>
                    <span className="sr-only">({serviceName(channel.service)})</span>
                  </label>
                ))}
              </div>
              <p id={destinationId} className="text-muted-foreground text-xs leading-5">
                {chosen.length === 0
                  ? "Choose at least one channel for a draft. Ideas need no channel."
                  : chosen.length === 1
                    ? "One draft, on this channel."
                    : `One draft on each of these ${chosen.length} channels. The day counts once, as soon as one of them is published.`}
              </p>
            </fieldset>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="submit"
              name="kind"
              value="draft"
              onClick={() => setKind("draft")}
              disabled={pending || chosen.length === 0}
              className="h-11 px-5"
            >
              {pending && kind === "draft" ? "Saving to Buffer…" : "Save as a draft"}
            </Button>
            {/* Times are set in one place, the Schedule page; this opens this day there. */}
            {props.scheduleHref ? (
              <Link
                href={props.scheduleHref as Route}
                className={cn(buttonVariants({ variant: "outline" }), "h-11 gap-2 px-4")}
              >
                <CalendarClockIcon aria-hidden="true" />
                Pick a time…
              </Link>
            ) : null}
          </div>
          <p className="text-muted-foreground text-xs leading-5">
            A draft is a post on your channels, ready to finish and schedule in Buffer. The day
            counts once that post is published.
          </p>
          {/* An idea is the quieter choice: a note for later, on no channel. */}
          <p className="flex flex-wrap items-center gap-x-1 text-sm">
            Not sure yet?
            <Button
              type="submit"
              name="kind"
              value="idea"
              variant="link"
              onClick={() => setKind("idea")}
              disabled={pending}
              className="h-11 px-1 md:h-8"
            >
              {pending && kind === "idea" ? "Saving…" : "Save as an idea"}
            </Button>
            <span className="text-muted-foreground text-xs">
              a note in Buffer's Ideas, on no channel, for later.
            </span>
          </p>
          {channels.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Choose a channel for this challenge above to save drafts. Ideas need no channel.
            </p>
          ) : null}
          {result.status === "error" ? (
            <p role="alert" className="text-destructive text-sm">
              {result.message}
              {result.reconnect ? (
                <>
                  {" "}
                  <a className="underline" href="/api/auth/buffer/start">
                    Connect Buffer again
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
        </form>
      ) : null}

      {showActions && !alreadySaved ? (
        // A planned day off: neither done nor waiting. The board shows it hatched.
        <Button
          type="button"
          variant="ghost"
          className="-mt-2 h-11 w-fit px-3 text-muted-foreground"
          disabled={pausing}
          onClick={() => togglePause(true)}
        >
          {pausing ? "Pausing…" : "Take this day off"}
        </Button>
      ) : null}
    </article>
  );
}

/** "A", "A and B", "A, B and C". */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
