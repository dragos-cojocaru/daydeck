import { Skeleton } from "@daydeck/ui/components/skeleton";
import { cn } from "@daydeck/ui/lib/utils";
import type { ReactNode } from "react";

// Loading placeholders shaped like the real pages: the same columns, cards and spacing, so
// nothing jumps when the content arrives. Screen readers hear one short sentence instead.

function Busy({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/**
 * For pages that are usually longer than the screen: the placeholder fills at least one screen,
 * so the footer starts below the fold and does not jump down when the content arrives.
 */
const LONG = "min-h-dvh";

/** A row of day tiles, as on a challenge card or a challenge's header. */
function StripSkeleton({ days = 5, size = "size-4" }: { days?: number; size?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1">
        {Array.from({ length: days }, (_, day) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders in a fixed order
          <Skeleton key={day} className={cn(size, "rounded-[3px]")} />
        ))}
      </div>
      <Skeleton className="h-3 w-28" />
    </div>
  );
}

/** The chips over a challenge: today's state, your role, how many people. */
function ChipsSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="h-7 w-24 rounded-full" />
      <Skeleton className="h-7 w-16 rounded-full" />
      <Skeleton className="h-4 w-16" />
    </div>
  );
}

/** An aside card: a heading, two lines and maybe a button. */
function CardSkeleton({ lines = 2, button = false }: { lines?: number; button?: boolean }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <Skeleton className="h-4 w-32" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: lines }, (_, line) => (
          <Skeleton
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders in a fixed order
            key={line}
            className={cn("h-3", line === lines - 1 ? "w-2/3" : "w-full")}
          />
        ))}
      </div>
      {button ? <Skeleton className="h-9 w-36" /> : null}
    </div>
  );
}

/** "Your challenges": the Active and Finished tabs, then a grid of challenge cards. */
export function ChallengeListSkeleton() {
  return (
    <Busy label="Loading your challenges" className={cn("flex flex-col gap-4", LONG)}>
      <Skeleton className="h-9 w-48 rounded-lg" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((card) => (
          <div key={card} className="flex flex-col gap-4 rounded-xl border bg-card p-5">
            <ChipsSkeleton />
            <Skeleton className="h-6 w-2/3" />
            <StripSkeleton />
            <div className="flex flex-col gap-2 rounded-lg bg-muted p-3">
              <Skeleton className="h-3 w-36 bg-background/70" />
              <Skeleton className="h-4 w-4/5 bg-background/70" />
            </div>
          </div>
        ))}
      </div>
    </Busy>
  );
}

/** A challenge's page: chips, title and days, then today's prompt and the side cards. */
export function OverviewSkeleton() {
  return (
    <Busy label="Loading the challenge" className={cn("flex flex-col gap-8", LONG)}>
      <div className="flex flex-col gap-3">
        <ChipsSkeleton />
        <Skeleton className="h-9 w-72 max-w-full" />
        <StripSkeleton size="size-[1.125rem]" />
      </div>
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-7 w-24" />
          <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 sm:p-6">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-9 w-40 rounded-full" />
            <div className="flex gap-2">
              <Skeleton className="h-11 w-36" />
              <Skeleton className="h-11 w-32" />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <CardSkeleton lines={3} button />
          <CardSkeleton lines={3} />
          <CardSkeleton lines={4} />
        </div>
      </div>
    </Busy>
  );
}

/** The board below its title: the view switch, the calendar and the day panel. */
export function BoardSkeleton() {
  return (
    <Busy label="Loading the board" className={cn("flex flex-col gap-6", LONG)}>
      <div className="flex max-w-3xl flex-col gap-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      <Skeleton className="h-9 w-44 rounded-lg" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
          <Skeleton className="h-5 w-36" />
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 35 }, (_, cell) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: placeholders in a fixed order
              <Skeleton key={cell} className="h-16 rounded-lg sm:h-20" />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <CardSkeleton lines={3} />
          <CardSkeleton lines={2} />
        </div>
      </div>
    </Busy>
  );
}

/** The recap: chips, title, three numbers, everyone's days and the badge card. */
export function RecapSkeleton() {
  return (
    <Busy label="Loading the recap" className={cn("flex flex-col gap-8", LONG)}>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
        </div>
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-5 w-2/3" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((stat) => (
          <div key={stat} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-14" />
          </div>
        ))}
      </div>
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-6 w-48" />
          <div className="flex flex-col divide-y rounded-xl border bg-card">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-4 p-3">
                <Skeleton className="size-6 rounded-full" />
                <Skeleton className="h-4 w-36" />
                <StripSkeleton days={8} size="size-5" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="aspect-[1200/630] w-full rounded-lg" />
          <Skeleton className="h-11 w-44" />
        </div>
      </div>
    </Busy>
  );
}

