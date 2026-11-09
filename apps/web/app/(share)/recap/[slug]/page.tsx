import { buttonVariants } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import {
  ExternalLinkIcon,
  FlagIcon,
  FlameIcon,
  GlobeIcon,
  LockIcon,
  UsersIcon,
} from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { RecapSkeleton } from "@/components/skeletons";
import { UserAvatar } from "@/components/user-avatar";
import { BadgeCard } from "@/features/board/badge-card";
import { BoardLegend } from "@/features/board/board-legend";
import { RecapOptIn, RecapShareLink, RecapVisibility } from "@/features/board/recap-settings";
import { StateTip } from "@/features/board/state-tip";
import { STATE_LABELS } from "@/features/board/state-words";
import { ChallengeBar } from "@/features/challenges/challenge-bar";
import { ChallengeTabs } from "@/features/challenges/challenge-tabs";
import { bestStreak } from "@/lib/streak";
import { getCurrentSessionOrNull } from "@/server/auth/current-user";
import { visitorRecap } from "@/server/board/cached-recap";
import { loadRecap } from "@/server/board/recap";
import { navChallenges } from "@/server/challenges/nav";
import { challengeHeader } from "@/server/challenges/service";
import { getDb } from "@/server/db";

export const metadata: Metadata = { title: "Recap", robots: { index: false } };

export default function RecapPage({ params }: PageProps<"/recap/[slug]">) {
  return (
    <Suspense
      fallback={
        <main
          id="main"
          className="flex w-full flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12 lg:px-8"
        >
          <RecapSkeleton />
        </main>
      }
    >
      <Recap params={params} />
    </Suspense>
  );
}

