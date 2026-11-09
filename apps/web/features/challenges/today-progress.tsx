"use client";

import type { EntryState } from "@daydeck/db";
import { Button } from "@daydeck/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@daydeck/ui/components/popover";
import { MoonIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { StateMark } from "@/features/board/state-mark";
import { STATE_LABELS } from "@/features/board/state-words";

export interface DueToday {
  slug: string;
  title: string;
  state: EntryState;
}

/** Saved as a draft, scheduled or posted: today's part is done in Daydeck. */
const READY: EntryState[] = ["saved", "planned", "done", "caught_up"];

/**
 * "Today: 1 of 3 ready" in the top bar of Your challenges. Hover with a mouse, or click or tap,
 * to see what it counts and each challenge's state.
 */
export function TodayProgress({ items }: { items: DueToday[] }) {
  const total = items.length;
  const ready = items.filter((item) => READY.includes(item.state)).length;
  const label = total === 0 ? "No prompts today" : `Today: ${ready} of ${total} ready`;
  const todo = items.filter((item) => !READY.includes(item.state));
  const done = items.filter((item) => READY.includes(item.state));

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={200}
        render={
          <Button
            variant="ghost"
            className="h-11 shrink-0 gap-2 px-2.5 font-normal aria-expanded:bg-muted md:h-8"
          />
        }
      >
        {total === 0 ? (
          <MoonIcon aria-hidden="true" className="text-muted-foreground" />
        ) : (
          <ProgressRing value={ready} total={total} />
        )}
        <span className="text-sm">{label}</span>
        <span className="sr-only">: what this counts</span>
      </PopoverTrigger>
      {/* Never taller than 32rem, nor than the room left on screen. */}
      <PopoverContent align="end" className="max-h-[min(32rem,var(--available-height))] w-80">
        <PopoverHeader>
          <PopoverTitle>Today's progress</PopoverTitle>
          <PopoverDescription>
            {total === 0
              ? "None of your challenges has a prompt today."
              : `${ready} of your ${total} challenges with a prompt today ${ready === 1 ? "is" : "are"} ready.`}
          </PopoverDescription>
        </PopoverHeader>
        <p className="text-muted-foreground text-xs leading-5">
          A day is ready once its prompt is saved as a draft, scheduled or posted in Buffer. It
          counts only challenges with a prompt today; rest days, paused days and challenges that
          have not started are left out. Each challenge's day starts at midnight in its own time
          zone.
        </p>
        {items.length > 0 ? (
          // Only the list scrolls; the title and the explanation above it stay in view.
          <div className="-mx-1.5 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            <Group title="Still to do" items={todo} />
            <Group title="Ready" items={done} />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** One group of the list, with its count; nothing when it is empty. */
function Group({ title, items }: { title: string; items: DueToday[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label={`${title}: ${items.length}`}>
      <h3 className="sticky top-0 z-10 bg-popover px-1.5 py-1 font-medium text-muted-foreground text-xs">
        {title} · {items.length}
      </h3>
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.slug}>
            <Link
              href={`/challenges/${item.slug}` as Route}
              className="flex min-h-11 items-center gap-2.5 rounded-md px-1.5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset md:min-h-9"
            >
              <StateMark state={item.state} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
              <span className="shrink-0 text-muted-foreground text-xs">
                {STATE_LABELS[item.state]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A small ring that fills as more of today's prompts are ready. Decorative: the text says it. */
function ProgressRing({ value, total }: { value: number; total: number }) {
  const radius = 6;
  const length = 2 * Math.PI * radius;
  const filled = total === 0 ? 0 : (value / total) * length;
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 -rotate-90">
      <circle
        cx="8"
        cy="8"
        r={radius}
        fill="none"
        strokeWidth="2.5"
        className="stroke-foreground/15"
      />
      <circle
        cx="8"
        cy="8"
        r={radius}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${length}`}
        className="stroke-primary"
      />
    </svg>
  );
}
