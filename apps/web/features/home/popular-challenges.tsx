import { buttonVariants } from "@daydeck/ui/components/button";
import { Skeleton } from "@daydeck/ui/components/skeleton";
import { cn } from "@daydeck/ui/lib/utils";
import { ArrowRightIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { UserAvatar } from "@/components/user-avatar";
import { stateTileClass } from "@/features/board/state-mark";
import { formatDay } from "@/features/challenges/format";
import { VERY_ACTIVE_WORDS } from "@/lib/home-listing";
import type { HomeChallenge } from "@/server/home/popular";
import { PopularCarousel } from "./popular-carousel";
import { POPULAR_ITEM, POPULAR_LIST } from "./popular-layout";

// "Popular challenges": active public challenges anyone can look inside and join, as a row of
// cards. The homepage shows it to everyone, ending with a card that says how a challenge gets
// listed. The challenges page shows it to signed-in people, without the ones they are in.

/** People rows on each card's small board. */
const BOARD_ROWS = 4;

/** Every card and placeholder has this height at least, so the row never jumps as it loads. */
const CARD =
  "relative flex min-h-[27rem] w-full flex-col gap-4 rounded-2xl border bg-card p-5 text-card-foreground";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function PopularHeader() {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h2 id="popular-heading" className="font-semibold text-2xl leading-8 tracking-tight">
        Popular challenges
      </h2>
      <p className="text-muted-foreground leading-6">
        Public challenges with a lot going on this week. Look inside, then join in.
      </p>
    </div>
  );
}

/**
 * The row of cards. `withHostCard` adds the last card, which explains how a challenge gets
 * listed and links to "Host a challenge". It is also what an empty homepage row shows.
 */
export function PopularRow({
  challenges,
  withHostCard,
  listClassName,
}: {
  challenges: HomeChallenge[];
  withHostCard: boolean;
  listClassName?: string;
}) {
  return (
    <PopularCarousel header={<PopularHeader />} listClassName={listClassName}>
      {challenges.map((challenge) => (
        <li key={challenge.slug} className={POPULAR_ITEM}>
          <ChallengeCard challenge={challenge} />
        </li>
      ))}
      {withHostCard ? (
        <li className={POPULAR_ITEM}>
          <HostCard first={challenges.length === 0} />
        </li>
      ) : null}
    </PopularCarousel>
  );
}