async function Recap({ params }: Pick<PageProps<"/recap/[slug]">, "params">) {
  const { slug } = await params;
  const session = await getCurrentSessionOrNull();
  const db = getDb();
  // Visitors have no session cookie, so mark this as a real request before reading the clock.
  await connection();
  // Visitors share one cached copy; signed-in people get their own row and badge.
  const recap = session
    ? await loadRecap(db, slug, session.user.id, new Date())
    : await visitorRecap(db, slug, new Date());
  if (!recap) notFound();
  const you = recap.rows.find((row) => row.isYou);
  const shared = recap.rows.filter((row) => row.links.length > 0);
  // Members see the recap as one of the challenge's pages, with its bar and tabs.
  const [header, nav] =
    recap.you && session
      ? await Promise.all([
          challengeHeader(db, slug, session.user.id),
          navChallenges(session.user.id),
        ])
      : [null, []];
  const possible = recap.people * recap.days;
  const share = possible > 0 ? Math.round((recap.posts / possible) * 100) : 0;

  return (
    <>
      {header ? (
        <>
          <ChallengeBar
            slug={header.slug}
            title={header.title}
            inviteCode={header.inviteCode}
            invitePaused={header.invitePaused}
            challenges={nav}
          />
          <ChallengeTabs slug={header.slug} />
        </>
      ) : null}
      <main
        id="main"
        className={cn(
          "flex w-full flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12",
          // Members see it in the app, beside the sidebar; visitors in the public frame, lined
          // up with the header.
          recap.you ? "lg:px-8" : "mx-auto max-w-6xl",
        )}
      >
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Chip Icon={recap.isOpen ? FlameIcon : FlagIcon} strong={recap.isOpen}>
              {recap.isOpen ? "Running" : "Finished"}
            </Chip>
            <Chip Icon={recap.isPublic ? GlobeIcon : LockIcon}>
              {recap.isPublic ? "Public" : "Members only"}
            </Chip>
          </div>
          <h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">{recap.title}</h1>
          <p className="max-w-3xl text-lg text-muted-foreground">
            {recap.isOpen
              ? "The challenge so far, everyone's days side by side. It fills in as people post."
              : "The whole challenge, everyone's days side by side."}
          </p>
        </header>

        {/* The group's numbers come first: the moment to celebrate. */}
        <dl className="grid gap-3 sm:grid-cols-3">
          <Stat label="Posts published" value={recap.posts} />
          <Stat label={recap.people === 1 ? "Person" : "People"} value={recap.people} />
          <Stat label="Of all days posted" value={`${share}%`} />
        </dl>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
          <div className="flex min-w-0 flex-col gap-8">
            <section aria-labelledby="mosaic-heading" className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h2 id="mosaic-heading" className="font-semibold text-xl">
                  Everyone, day by day
                </h2>
                <p className="text-muted-foreground">
                  {recap.days} {recap.days === 1 ? "day" : "days"}. People who keep their name
                  private show as unnamed rows.
                </p>
              </div>
              <ul className="flex flex-col divide-y rounded-xl border bg-card">
                {recap.rows.map((row, index) => {
                  const name = row.name ?? `Participant ${index + 1}`;
                  return (
                    <li
                      key={row.participantId}
                      className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4"
                    >
                      <span className="flex w-48 shrink-0 items-center gap-2 text-sm">
                        {row.name ? (
                          <UserAvatar name={row.name} src={row.avatarUrl} size="sm" />
                        ) : (
                          <span className="flex size-6 items-center justify-center rounded-full bg-tile">
                            <UsersIcon
                              aria-hidden="true"
                              className="size-3.5 text-muted-foreground"
                            />
                          </span>
                        )}
                        <span className="truncate">
                          {name}
                          {row.isYou ? <span className="text-muted-foreground"> (you)</span> : null}
                        </span>
                      </span>
                      <span
                        role="img"
                        aria-label={`${name}: ${row.posted} of ${recap.days} days posted`}
                        className="flex flex-1 flex-wrap gap-1"
                      >
                        {row.states.map((state, day) => (
                          <StateTip
                            // biome-ignore lint/suspicious/noArrayIndexKey: one square per day, in order
                            key={day}
                            state={state}
                            size="md"
                            label={`${name} · Day ${day + 1} · ${STATE_LABELS[state]}`}
                          />
                        ))}
                      </span>
                      <span className="shrink-0 text-muted-foreground text-sm tabular-nums">
                        {row.posted} of {recap.days}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <BoardLegend />
            </section>

            {shared.length > 0 ? (
              <section aria-labelledby="posts-heading" className="flex flex-col gap-3">
                <h2 id="posts-heading" className="font-semibold text-xl">
                  Posts people chose to share
                </h2>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {shared.map((row) => (
                    <li
                      key={row.participantId}
                      className="flex flex-col gap-3 rounded-xl border bg-card p-4"
                    >
                      <span className="flex items-center gap-2 font-medium">
                        <UserAvatar name={row.name ?? ""} src={row.avatarUrl} size="sm" />
                        {row.name}
                      </span>
                      <ul className="flex flex-col">
                        {row.links.map((link) => (
                          <li key={link.day}>
                            <a
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="flex min-h-11 items-center gap-2 rounded-md px-1 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                            >
                              <span className="shrink-0 text-muted-foreground">Day {link.day}</span>
                              <span className="min-w-0 flex-1 truncate">{link.title}</span>
                              <ExternalLinkIcon aria-hidden="true" className="size-3.5 shrink-0" />
                              <span className="sr-only">(opens in a new tab)</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          {recap.you && you ? (
            <aside aria-label="Your recap" className="flex flex-col gap-4">
              <BadgeCard
                slug={slug}
                participantId={you.participantId}
                alt={`Your Daydeck badge: ${you.posted} of ${recap.days} days posted`}
                streak={bestStreak(you.states)}
              />
              <RecapOptIn slug={slug} optIn={recap.you.wallOptIn} isPublic={recap.isPublic} />
              {recap.you.isHost ? (
                <RecapVisibility slug={slug} isPublic={recap.isPublic} />
              ) : recap.isPublic ? (
                <RecapShareLink slug={slug} />
              ) : null}
            </aside>
          ) : (
            <aside className="flex flex-col gap-3 rounded-xl border bg-card p-5">
              <h2 className="font-semibold text-lg">Run a challenge like this</h2>
              <p className="text-muted-foreground text-sm leading-6">
                Daydeck gives your team, community or class one prompt a day, saves it as a draft in
                Buffer, and checks off each day when the post is published.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href="/challenges/new" className={cn(buttonVariants(), "h-11 px-4")}>
                  Host a challenge
                </Link>
                <Link
                  href={"/how-it-works" as Route}
                  className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4")}
                >
                  How Daydeck works
                </Link>
              </div>
            </aside>
          )}
        </div>
      </main>
    </>
  );
}

function Chip({
  Icon,
  strong = false,
  children,
}: {
  Icon: typeof FlameIcon;
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 font-medium text-xs",
        strong ? "bg-accent text-accent-foreground" : "bg-tile text-muted-foreground",
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {children}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card p-4">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="font-semibold text-3xl tabular-nums tracking-tight">{value}</dd>
    </div>
  );
}
