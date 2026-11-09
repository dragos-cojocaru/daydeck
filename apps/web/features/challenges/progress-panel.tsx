"use client";

import { Button } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import { ExternalLinkIcon, RefreshCwIcon } from "lucide-react";
import { type ReactNode, useActionState, useId, useState, useTransition } from "react";
import type { DayChoice, PostSummary } from "@/server/progress/view";
import { answerPostAction, checkNowAction, type ProgressActionState } from "./progress-actions";

/** When Daydeck last read Buffer for this person, and a button to read it now. */
/**
 * Where your progress comes from: when Daydeck last read your posts in Buffer, that it checks on
 * its own, and a button to check right away, for a post you just published.
 */
export function CheckNow({ slug, lastChecked }: { slug: string; lastChecked: ReactNode }) {
  const [state, setState] = useState<ProgressActionState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 font-semibold text-sm">
          <RefreshCwIcon aria-hidden="true" className="size-4 text-primary" />
          Updates from Buffer
        </h2>
        <p className="text-sm">{lastChecked}</p>
        <p className="text-muted-foreground text-xs leading-5">
          Daydeck reads your posts in Buffer on its own, about every hour during the day, and checks
          off each day whose post is published. Just posted? Check now instead of waiting.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-fit gap-2 px-4"
        disabled={pending}
        onClick={() => startTransition(async () => setState(await checkNowAction(slug)))}
      >
        <RefreshCwIcon aria-hidden="true" className={cn(pending && "motion-safe:animate-spin")} />
        {pending ? "Checking Buffer…" : "Check Buffer now"}
      </Button>
      {/* Empty, it takes no space but stays in place, so screen readers hear the result. */}
      <output
        className={cn(
          "block text-sm empty:sr-only",
          state.status === "error" && "text-destructive",
        )}
        aria-live="polite"
      >
        {state.status === "idle" ? "" : state.message}
      </output>
    </div>
  );
}

/** Opens a page in a new tab, with a word for screen readers that it does. */
function NewTabLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-1 underline underline-offset-3 hover:text-foreground md:min-h-0"
    >
      {children}
      <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/**
 * Which post this is: its first words (kept only while it waits for a day), where and when it
 * is, and links to the post on its network and in Buffer once it is published.
 */
function PostLine({ post }: { post: PostSummary }) {
  return (
    <div className="flex flex-col gap-1">
      {post.preview ? (
        <blockquote className="border-l-2 pl-3 text-sm leading-6">“{post.preview}”</blockquote>
      ) : null}
      <p className="flex flex-wrap items-center gap-x-1 text-muted-foreground text-sm">
        <span>
          Your post on {post.channelName} · {post.when}
        </span>
        {post.externalLink ? (
          <>
            <span aria-hidden="true">·</span>
            <NewTabLink href={post.externalLink}>
              {post.network ? `Open on ${post.network}` : "Open the post"}
            </NewTabLink>
          </>
        ) : null}
        {post.bufferLink ? (
          <>
            <span aria-hidden="true">·</span>
            <NewTabLink href={post.bufferLink}>Open in Buffer</NewTabLink>
          </>
        ) : null}
      </p>
    </div>
  );
}

function DayPicker({
  post,
  days,
  submitLabel,
  action,
  pending,
}: {
  post: PostSummary;
  days: DayChoice[];
  submitLabel: string;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const id = useId();
  if (days.length === 0) {
    return <p className="text-muted-foreground text-sm">Every day already has a post.</p>;
  }
  return (
    <form action={action} className="flex flex-col gap-2 @md:flex-row @md:items-end">
      <input type="hidden" name="seenPostId" value={post.id} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label htmlFor={id} className="font-medium text-sm">
          Day this post is for
        </label>
        <select
          id={id}
          name="entryId"
          className="h-11 min-w-0 rounded-lg border bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {days.map((day) => (
            <option key={day.entryId} value={day.entryId}>
              {day.label}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="outline" className="h-11 px-4" disabled={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}

/** "Is this post for…?": the matcher was not sure, so the person decides with one tap. */
export function PostQuestion({
  post,
  freeDays,
}: {
  post: PostSummary & { day: DayChoice };
  freeDays: DayChoice[];
}) {
  const [state, action, pending] = useActionState(answerPostAction, { status: "idle" });
  const others = freeDays.filter((day) => day.entryId !== post.day.entryId);
  return (
    <li className="@container flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-col gap-1">
        <p className="font-medium">Is this post for “{post.day.label}”?</p>
        <PostLine post={post} />
      </div>
      <form action={action} className="flex flex-wrap gap-2">
        <input type="hidden" name="seenPostId" value={post.id} />
        <Button
          type="submit"
          name="entryId"
          value={post.day.entryId}
          className="h-11 px-5"
          disabled={pending}
        >
          Yes, count it
        </Button>
        <Button
          type="submit"
          name="entryId"
          value=""
          variant="outline"
          className="h-11 px-5"
          disabled={pending}
        >
          No
        </Button>
      </form>
      {others.length > 0 ? (
        <details className="group">
          <summary className="flex h-11 w-fit list-none items-center gap-1 rounded-md font-medium text-muted-foreground text-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="transition-transform group-open:rotate-90">
              ›
            </span>
            It is for another day
          </summary>
          <div className="mt-2">
            <DayPicker
              post={post}
              days={others}
              submitLabel="Count it"
              action={action}
              pending={pending}
            />
          </div>
        </details>
      ) : null}
      <output
        className={cn("block text-sm", state.status === "error" && "text-destructive")}
        aria-live="polite"
      >
        {state.status === "idle" ? "" : state.message}
      </output>
    </li>
  );
}

/** A post that matches no prompt yet: the person can give it a day, unless it counts elsewhere. */
export function OtherPost({ post, freeDays }: { post: PostSummary; freeDays: DayChoice[] }) {
  const [state, action, pending] = useActionState(answerPostAction, { status: "idle" });
  return (
    <li className="@container flex flex-col gap-3 rounded-xl border p-4">
      <PostLine post={post} />
      {post.claimedBy ? (
        // A post counts in one challenge only: the one that recorded it first keeps it.
        <p className="text-muted-foreground text-sm">
          Already counts for {post.claimedBy}. A post counts in one challenge only, so it cannot
          count here too.
        </p>
      ) : (
        <DayPicker
          post={post}
          days={freeDays}
          submitLabel="Count it"
          action={action}
          pending={pending}
        />
      )}
      <output
        className={cn("block text-sm", state.status === "error" && "text-destructive")}
        aria-live="polite"
      >
        {state.status === "idle" ? "" : state.message}
      </output>
    </li>
  );
}
