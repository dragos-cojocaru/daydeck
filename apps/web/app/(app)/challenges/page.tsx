import { buttonVariants } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import { ArrowRightIcon } from "lucide-react";
import type { Metadata, Route } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { cache, type ReactNode, Suspense } from "react";
import { ChallengeListSkeleton } from "@/components/skeletons";
import { TermHint } from "@/components/term-hint";
import { ChallengeChips, DayStrip } from "@/features/challenges/challenge-summary";
import { ClickThrough } from "@/features/challenges/click-through";
import { formatDay, formatLongDay } from "@/features/challenges/format";
import { PromptLabel, promptText } from "@/features/challenges/prompt-label";
import { TodayProgress } from "@/features/challenges/today-progress";
import { PopularRow } from "@/features/home/popular-challenges";
import { NotificationsButton } from "@/features/notifications/notifications-button";
import { EndCrumb, TopPagesItems } from "@/features/shell/crumb-menus";
import { GettingStarted } from "@/features/shell/getting-started";
import { TOP_BAR_CLASS } from "@/features/shell/top-bar-styles";
import { requireUser } from "@/server/auth/current-user";
import { navChallenges } from "@/server/challenges/nav";
import { type ChallengeToday, todayOverview } from "@/server/challenges/service";
import { getDb } from "@/server/db";
import { homeChallengesOrNone } from "@/server/home/popular";
import { gettingStarted, HIDE_GETTING_STARTED_COOKIE } from "@/server/onboarding";

export const metadata: Metadata = { title: "Your challenges" };

// The bar and the list read the same overview; one load per request serves both.
const overviewFor = cache((userId: string) => todayOverview(getDb(), userId, new Date()));

export default function ChallengesPage({ searchParams }: PageProps<"/challenges">) {
  return (
    <>
      <Suspense
        fallback={
          <div className={TOP_BAR_CLASS}>
            <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
              <ol className="flex min-w-0 items-center">
                <li className="flex min-w-0">
                  <EndCrumb label="Your challenges" />
                </li>
              </ol>
            </nav>
            <NotificationsButton className="hidden md:block" />
          </div>
        }
      >
        <ChallengesBar />
      </Suspense>
      <main
        id="main"
        className="flex w-full flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12 lg:px-8"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="font-semibold text-3xl tracking-tight">Your challenges</h1>
            <p className="text-muted-foreground">
              The challenges you host or take part in. Open one to see today's{" "}
              <TermHint hint="A short idea for what to post that day.">prompt</TermHint> for that
              challenge.
            </p>
          </div>
          {/* From 768px this button is at the top of the sidebar. */}
          <Link
            href="/challenges/new"
            className={cn(buttonVariants(), "h-11 shrink-0 px-5 md:hidden")}
          >
            Host a challenge
          </Link>
        </div>
        <Suspense fallback={<ChallengeListSkeleton />}>
          <Overview searchParams={searchParams} />
        </Suspense>
        {/* Last on the page and with no placeholder, so it never pushes anything down. */}
        <Suspense fallback={null}>
          <PopularForYou />
        </Suspense>
      </main>
    </>
  );
}

/** The top bar: where you are, and how many of today's prompts are ready. */
async function ChallengesBar() {
  const user = await requireUser("/challenges");
  const [rows, nav] = await Promise.all([overviewFor(user.id), navChallenges(user.id)]);
  const due = rows
    .filter((row) => row.status === "open" && row.position.kind === "prompt" && row.prompt)
    .filter((row) => row.prompt?.state !== "paused")
    .map((row) => ({ slug: row.slug, title: row.title, state: row.prompt?.state ?? "open" }));
  return (
    <div className={TOP_BAR_CLASS}>
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center">
          <li className="flex min-w-0">
            <EndCrumb label="Your challenges">
              <TopPagesItems challenges={nav} />
            </EndCrumb>
          </li>
        </ol>
      </nav>
      {rows.length > 0 ? <TodayProgress items={due} /> : null}
      <NotificationsButton className="hidden md:block" />
    </div>
  );
}

/** Finished: closed, or past its last day for you. Everything else is active. */
function isFinished(row: ChallengeToday): boolean {
  return row.status === "closed" || row.position.kind === "after";
}

