import { cn } from "@daydeck/ui/lib/utils";
import { SparklesIcon } from "lucide-react";
import Link from "next/link";

const COPY = {
  ai: {
    chip: "On",
    body: "Wrote a post straight in Buffer instead of saving a prompt here? Drafts, scheduled and published posts all count. The next time Daydeck checks Buffer, AI reads the post and finds the day it is for; the day is checked off once the post is published. When AI is not sure, a “Check this post” box appears at the top of this page.",
  },
  keyword: {
    chip: "Words only",
    body: "Posts you write straight in Buffer get their day by the words they share with a prompt, without AI. When none fits, they wait under “Other posts” on this page, where you can give them a day.",
  },
  off: {
    chip: "Off",
    body: "Matching is turned off on this Daydeck. Posts you write straight in Buffer wait under “Other posts” on this page, where you can give each one a day yourself.",
  },
} as const;

/**
 * What happens to a post written straight in Buffer, in plain words: whether AI matching is on,
 * when it runs, and how often it found a day for you here.
 */
export function AiMatchingCard({
  mode,
  matched,
}: {
  mode: "ai" | "keyword" | "off";
  matched: number;
}) {
  const copy = COPY[mode];
  return (
    <section
      aria-labelledby="ai-heading"
      className="flex flex-col gap-2 rounded-xl border bg-card p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="ai-heading" className="flex items-center gap-2 font-semibold text-sm">
          <SparklesIcon aria-hidden="true" className="size-4 text-primary" />
          AI matching
        </h2>
        <span
          className={cn(
            "inline-flex h-6 items-center rounded-full px-2 font-medium text-xs",
            mode === "ai" ? "bg-accent text-accent-foreground" : "bg-tile text-muted-foreground",
          )}
        >
          {copy.chip}
        </span>
      </div>
      <p className="text-muted-foreground text-xs leading-5">{copy.body}</p>
      {mode === "ai" ? (
        <>
          {matched > 0 ? (
            <p className="text-xs leading-5">
              It found the day for {matched === 1 ? "1 of your posts" : `${matched} of your posts`}{" "}
              in this challenge.
            </p>
          ) : null}
          <p className="text-muted-foreground text-xs leading-5">
            Each post is read once, and again only if you change its text. Only the post's text and
            the prompts go to the AI service. Daydeck keeps no copy, only the first 100 characters
            while a post waits for you to give it a day.
          </p>
        </>
      ) : null}
      <Link
        href="/guide#ai-heading"
        className="w-fit rounded-sm text-xs underline underline-offset-3 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        How it works
      </Link>
    </section>
  );
}
