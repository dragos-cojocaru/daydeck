import { buttonVariants } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import {
  AwardIcon,
  BellIcon,
  LayoutGridIcon,
  type LucideIcon,
  MessagesSquareIcon,
} from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BufferLink } from "@/components/buffer-link";
import { PopularRow, PopularRowSkeleton } from "@/features/home/popular-challenges";
import { getDb } from "@/server/db";
import { homeChallengesOrNone } from "@/server/home/popular";

const STEPS = [
  {
    title: "Get a prompt",
    body: <>Each day has one: a short idea for what to post.</>,
  },
  {
    title: "Draft it in Buffer",
    body: (
      <>
        Turn it into a draft in{"\u00a0"}
        <BufferLink />, an app that schedules social media posts. Or plan your whole week at once.
      </>
    ),
  },
  {
    title: "See your progress",
    body: (
      <>
        Each day checks itself off when your post is published. Posted straight in Buffer? AI finds
        the day.
      </>
    ),
  },
];

// What makes it a group challenge, in the same plain words as the steps.
const TOGETHER: { title: string; body: string; Icon: LucideIcon }[] = [
  {
    title: "See everyone's days",
    body: "One board shows who posted on which day. It fills in as posts go live.",
    Icon: LayoutGridIcon,
  },
  {
    title: "Talk with your group",
    body: "Updates from the host, a group chat, shared posts and feedback on drafts. New messages show within a second.",
    Icon: MessagesSquareIcon,
  },
  {
    title: "Never miss what is new",
    body: "A bell counts what is new in all your challenges. Mute any part, or the sound.",
    Icon: BellIcon,
  },
  {
    title: "Finish with a recap",
    body: "One page with the whole challenge, and a badge for each person to share.",
    Icon: AwardIcon,
  },
];

export default function Home() {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-12 px-4 py-12 sm:px-6 sm:py-20"
    >
      {/* The hero: what Daydeck is in one sentence, then the actions. */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <h1 className="font-semibold text-4xl tracking-tight sm:text-5xl">
              One post a day, together.
            </h1>
            <p className="max-w-xl text-foreground/75 text-lg leading-7">
              A social media challenge for your team, community or class: everyone posts once a day,
              on their own accounts, for a set number of days.
            </p>
          </div>
          <HomeActions />
        </div>
      </div>

      <section aria-labelledby="steps-heading">
        <h2 id="steps-heading" className="sr-only">
          How a challenge works
        </h2>
        <ol className="grid gap-3 md:grid-cols-3 md:gap-4">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              // A flat grey panel with no border or shadow: content, not a button. The panels rise
              // in once, one after another; with reduced motion they are simply there.
              style={{ animationDelay: `${150 + index * 100}ms` }}
              className="flex flex-col gap-2 rounded-2xl bg-muted p-5 motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:animate-in motion-safe:fill-mode-both motion-safe:duration-500"
            >
              <div className="flex flex-col items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background font-semibold text-primary text-sm"
                >
                  {index + 1}
                </span>
                <h3 className="font-semibold leading-6">{step.title}</h3>
              </div>
              <p className="text-muted-foreground text-sm leading-6">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="together-heading" className="flex flex-col gap-5">
        <h2 id="together-heading" className="font-semibold text-2xl tracking-tight">
          Do it as a group
        </h2>
        <ul className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          {TOGETHER.map(({ title, body, Icon }) => (
            <li key={title} className="flex flex-col gap-2">
              <span
                aria-hidden="true"
                className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground"
              >
                <Icon className="size-4" />
              </span>
              <h3 className="font-semibold leading-6">{title}</h3>
              <p className="text-muted-foreground text-sm leading-6">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Last: active public challenges to look inside and join, the demo first during judging.
          The placeholder has the same size as the cards, so the footer barely moves. */}
      <section aria-labelledby="popular-heading" className="flex flex-col gap-5">
        <Suspense fallback={<PopularRowSkeleton />}>
          <PopularChallenges />
        </Suspense>
      </section>
    </main>
  );
}

/** The cards, read at request time: the static page shows the placeholder meanwhile. */
async function PopularChallenges() {
  await connection();
  const challenges = await homeChallengesOrNone(getDb(), new Date());
  return <PopularRow challenges={challenges} withHostCard />;
}

/**
 * The same actions for everyone, so the hero never changes after it loads. Visitors who choose
 * "Host a challenge" connect Buffer first: the proxy sends them to /connect and back.
 */
function HomeActions() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/challenges/new" className={cn(buttonVariants(), "h-11 px-5")}>
          Host a challenge
        </Link>
        <Link
          href="/how-it-works"
          className={cn(buttonVariants({ variant: "outline" }), "h-11 px-5")}
        >
          How Daydeck works
        </Link>
      </div>
      <p className="text-muted-foreground text-sm">
        Got an invite link? Open it to join that challenge.
      </p>
    </div>
  );
}