async function Overview({ searchParams }: Pick<PageProps<"/challenges">, "searchParams">) {
  const user = await requireUser("/challenges");
  const db = getDb();
  const [rows, steps, query] = await Promise.all([
    overviewFor(user.id),
    gettingStarted(db, user.id),
    searchParams,
  ]);
  const hidden = (await cookies()).get(HIDE_GETTING_STARTED_COOKIE)?.value === "1";
  const view = query.view === "finished" ? "finished" : "active";
  const active = rows.filter((row) => !isFinished(row));
  const finished = rows.filter(isFinished);
  const list = (view === "finished" ? finished : active).sort((a, b) => urgency(a) - urgency(b));

  return (
    <>
      {/* From 768px the checklist is in the sidebar; phones show it here. */}
      {hidden || steps.every((step) => step.done) ? null : (
        <div className="md:hidden">
          <GettingStarted steps={steps} />
        </div>
      )}
      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
          <h2 className="font-semibold text-lg">No challenges yet</h2>
          <p className="text-muted-foreground">
            Host one for your team, community or class. If someone sent you an invite link, open it
            to join their challenge.
          </p>
          <Link href="/guide" className="text-sm underline underline-offset-3">
            How Daydeck works
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <nav
            aria-label="Which challenges"
            className="inline-flex w-fit rounded-lg bg-muted p-0.5"
          >
            <ViewTab href="/challenges" current={view === "active"}>
              Active <span className="tabular-nums">({active.length})</span>
            </ViewTab>
            <ViewTab href="/challenges?view=finished" current={view === "finished"}>
              Finished <span className="tabular-nums">({finished.length})</span>
            </ViewTab>
          </nav>
          {list.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-muted-foreground">
              {view === "finished"
                ? "No finished challenges yet. A challenge moves here after its last day."
                : "No active challenges. Host one, or open an invite link someone sent you."}
            </p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((row) => (
                <li key={row.slug} className="flex">
                  <ChallengeCard row={row} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

/**
 * The homepage's "Popular challenges", without the ones this person is already in. Nothing at
 * all when none are left: the page already has its own "Host a challenge" button.
 */
async function PopularForYou() {
  const user = await requireUser("/challenges");
  const [popular, mine] = await Promise.all([
    homeChallengesOrNone(getDb(), new Date()),
    overviewFor(user.id),
  ]);
  const joined = new Set(mine.map((row) => row.slug));
  const challenges = popular.filter((challenge) => !joined.has(challenge.slug));
  if (challenges.length === 0) return null;
  return (
    <section aria-labelledby="popular-heading" className="flex flex-col gap-5 border-t pt-8">
      <PopularRow
        challenges={challenges}
        withHostCard={false}
        listClassName="lg:-mx-8 lg:scroll-px-8 lg:px-8"
      />
    </section>
  );
}

/** One tab above the list: a link, so each view has its own address. */
function ViewTab({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href as Route}
      aria-current={current ? "page" : undefined}
      className={cn(
        "inline-flex h-10 items-center gap-1 rounded-md px-3 text-muted-foreground text-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:h-8",
        current && "bg-background font-medium text-foreground shadow-sm",
      )}
    >
      {children}
    </Link>
  );
}

/** Challenges that still need today's post come first, closed ones last. */
function urgency(row: ChallengeToday): number {
  if (row.status === "closed") return 4;
  if (row.position.kind === "prompt") {
    return row.prompt?.state === "open" || row.prompt?.state === "missed" ? 0 : 1;
  }
  return row.position.kind === "after" ? 3 : 2;
}

function ChallengeCard({ row }: { row: ChallengeToday }) {
  const when =
    row.position.kind === "prompt"
      ? "Today"
      : row.position.kind === "rest"
        ? `Next, ${formatDay(row.position.nextDate)}`
        : row.position.kind === "before"
          ? formatDay(row.position.startsOn)
          : null;
  const finished = isFinished(row);
  const deletedOn = row.deletion ? formatLongDay(row.deletion.date) : null;

  return (
    // The title is the card's link, stretched over the whole card; the recap link sits above it.
    <article className="relative flex w-full flex-col gap-4 rounded-xl border bg-card p-5 transition-colors hover:border-foreground/30 has-[[data-card-link]:focus-visible]:ring-3 has-[[data-card-link]:focus-visible]:ring-ring/50">
      <ChallengeChips
        source={{
          status: row.status,
          position: row.position,
          todayState: row.prompt?.state ?? null,
          deletesInDays: row.deletion?.days ?? null,
        }}
        role={row.role}
        memberCount={row.memberCount}
      />
      <div className="flex flex-col gap-2">
        <h2 className="font-semibold text-lg leading-6">
          <Link
            data-card-link
            href={`/challenges/${row.slug}` as Route}
            className="outline-none after:absolute after:inset-0 after:rounded-xl"
          >
            {row.title}
          </Link>
        </h2>
        {/* Above the card's stretched link, so each day's tooltip opens on hover; a click
            still opens the challenge. */}
        <ClickThrough
          href={`/challenges/${row.slug}`}
          className="relative z-10 w-fit cursor-pointer [&_*]:cursor-pointer"
        >
          <DayStrip states={row.strip} saved={row.savedCount} />
        </ClickThrough>
      </div>
      {row.prompt && when && !finished ? (
        <div className="mt-auto flex flex-col gap-1 rounded-lg bg-muted p-3">
          <PromptLabel dayNumber={row.prompt.dayNumber} detail={when} />
          <p className="line-clamp-2 font-medium text-sm leading-5">{promptText(row.prompt)}</p>
        </div>
      ) : null}
      {finished ? (
        <div className="relative z-10 mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t pt-3">
          <Link
            href={`/recap/${row.slug}` as Route}
            className="inline-flex min-h-11 items-center gap-1 rounded-sm font-medium text-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-8"
          >
            Recap and badges
            <ArrowRightIcon aria-hidden="true" className="size-4" />
          </Link>
          <span className="text-muted-foreground text-xs">
            {deletedOn ? `Deleted on ${deletedOn}` : "Deleted 30 days after it closes"}
          </span>
        </div>
      ) : null}
    </article>
  );
}
