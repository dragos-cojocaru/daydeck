import { Alert, AlertDescription, AlertTitle } from "@daydeck/ui/components/alert";
import { buttonVariants } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import {
  AwardIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  HourglassIcon,
  PartyPopperIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ConfirmAction } from "@/components/confirm-action";
import { OverviewSkeleton } from "@/components/skeletons";
import { closeChallengeAction, leaveChallengeAction } from "@/features/account/data-actions";
import { RecapVisibility } from "@/features/board/recap-settings";
import { StateMark } from "@/features/board/state-mark";
import { STATE_LABELS as BOARD_LABELS } from "@/features/board/state-words";
import { AiMatchingCard } from "@/features/challenges/ai-matching-card";
import { ChallengeChannels } from "@/features/challenges/challenge-channels";
import { ChallengeChips, DayStrip } from "@/features/challenges/challenge-summary";
import { formatDay, formatLongDay } from "@/features/challenges/format";
import { HomeListing } from "@/features/challenges/home-listing";
import { LastChecked } from "@/features/challenges/last-checked";
import { ProgressAlerts } from "@/features/challenges/progress-alerts";
import { CheckNow, OtherPost, PostQuestion } from "@/features/challenges/progress-panel";
import { type CardChannel, type CardPost, PromptCard } from "@/features/challenges/prompt-card";
import { PromptLabel, promptText } from "@/features/challenges/prompt-label";
import { ChallengeRules, countsOnNetwork, networksText } from "@/features/challenges/rules";
import { CommunityCard } from "@/features/community/community-card";
import { AutoRefresh } from "@/features/community/live";
import { AskFeedbackButton } from "@/features/feedback/ask-feedback-button";
import { NoChannelsNotice } from "@/features/settings/no-channels";
import { daysBetween, positionOn } from "@/lib/day-engine";
import { deletionPhrase } from "@/lib/deletion-words";
import { homeListingBlock } from "@/lib/home-listing";
import { deletionCountdown } from "@/server/account/retention";
import { requireUser } from "@/server/auth/current-user";
import { listChannels } from "@/server/buffer/channels";
import { backgroundBudget } from "@/server/buffer/rate-limits";
import { challengeForMember, type DayView } from "@/server/challenges/service";
import { getDb } from "@/server/db";
import { openFeedbackEntryIds } from "@/server/feedback/service";
import { matcherMode } from "@/server/progress/matcher";
import { countMatched, progressView } from "@/server/progress/view";

export const metadata: Metadata = { title: "Challenge" };