/** "Channels that count": the channel cards in two columns, and the side cards. */
export function ChannelsSkeleton() {
  return (
    <Busy label="Loading your channels" className="flex flex-col gap-6">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-6 w-44" />
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {[0, 1, 2].map((card) => (
              <div key={card} className="flex min-h-20 gap-3 rounded-xl border bg-card p-4">
                <Skeleton className="size-10 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="size-5 rounded-sm" />
              </div>
            ))}
          </div>
          <Skeleton className="h-11 w-36" />
        </div>
        <div className="flex flex-col gap-4">
          <CardSkeleton lines={4} button />
          <CardSkeleton lines={2} />
        </div>
      </div>
    </Busy>
  );
}

/** "Your data": the list of what is kept, then the delete card. */
/** One card of "What Daydeck keeps": a title, label and value rows, then lines of text. */
function KeepCardSkeleton({
  facts = 0,
  lines = 0,
  avatar = false,
  button = false,
}: {
  facts?: number;
  lines?: number;
  avatar?: boolean;
  button?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex h-6 items-center gap-2">
        <Skeleton className="size-4" />
        <Skeleton className="h-4 w-36" />
      </div>
      {avatar ? (
        <div className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex flex-col">
            <div className="flex h-6 items-center">
              <Skeleton className="h-4 w-28" />
            </div>
            <div className="flex h-6 items-center">
              <Skeleton className="h-3.5 w-40" />
            </div>
          </div>
        </div>
      ) : null}
      {facts > 0 ? (
        <div className="flex flex-col divide-y">
          {Array.from({ length: facts }, (_, row) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders in a fixed order
            <div key={row} className="flex h-9 items-center justify-between gap-4">
              <Skeleton className={cn("h-3.5", row % 2 === 0 ? "w-32" : "w-24")} />
              <Skeleton className="h-3.5 w-8" />
            </div>
          ))}
        </div>
      ) : null}
      {lines > 0 ? (
        <div className="flex flex-col">
          {Array.from({ length: lines }, (_, row) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders in a fixed order
            <div key={row} className="flex h-6 items-center">
              <Skeleton className={cn("h-3.5", row % 3 === 2 ? "w-1/2" : "w-5/6")} />
            </div>
          ))}
        </div>
      ) : null}
      {button ? <Skeleton className="mt-auto h-11 w-36 rounded-lg md:h-9" /> : null}
    </div>
  );
}

/** "What Daydeck keeps" on the Your data page: five cards, in the same grid. */
export function DataSkeleton() {
  return (
    <Busy label="Loading your data" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <KeepCardSkeleton avatar facts={2} lines={2} />
      <KeepCardSkeleton facts={2} lines={8} />
      <KeepCardSkeleton lines={4} button />
      <KeepCardSkeleton facts={3} lines={2} />
      <KeepCardSkeleton facts={4} lines={1} />
    </Busy>
  );
}

/** "Your challenges" on the Your data page: rows with a name, facts and a delete date. */
export function DataChallengesSkeleton() {
  return (
    <Busy
      label="Loading your challenges"
      className="flex flex-col divide-y rounded-xl border bg-card"
    >
      {[0, 1].map((row) => (
        <div
          key={row}
          className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
        >
          <div className="flex flex-col gap-1">
            <div className="flex h-11 items-center gap-2 md:h-8">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
            <div className="flex h-6 items-center">
              <Skeleton className="h-3.5 w-72 max-w-full" />
            </div>
          </div>
          <div className="flex h-6 items-center sm:h-8">
            <Skeleton className="h-3.5 w-56" />
          </div>
        </div>
      ))}
    </Busy>
  );
}

/** Community: the places, the channel's messages and box, and the member list. */
export function CommunitySkeleton({ className }: { className?: string }) {
  return (
    <Busy
      label="Loading the community"
      className={cn("flex w-full flex-col md:flex-row", className)}
    >
      <div className="flex gap-1 border-b p-2 md:w-52 md:shrink-0 md:flex-col md:border-r md:border-b-0">
        {[0, 1, 2, 3].map((place) => (
          <Skeleton key={place} className="h-9 w-24 md:w-full" />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b px-4 py-2.5">
          <Skeleton className="size-5" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-5 px-3 py-4">
          {[0, 1, 2].map((message) => (
            <div key={message} className="flex gap-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className={cn("h-4", message === 1 ? "w-1/2" : "w-3/4")} />
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 border-t p-3">
          <Skeleton className="h-11 flex-1" />
          <Skeleton className="h-11 w-24" />
        </div>
      </div>
      <div className="hidden w-72 shrink-0 flex-col gap-2 border-l p-3 xl:flex">
        <Skeleton className="h-3 w-24" />
        {[0, 1, 2].map((member) => (
          <div key={member} className="flex h-11 items-center gap-2 px-2">
            <Skeleton className="size-6 rounded-full" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    </Busy>
  );
}