/** The row's shape while it loads: the same header, and three cards of the same size. */
export function PopularRowSkeleton({ listClassName }: { listClassName?: string }) {
  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <PopularHeader />
      </div>
      <p className="sr-only">Loading popular challenges</p>
      <ul aria-hidden="true" className={cn(POPULAR_LIST, listClassName)}>
        {[0, 1, 2].map((card) => (
          <li key={card} className={POPULAR_ITEM}>
            <div className={CARD}>
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-6 w-3/4" />
                <div className="flex items-center gap-2">
                  <Skeleton className="size-6 rounded-full" />
                  <Skeleton className="h-4 w-36" />
                </div>
              </div>
              <Skeleton className="h-5 w-48" />
              <div className="flex flex-col gap-2">
                {Array.from({ length: BOARD_ROWS }, (_, row) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows never reorder
                  <Skeleton key={row} className="h-4 w-full" />
                ))}
              </div>
              <Skeleton className="mt-auto h-11 w-full" />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function startLine(challenge: HomeChallenge): string {
  if (!challenge.opensOn) return "Your day 1 is the day you join.";
  if (challenge.started) {
    return `Started ${formatDay(challenge.opensOn)}. Join to start with today's prompt.`;
  }
  return `Everyone starts on ${formatDay(challenge.opensOn)}.`;
}

/**
 * One challenge: who hosts it, how active it is, a small board of its most active people, and
 * how joining works. The title is the card's one link and covers the whole card.
 */
function ChallengeCard({ challenge }: { challenge: HomeChallenge }) {
  const { recap } = challenge;
  const host = challenge.hostName ?? "A Daydeck host";
  // The busiest people first. Without their name shown, a row is "Participant N", as on the recap.
  const rows = recap.rows
    .map((row, index) => ({ ...row, label: row.name ?? `Participant ${index + 1}` }))
    .sort((a, b) => b.posted - a.posted)
    .slice(0, BOARD_ROWS);
  const more = recap.rows.length - rows.length;
  // Long challenges get thinner gaps, so every day still fits on one line.
  const gap = recap.days > 14 ? "1px" : "3px";
  return (
    <article
      className={cn(
        CARD,
        "group/card transition-colors hover:border-foreground/25 has-[a:focus-visible]:border-ring has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50",
      )}
    >
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-muted-foreground text-xs leading-4">
          {challenge.isDemo ? (
            <span className="rounded-full bg-accent px-2 py-0.5 font-medium text-accent-foreground">
              Demo
            </span>
          ) : null}
          <span>
            {plural(recap.days, "day", "days")} ·{" "}
            {challenge.cadence === "daily" ? "a post every day" : "a post each weekday"}
          </span>
        </p>
        <h3 className="line-clamp-2 font-semibold text-lg leading-6">
          <Link
            href={`/c/${challenge.inviteCode}`}
            className="outline-none after:absolute after:inset-0 after:rounded-2xl"
          >
            {recap.title}
          </Link>
        </h3>
        <div className="flex min-w-0 items-center gap-2 text-muted-foreground text-sm leading-5">
          <UserAvatar name={host} src={challenge.hostAvatarUrl} size="sm" />
          <span className="truncate">Hosted by {host}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-sm leading-5">
          <span className="font-medium">{plural(recap.people, "person", "people")}</span> ·{" "}
          {plural(challenge.postsThisWeek, "post", "posts")} this week
        </p>
        {challenge.isDemo ? (
          <p className="text-muted-foreground text-sm leading-5">
            A demo to try every part of Daydeck. Its other members are samples.
          </p>
        ) : null}
      </div>

      {/* On a narrow card the days go on their own line under the name, so they stay readable. */}
      <div className="@container flex flex-col gap-2">
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.participantId}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 @2xs:grid-cols-[minmax(0,6rem)_minmax(0,1fr)_2.25rem]"
            >
              <span className="sr-only">
                {row.label}: {row.posted} of {recap.days} days posted
              </span>
              <span aria-hidden="true" className="truncate text-xs leading-4">
                {row.label}
              </span>
              <span
                aria-hidden="true"
                className="col-span-2 row-start-2 grid @2xs:col-span-1 @2xs:row-start-auto"
                style={{
                  gap,
                  gridTemplateColumns: `repeat(${recap.days}, minmax(0, 0.875rem))`,
                }}
              >
                {row.states.map((state, day) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: one tile per day, in order
                    key={day}
                    className={cn("aspect-square rounded-[3px]", stateTileClass(state))}
                  />
                ))}
              </span>
              <span
                aria-hidden="true"
                className="text-right text-muted-foreground text-xs tabular-nums leading-4"
              >
                {row.posted}/{recap.days}
              </span>
            </li>
          ))}
        </ul>
        {more > 0 ? (
          <p className="text-muted-foreground text-xs leading-4">
            and {plural(more, "more person", "more people")}
          </p>
        ) : null}
      </div>

      <div className="mt-auto flex flex-col gap-3">
        <p className="text-muted-foreground text-sm leading-5">{startLine(challenge)}</p>
        {/* Looks like a button; the title link above already covers the whole card. */}
        <span
          aria-hidden="true"
          className={cn(
            buttonVariants({ variant: challenge.isDemo ? "default" : "outline" }),
            "h-11 w-full px-4",
            challenge.isDemo ? "group-hover/card:bg-primary/80" : "group-hover/card:bg-muted",
          )}
        >
          {challenge.isDemo ? "Try the demo" : "See it and join"}
          <ArrowRightIcon data-icon="inline-end" />
        </span>
      </div>
    </article>
  );
}

/** The last card: how a challenge gets listed here, and the way to host one. */
function HostCard({ first }: { first: boolean }) {
  return (
    <div className="flex min-h-[27rem] w-full flex-col gap-3 rounded-2xl border border-dashed p-5">
      <span
        aria-hidden="true"
        className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground"
      >
        <PlusIcon className="size-4" />
      </span>
      <h3 className="font-semibold text-lg leading-6">
        {first ? "Yours could be the first here" : "Your challenge here"}
      </h3>
      <p className="text-muted-foreground text-sm leading-6">
        A public challenge shows here when its host turns on “Show it under Popular challenges” and
        it is active: {VERY_ACTIVE_WORDS}.
      </p>
      <Link
        href="/challenges/new"
        className={cn(buttonVariants({ variant: "outline" }), "mt-auto h-11 w-full px-4")}
      >
        Host a challenge
      </Link>
    </div>
  );
}