export default function ChallengePage({ params, searchParams }: PageProps<"/challenges/[slug]">) {
  return (
    <main
      id="main"
      className="flex w-full flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12 lg:px-8"
    >
      <Suspense fallback={<OverviewSkeleton />}>
        <Challenge params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Challenge({ params, searchParams }: PageProps<"/challenges/[slug]">) {
  const { slug } = await params;
  const user = await requireUser(`/challenges/${slug}`);
  const db = getDb();
  // The channels need only the user, so they load alongside the challenge.
  const [data, allChannels] = await Promise.all([
    challengeForMember(db, slug, user.id, new Date()),
    listChannels({ db }, user.id),
  ]);
  if (!data) notFound();
  if (!data.participant) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="font-semibold text-3xl tracking-tight">{data.challenge.title}</h1>
        <p className="text-muted-foreground">
          You are not in this challenge. Ask the host for the invite link to join.
        </p>
      </div>
    );
  }

  const { challenge, participant, days, dates, today, memberCount, timeZone } = data;
  const [progress, budget, askedEntryIds, matched] = await Promise.all([
    progressView(db, participant.id, timeZone),
    backgroundBudget(db, new Date()),
    openFeedbackEntryIds(db, participant.id),
    countMatched(db, participant.id),
  ]);
  const query = await searchParams;
  const usable = allChannels.filter((channel) => !channel.isDisconnected && !channel.isLocked);
  // The person's channels on the networks this challenge counts.
  const onNetwork = usable.filter((channel) =>
    countsOnNetwork(challenge.allowedServices, channel.service),
  );
  const cardChannels: CardChannel[] = usable
    .filter((channel) => participant.channelIds.includes(channel.bufferChannelId))
    .map((channel) => ({
      id: channel.bufferChannelId,
      name: channel.displayName || channel.name,
      service: channel.service,
    }));
  // A post can sit on a channel that no longer counts; name it from all the person's channels.
  const channelById = new Map(allChannels.map((channel) => [channel.bufferChannelId, channel]));
  const cardPosts = (day: DayView): CardPost[] =>
    day.posts.map((post) => {
      const channel = channelById.get(post.channelId);
      return {
        channelId: post.channelId,
        channelName: channel ? channel.displayName || channel.name : "a channel",
        service: channel?.service ?? "",
        status: post.status,
        externalLink: post.externalLink,
      };
    });

  const position = positionOn(today, dates);
  const card = (day: DayView, variant: "today" | "catch-up" | "ahead") => (
    <PromptCard
      key={day.entry.id}
      entryId={day.entry.id}
      dayNumber={day.prompt.dayIndex + 1}
      dateLabel={variant === "today" ? formatLongDay(day.date) : formatDay(day.date)}
      prompt={day.prompt}
      state={day.entry.state}
      posts={cardPosts(day)}
      scheduleHref={
        day.entry.state === "open" && cardChannels.length > 0
          ? `/challenges/${challenge.slug}/plan#day-${day.entry.id}`
          : undefined
      }
      savedAsIdea={Boolean(day.entry.bufferIdeaId) && day.posts.length === 0}
      channels={cardChannels}
      variant={variant}
      feedback={
        day.posts.length > 0 && (day.entry.state === "saved" || day.entry.state === "planned") ? (
          <AskFeedbackButton
            entryId={day.entry.id}
            asked={askedEntryIds.has(day.entry.id)}
            feedbackHref={`/challenges/${challenge.slug}/community?place=feedback`}
          />
        ) : null
      }
    />
  );

  const catchUp = days.filter(
    (day) =>
      daysBetween(day.date, today) > 0 &&
      (day.entry.state === "open" || day.entry.state === "missed"),
  );
  const upcoming = days.filter((day) => daysBetween(today, day.date) > 0).slice(0, 5);
  const done = days.filter(
    (day) => day.entry.state !== "open" && day.entry.state !== "missed",
  ).length;

  // Your state on each day, as the board shows it: a passed day without a post is waiting.
  const strip = days.map((day) => {
    const passed = daysBetween(day.date, today) > 0;
    const open = day.entry.state === "open" || day.entry.state === "missed";
    if (open && participant.pauseDates.includes(day.date)) return "paused" as const;
    return day.entry.state === "open" && passed ? ("missed" as const) : day.entry.state;
  });
  const todayState =
    position.kind === "prompt" ? (days[position.index]?.entry.state ?? null) : null;
  // If the host closed it now: the day it would be deleted, for the confirmation.
  const closeNowDeletes = deletionCountdown(
    { closedAt: new Date(), timeZone: challenge.timezone },
    new Date(),
    participant.timezone,
  );
  const deletion =
    challenge.status === "closed" && challenge.closedAt
      ? deletionCountdown(
          { closedAt: challenge.closedAt, timeZone: challenge.timezone },
          new Date(),
          participant.timezone,
        )
      : null;

  return (
    <>
      {challenge.status === "closed" ? (
        <Alert role="status" className="border-destructive/40 px-4 py-3">
          <HourglassIcon aria-hidden="true" className="text-destructive" />
          <AlertTitle>
            {deletion
              ? `This challenge is deleted ${deletionPhrase(deletion.days)}`
              : "This challenge is closed"}
          </AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-1">
            <p>
              It is closed, so checks have stopped and nobody new can join.
              {deletion
                ? ` On ${formatLongDay(deletion.date)}, Daydeck deletes it with its board, Community and recap. Your posts stay in Buffer.`
                : ""}
            </p>
            <Link
              href={`/recap/${challenge.slug}`}
              className="inline-flex min-h-11 items-center gap-1 font-medium text-foreground text-sm underline underline-offset-3 outline-none hover:no-underline focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-8"
            >
              Save your badge from the recap
              <ChevronRightIcon aria-hidden="true" className="size-4" />
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}
      {query.created === "1" && participant.role === "host" ? (
        <Alert role="status" className="px-4 py-3">
          <PartyPopperIcon aria-hidden="true" className="text-primary" />
          <AlertTitle>Your challenge is ready</AlertTitle>
          <AlertDescription>
            Your first prompt is below. To bring people in, choose Invite at the top right of this
            page and copy the link.
          </AlertDescription>
        </Alert>
      ) : null}
      {query.joined === "1" ? (
        <Alert role="status" className="px-4 py-3">
          <CircleCheckIcon aria-hidden="true" className="text-primary" />
          <AlertTitle>You joined {challenge.title}</AlertTitle>
          <AlertDescription>
            Your first prompt is below. Save it to Buffer and post when you are ready.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* The same chips and day strip as the card on "Your challenges". */}
      <header className="flex flex-col gap-3">
        <ChallengeChips
          source={{
            status: challenge.status,
            position,
            todayState,
            deletesInDays: deletion?.days ?? null,
          }}
          role={participant.role}
          memberCount={memberCount}
        />
        <h1 className="font-semibold text-3xl tracking-tight">{challenge.title}</h1>
        <DayStrip states={strip} saved={done} size="sm" />
      </header>

      {!budget.ok ? (
        <output className="block rounded-lg bg-muted p-3 text-sm">
          Automatic checks are paused for about{" "}
          {Math.max(1, Math.ceil((budget.retryAt.getTime() - Date.now()) / 60_000))} minutes while
          Buffer's request limit resets. "Check Buffer now" still works.
        </output>
      ) : null}
      <ProgressAlerts alerts={progress.alerts} />
      {usable.length === 0 ? (
        <NoChannelsNotice />
      ) : onNetwork.length === 0 ? (
        <section className="flex flex-col items-start gap-2 rounded-xl border border-primary/40 p-5">
          <h2 className="font-semibold">None of your channels counts here yet</h2>
          <p className="text-muted-foreground text-sm leading-6">
            This challenge counts posts on {networksText(challenge.allowedServices)} only. Add a
            channel on {challenge.allowedServices.length === 1 ? "that network" : "one of them"} in
            Buffer, then refresh your channels in Daydeck.
          </p>
          <Link
            href="/settings/channels"
            className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4")}
          >
            Open your channels
          </Link>
        </section>
      ) : cardChannels.length === 0 ? (
        <section className="rounded-xl border border-primary/40 p-5">
          <ChallengeChannels
            challengeId={challenge.id}
            channels={onNetwork.map((channel) => ({
              id: channel.bufferChannelId,
              name: channel.displayName || channel.name,
              service: channel.service,
              avatarUrl: channel.avatarUrl,
              counts: false,
            }))}
          />
        </section>
      ) : null}

      {/* From 1280px: the daily work on the left, status and settings in a narrow column. */}
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <div className="flex min-w-0 flex-col gap-10">
          {progress.suggestions.length > 0 ? (
            <section aria-labelledby="confirm-heading" className="flex flex-col gap-3">
              <SectionHeading
                id="confirm-heading"
                title={progress.suggestions.length === 1 ? "Check this post" : "Check these posts"}
                subtitle="You wrote these straight in Buffer, not from a Daydeck draft. AI compared each one with the prompts but is not sure which day it is for, so choose here."
              />
              <ul className="flex flex-col gap-3">
                {progress.suggestions.map((post) => (
                  <PostQuestion key={post.id} post={post} freeDays={progress.freeDays} />
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="today-heading" className="flex flex-col gap-4">
            <SectionHeading
              id="today-heading"
              title={
                position.kind === "prompt"
                  ? "Today"
                  : position.kind === "after"
                    ? "All done"
                    : "Next up"
              }
            />
            {position.kind === "prompt" && days[position.index]
              ? card(days[position.index] as DayView, "today")
              : null}
            {position.kind === "rest" ? (
              <>
                <p className="text-muted-foreground">
                  No prompt today. Day {position.nextIndex + 1} opens on{" "}
                  {formatLongDay(position.nextDate)}. You can get ahead and save it now.
                </p>
                {days[position.nextIndex]
                  ? card(days[position.nextIndex] as DayView, "ahead")
                  : null}
              </>
            ) : null}
            {position.kind === "before" ? (
              <>
                <p className="text-muted-foreground">
                  Day 1 opens on {formatLongDay(position.startsOn)}. You can save it to Buffer
                  already.
                </p>
                {days[0] ? card(days[0], "ahead") : null}
              </>
            ) : null}
            {position.kind === "after" ? (
              <p className="text-muted-foreground">
                The last prompt was on {formatLongDay(position.lastDate)}. You saved or posted{" "}
                {done} of {days.length} days.
              </p>
            ) : null}
          </section>

          {catchUp.length > 0 ? (
            <section aria-labelledby="past-heading" className="flex flex-col gap-4">
              <SectionHeading
                id="past-heading"
                title="Past days"
                subtitle="Days that went by without a post. There is no penalty: you can still post them whenever you like, and they count as caught up."
              />
              {catchUp.slice(0, 3).map((day) => card(day, "catch-up"))}
              {catchUp.length > 3 ? (
                <p className="text-muted-foreground text-sm">
                  and {catchUp.length - 3} more earlier days
                </p>
              ) : null}
            </section>
          ) : null}

          {upcoming.length > 0 ? (
            <section aria-labelledby="coming-heading" className="flex flex-col gap-3">
              <SectionHeading
                id="coming-heading"
                title="Coming up"
                subtitle="The prompts for your next days. Open one to read it in full, or give it a time on the Schedule page."
              />
              <ol className="flex flex-col divide-y rounded-xl border bg-card">
                {upcoming.map((day) => (
                  <li key={day.entry.id}>
                    {/* Closed, each day is one short row; open, it shows the whole prompt. */}
                    <details className="group">
                      <summary className="flex cursor-pointer list-none flex-col gap-1 rounded-xl p-3 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset sm:flex-row sm:items-center sm:gap-4 [&::-webkit-details-marker]:hidden">
                        <PromptLabel
                          dayNumber={day.prompt.dayIndex + 1}
                          detail={formatDay(day.date)}
                          className="sm:w-60 sm:shrink-0 sm:flex-nowrap sm:whitespace-nowrap"
                        />
                        <span className="min-w-0 flex-1 text-sm">{promptText(day.prompt)}</span>
                        {day.entry.state !== "open" ? (
                          <span className="flex shrink-0 items-center gap-1.5 text-sm">
                            <StateMark state={day.entry.state} size="sm" />
                            {BOARD_LABELS[day.entry.state]}
                          </span>
                        ) : null}
                        <ChevronRightIcon
                          aria-hidden="true"
                          className="hidden size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none sm:block"
                        />
                      </summary>
                      <div className="flex flex-col gap-3 px-3 pb-4 sm:pl-[16.5rem]">
                        {day.prompt.theme ? (
                          <span className="w-fit rounded-full bg-accent px-2 py-0.5 font-medium text-accent-foreground text-xs">
                            {day.prompt.theme}
                          </span>
                        ) : null}
                        {day.prompt.description ? (
                          <p className="text-muted-foreground text-sm leading-6">
                            {day.prompt.description}
                          </p>
                        ) : null}
                        {day.prompt.steps.length > 0 ? (
                          <ul className="list-disc pl-5 text-sm leading-6">
                            {day.prompt.steps.map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ul>
                        ) : null}
                        <div className="flex flex-col gap-1 rounded-md bg-muted px-3 py-2 text-sm">
                          <span className="text-muted-foreground text-xs">
                            Draft in Buffer starts with
                          </span>
                          <span className="whitespace-pre-line leading-6 wrap-anywhere">
                            {day.prompt.body.trim() || day.prompt.title.trim()}
                          </span>
                        </div>
                        {day.entry.state === "open" && cardChannels.length > 0 ? (
                          <Link
                            href={`/challenges/${challenge.slug}/plan#day-${day.entry.id}`}
                            className="w-fit text-primary text-sm underline underline-offset-3 hover:no-underline"
                          >
                            Give this day a time on the Schedule page
                          </Link>
                        ) : null}
                      </div>
                    </details>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {/* Keeps this page current while it is open: new days, checks and saves. */}
          <AutoRefresh slug={challenge.slug} watch={["board", "checked"]} />

          {progress.others.length > 0 ? (
            <section aria-labelledby="other-heading" className="flex flex-col gap-3">
              <SectionHeading
                id="other-heading"
                title="Other posts"
                subtitle="Posts on your challenge channels that AI could not match to any prompt. If one belongs to a day, give it that day."
              />
              <ul className="flex flex-col gap-3">
                {progress.others.map((post) => (
                  <OtherPost key={post.id} post={post} freeDays={progress.freeDays} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside aria-label="About this challenge" className="flex flex-col gap-4">
          {cardChannels.length > 0 ? (
            <div className="rounded-xl border bg-card p-4">
              <CheckNow
                slug={challenge.slug}
                lastChecked={
                  <LastChecked
                    at={progress.lastCheckedAt?.toISOString() ?? null}
                    renderedAt={new Date().toISOString()}
                  />
                }
              />
            </div>
          ) : null}
          {cardChannels.length > 0 ? (
            <AiMatchingCard mode={matcherMode()} matched={matched} />
          ) : null}

          <CommunityCard slug={challenge.slug} chatEnabled={challenge.chatEnabled} />

          <Link
            href={`/recap/${challenge.slug}`}
            className="flex flex-col gap-1 rounded-xl border bg-card p-4 outline-none transition-colors hover:border-foreground/30 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="flex items-center gap-2 font-semibold text-sm">
              <AwardIcon aria-hidden="true" className="size-4 text-primary" />
              Recap and your badge
            </span>
            <span className="text-muted-foreground text-xs leading-5">
              The whole challenge on one page, and a badge made from your days, to share.
            </span>
          </Link>

          {participant.role === "host" ? (
            <>
              <RecapVisibility slug={challenge.slug} isPublic={challenge.visibility === "public"} />
              <HomeListing
                slug={challenge.slug}
                on={challenge.showOnHome}
                blocked={homeListingBlock(challenge)}
              />
            </>
          ) : null}

          <section
            aria-labelledby="settings-heading"
            className="flex flex-col items-start gap-3 rounded-xl border bg-card p-4"
          >
            <h2 id="settings-heading" className="flex items-center gap-2 font-semibold text-sm">
              <SettingsIcon aria-hidden="true" className="size-4 text-primary" />
              Settings
            </h2>
            <ChallengeRules
              className="w-full border-b pb-4"
              rules={{
                startMode: challenge.startMode,
                startDate: challenge.startDate,
                cadence: challenge.cadence,
                timezone: challenge.timezone,
                visibility: challenge.visibility,
                allowedServices: challenge.allowedServices,
                chatEnabled: challenge.chatEnabled,
                showOnHome: challenge.showOnHome,
              }}
            />
            {participant.role === "host" ? (
              <Link
                href={`/challenges/${challenge.slug}/community`}
                className={cn(buttonVariants({ variant: "outline" }), "h-11 gap-2 px-3 md:h-9")}
              >
                <UsersIcon aria-hidden="true" />
                Manage members and chat
              </Link>
            ) : null}
            {cardChannels.length > 0 && onNetwork.length > 1 ? (
              <div className="w-full">
                <div>
                  <ChallengeChannels
                    challengeId={challenge.id}
                    channels={onNetwork.map((channel) => ({
                      id: channel.bufferChannelId,
                      name: channel.displayName || channel.name,
                      service: channel.service,
                      avatarUrl: channel.avatarUrl,
                      counts: participant.channelIds.includes(channel.bufferChannelId),
                    }))}
                  />
                </div>
              </div>
            ) : null}
            {challenge.status === "open" ? (
              participant.role === "host" ? (
                <>
                  {/* "Finished" is about your own days: say why the challenge itself is still open. */}
                  <p className="text-muted-foreground text-sm">
                    {challenge.startMode === "rolling"
                      ? "It stays open so new people can join and start their own Day 1."
                      : "It closes by itself after its last day."}{" "}
                    Closing it ends it for everyone, and Daydeck deletes it 30 days later.
                  </p>
                  <ConfirmAction
                    triggerLabel="Close this challenge"
                    title={`Close ${challenge.title}?`}
                    confirmLabel="Close the challenge"
                    pendingLabel="Closing…"
                    description={
                      <p>
                        Progress checks stop and nobody new can join, and you cannot open it again.
                        The board and the recap stay until {formatLongDay(closeNowDeletes.date)}.
                        Then Daydeck deletes the challenge with everything in it.
                      </p>
                    }
                    action={closeChallengeAction.bind(null, challenge.slug)}
                  />
                </>
              ) : (
                <ConfirmAction
                  triggerLabel="Leave this challenge"
                  title={`Leave ${challenge.title}?`}
                  confirmLabel="Leave the challenge"
                  pendingLabel="Leaving…"
                  description={
                    <p>
                      Your days in this challenge are deleted and you leave its board. Your messages
                      in Community stay, so conversations still make sense; delete any you want gone
                      first. Your posts and drafts in Buffer stay. You can join again with the
                      invite link.
                    </p>
                  }
                  action={leaveChallengeAction.bind(null, challenge.slug)}
                />
              )
            ) : (
              <p className="text-muted-foreground text-sm">
                {deletion
                  ? `This challenge is closed. Daydeck deletes it on ${formatLongDay(deletion.date)}.`
                  : "This challenge is closed."}
              </p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

/** A section title with an optional plain-words line under it. */
function SectionHeading({ id, title, subtitle }: { id: string; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 id={id} className="font-semibold text-xl">
        {title}
      </h2>
      {subtitle ? <p className="max-w-3xl text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}
