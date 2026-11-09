import { buttonVariants } from "@daydeck/ui/components/button";
import { Skeleton } from "@daydeck/ui/components/skeleton";
import { cn } from "@daydeck/ui/lib/utils";
import {
  AwardIcon,
  CalendarCheckIcon,
  CalendarXIcon,
  ChevronRightIcon,
  KeyRoundIcon,
  type LucideIcon,
  MessagesSquareIcon,
  RadioTowerIcon,
  ServerIcon,
  ShieldCheckIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { cache, type ReactNode, Suspense } from "react";
import { DataChallengesSkeleton, DataSkeleton } from "@/components/skeletons";
import { UserAvatar } from "@/components/user-avatar";
import { DeleteMyData } from "@/features/account/delete-my-data";
import { DownloadMyData } from "@/features/account/download-my-data";
import { formatLongDay } from "@/features/challenges/format";
import { NetworkIcon } from "@/features/settings/network-icon";
import { serviceName } from "@/features/settings/services";
import { TopPageBar } from "@/features/shell/top-page-bar";
import { dataSummary } from "@/server/account/data";
import { type ChallengeData, dataOverview } from "@/server/account/overview";
import { deletionPhrase, RETENTION_DAYS } from "@/server/account/retention";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db";

export const metadata: Metadata = { title: "Your data" };

/** What Daydeck may do in Buffer, by OAuth scope, in plain words. */
const SCOPE_WORDS: Record<string, string> = {
  "account:read": "See your Buffer name, picture and channels",
  "posts:read": "Read your posts, to see which days you posted",
  "posts:write": "Save drafts for you. It never publishes them.",
  "ideas:write": "Save a prompt as an idea in Buffer",
  "notes:read": "Read the notes on your drafts",
  "notes:write": "Save your group's feedback as notes on your drafts",
  offline_access: "Stay connected, so you do not sign in again every hour",
};
const SHOWN_CHANNELS = 6;

/** One read for the whole page: the sections below share it within a request. */
const load = cache(async () => {
  const user = await requireUser("/settings/data");
  const db = getDb();
  const [summary, overview] = await Promise.all([
    dataSummary(db, user.id),
    dataOverview(db, user, new Date()),
  ]);
  return { user, summary, overview };
});

function dateIn(zone: string | null) {
  const options = { day: "numeric", month: "long", year: "numeric" } as const;
  try {
    return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: zone ?? "UTC" });
  } catch {
    return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" });
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function DataPage() {
  return (
    <>
      <TopPageBar label="Your data" />
      <main
        id="main"
        className="flex w-full flex-1 flex-col gap-12 px-4 py-10 sm:px-6 sm:py-12 lg:px-8"
      >
        <header className="flex flex-col gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <ShieldCheckIcon aria-hidden="true" className="size-5" />
          </span>
          <h1 className="font-semibold text-3xl tracking-tight">Your data</h1>
          <p className="max-w-3xl text-lg text-muted-foreground leading-relaxed">
            What Daydeck keeps about you, who can see it, when it is deleted, and how to take a copy
            or delete it all. The{" "}
            <Link href="/privacy" className="underline underline-offset-3 hover:text-foreground">
              privacy page
            </Link>{" "}
            explains each part.
          </p>
        </header>

        <section aria-labelledby="keeps-heading" className="flex flex-col gap-4">
          <SectionHeading
            id="keeps-heading"
            title="What Daydeck keeps"
            lead="Only what it needs to track your challenge days. Your posts themselves stay in Buffer."
          />
          <Suspense fallback={<DataSkeleton />}>
            <Keeps />
          </Suspense>
        </section>

        <section aria-labelledby="challenges-heading" className="flex flex-col gap-4">
          <SectionHeading
            id="challenges-heading"
            title="Your challenges"
            lead={`Each challenge you are in, and when Daydeck deletes it: everything in a challenge goes ${RETENTION_DAYS} days after it closes.`}
          />
          <Suspense fallback={<DataChallengesSkeleton />}>
            <Challenges />
          </Suspense>
        </section>

        <section aria-labelledby="who-heading" className="flex flex-col gap-4">
          <SectionHeading id="who-heading" title="Who sees what" />
          <ul className="grid gap-3 md:grid-cols-2">
            {WHO.map(({ Icon, title, text }) => (
              <li key={title} className="flex gap-3 rounded-xl border bg-card p-4">
                <Icon aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground" />
                <span className="flex flex-col gap-1">
                  <span className="font-medium leading-6">{title}</span>
                  <span className="text-muted-foreground text-sm leading-6">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="download-heading" className="flex flex-col gap-4">
          <SectionHeading id="download-heading" title="Download a copy" />
          <div className="flex flex-col items-start gap-4 rounded-xl border bg-card p-4 sm:p-5">
            <p className="max-w-3xl text-muted-foreground leading-relaxed">
              One file with everything Daydeck keeps about you: your account, channels, days, posts,
              messages and feedback. It is a JSON file, a plain text format that other apps can
              read. It leaves out other people's messages and names, and never includes your access
              keys.
            </p>
            <DownloadMyData />
          </div>
        </section>

        <section aria-labelledby="delete-heading" className="flex flex-col gap-4">
          <SectionHeading id="delete-heading" title="Delete everything" />
          {/* The same heading as every section; the red border marks the one action that destroys. */}
          <div className="flex flex-col items-start gap-4 rounded-xl border border-destructive/40 bg-card p-4 sm:p-5">
            <p className="max-w-3xl text-muted-foreground leading-relaxed">
              Disconnects Buffer and deletes everything above at once. You can also remove Daydeck
              in Buffer's own settings.
            </p>
            <Suspense fallback={<Skeleton className="h-11 w-72 max-w-full rounded-lg" />}>
              <DeleteButton />
            </Suspense>
          </div>
        </section>
      </main>
    </>
  );
}

const WHO: { Icon: LucideIcon; title: string; text: ReactNode }[] = [
  {
    Icon: UsersIcon,
    title: "People in your challenges",
    text: "Your Buffer name, your picture, which days you posted, and what you write in Community. People with a challenge's invite link see your name and picture in its list of who is in, unless the challenge is on Daydeck's homepage.",
  },
  {
    Icon: AwardIcon,
    title: "The recap page",
    text: "Your name and post links show there only if you turn that on, in each challenge. In a public challenge, anyone with the link can open the recap, and the host can list it on Daydeck's homepage while it is active.",
  },
  {
    Icon: ServerIcon,
    title: "The services that run Daydeck",
    text: (
      <>
        Hosting, the database and a few other services handle your data only to run Daydeck.{" "}
        <Link
          href={"/privacy#who-heading" as Route}
          className="underline underline-offset-3 hover:text-foreground"
        >
          The privacy page names each one
        </Link>
        .
      </>
    ),
  },
  {
    Icon: RadioTowerIcon,
    title: "Buffer",
    text: "Your posts and drafts stay in your Buffer account. Daydeck reads and saves them only with your permission.",
  },
];

function SectionHeading({ id, title, lead }: { id: string; title: string; lead?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 id={id} className="scroll-mt-20 font-semibold text-xl tracking-tight">
        {title}
      </h2>
      {lead ? <p className="max-w-3xl text-muted-foreground leading-relaxed">{lead}</p> : null}
    </div>
  );
}

/** A card in "What Daydeck keeps": an icon, a title and what is kept. */
function KeepCard({
  Icon,
  title,
  children,
}: {
  Icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <h3 className="flex items-center gap-2 font-medium leading-6">
        <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
        {title}
      </h3>
      {children}
    </li>
  );
}

/** Label and value rows. Numbers sit on the right, so they line up. */
function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="flex flex-col divide-y text-sm leading-6">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4 py-1.5">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-auto text-muted-foreground text-sm leading-6">{children}</p>;
}

async function Keeps() {
  const { user, summary, overview } = await load();
  const date = dateIn(user.timezone);
  const counting = overview.channels.filter((channel) => channel.counts).length;
  const extra = overview.channels.length - SHOWN_CHANNELS;
  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <KeepCard Icon={UserIcon} title="Your account">
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar name={user.name ?? "You"} src={user.avatarUrl} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium leading-6">{user.name ?? "Your name"}</span>
            <span className="text-muted-foreground text-sm leading-6">
              Connected on {date.format(overview.connectedAt)}
            </span>
          </span>
        </div>
        <Facts
          rows={[
            ["Time zone", (user.timezone ?? "Not set").replaceAll("_", " ")],
            ["Email address", "Not kept"],
          ]}
        />
        <Note>Your name and picture come from Buffer. To change them, change them there.</Note>
      </KeepCard>

      <KeepCard Icon={KeyRoundIcon} title="Your Buffer connection">
        <Facts
          rows={[
            ["Status", overview.needsReconnect ? "Connect again" : "Connected"],
            ["Access keys", "Encrypted, never shown"],
          ]}
        />
        {overview.scopes.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-sm leading-6">You let Daydeck:</p>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground text-sm leading-6">
              {overview.scopes.map((scope) => (
                <li key={scope}>{SCOPE_WORDS[scope] ?? scope}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </KeepCard>

      <KeepCard Icon={RadioTowerIcon} title="Your channels">
        {overview.channels.length === 0 ? (
          <p className="text-muted-foreground text-sm leading-6">
            None yet. Daydeck reads them from your Buffer when you choose which ones count.
          </p>
        ) : (
          <>
            <p className="text-muted-foreground text-sm leading-6">
              {plural(overview.channels.length, "channel", "channels")} from your Buffer.{" "}
              {counting === 0
                ? "None counts for your challenges yet."
                : `${counting} ${counting === 1 ? "counts" : "count"} for your challenges.`}
            </p>
            <ul className="flex flex-col gap-1.5 text-sm leading-6">
              {overview.channels.slice(0, SHOWN_CHANNELS).map((channel) => (
                <li key={channel.id} className="flex min-w-0 items-center gap-2">
                  <NetworkIcon service={channel.service} />
                  <span className="min-w-0 truncate">
                    {channel.name}
                    <span className="sr-only"> on {serviceName(channel.service)}</span>
                  </span>
                  {channel.counts ? (
                    <span className="ml-auto shrink-0 rounded-full bg-accent px-2 font-medium text-accent-foreground text-xs leading-5">
                      Counts
                    </span>
                  ) : channel.disconnected ? (
                    <span className="ml-auto shrink-0 text-muted-foreground text-xs leading-5">
                      Disconnected
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            {extra > 0 ? (
              <p className="text-muted-foreground text-sm leading-6">And {extra} more.</p>
            ) : null}
          </>
        )}
        <Link
          href="/settings/channels"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "mt-auto h-11 self-start px-3 md:h-9",
          )}
        >
          Choose channels
        </Link>
      </KeepCard>

      <KeepCard Icon={CalendarCheckIcon} title="Your days and posts">
        <Facts
          rows={[
            ["Days tracked", summary.daysTracked],
            ["Posts linked to a day", overview.postsLinked],
            ["Posts checked in your Buffer", overview.postsSeen],
          ]}
        />
        <Note>
          For each post, Daydeck keeps its Buffer ID, its link and its status, such as draft or
          sent. Not its text, except the first 100 characters while a post waits for you to give it
          a day.
        </Note>
      </KeepCard>

      <KeepCard Icon={MessagesSquareIcon} title="Community and feedback">
        <Facts
          rows={[
            ["Messages you wrote", summary.messagesWritten],
            ["Reactions", summary.reactions],
            ["Drafts you shared for feedback", overview.draftsShared],
            ["Feedback you wrote", summary.feedbackWritten],
          ]}
        />
        <Note>A draft you share keeps its text, so your group can read it.</Note>
      </KeepCard>
    </ul>
  );
}

async function Challenges() {
  const { overview } = await load();
  if (overview.challenges.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-4 sm:p-5">
        <p className="text-muted-foreground leading-relaxed">
          You are not in a challenge yet. When you host or join one, it shows here, with the date
          Daydeck deletes it.
        </p>
        <Link
          href="/challenges/new"
          className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4 md:h-9")}
        >
          Host a challenge
        </Link>
      </div>
    );
  }
  // The first ten in view; the rest one click away, so a long history keeps the page short.
  const shown = overview.challenges.slice(0, SHOWN_CHALLENGES);
  const rest = overview.challenges.slice(SHOWN_CHALLENGES);
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y rounded-xl border bg-card">
        {shown.map((challenge) => (
          <ChallengeRow key={challenge.slug} challenge={challenge} />
        ))}
      </ul>
      {rest.length > 0 ? (
        <details className="group flex flex-col">
          <summary className="inline-flex min-h-11 w-fit cursor-pointer items-center gap-1 rounded-md font-medium text-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-9">
            <ChevronRightIcon
              aria-hidden="true"
              className="size-4 transition-transform group-open:rotate-90"
            />
            {`Show all ${overview.challenges.length} challenges`}
          </summary>
          <ul className="mt-2 flex flex-col divide-y rounded-xl border bg-card">
            {rest.map((challenge) => (
              <ChallengeRow key={challenge.slug} challenge={challenge} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

const SHOWN_CHALLENGES = 10;

const PLACE_NAMES: Record<string, string> = {
  updates: "Updates",
  chat: "Chat",
  posts: "Posts",
  feedback: "Feedback",
};

/** "on", "muted", or "muted for Chat and Posts": what this challenge notifies you about. */
function notificationsText(muted: string[]): string {
  if (muted.includes("all")) return "muted";
  const places = muted.flatMap((place) => (PLACE_NAMES[place] ? [PLACE_NAMES[place]] : []));
  if (places.length === 0) return "on";
  const list =
    places.length === 1 ? places[0] : `${places.slice(0, -1).join(", ")} and ${places.at(-1)}`;
  return `muted for ${list}`;
}

function ChallengeRow({ challenge }: { challenge: ChallengeData }) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={`/challenges/${challenge.slug}` as Route}
            className="inline-flex min-h-11 min-w-0 items-center rounded-sm font-medium leading-6 underline-offset-3 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-8"
          >
            <span className="truncate">{challenge.title}</span>
          </Link>
          <span className="rounded-full bg-accent px-2 font-medium text-accent-foreground text-xs leading-5">
            {challenge.role === "host" ? "Host" : "Participant"}
          </span>
          {challenge.open ? null : (
            <span className="rounded-full bg-muted px-2 font-medium text-muted-foreground text-xs leading-5">
              Closed
            </span>
          )}
        </span>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-sm leading-6">
          <li>{plural(challenge.days, "day tracked", "days tracked")}</li>
          <li>
            Board and recap:{" "}
            {challenge.visibility !== "public"
              ? "people in it"
              : challenge.onHome
                ? "anyone with the link, and on Daydeck's homepage"
                : "anyone with the link"}
          </li>
          <li>Your name on the recap: {challenge.onRecap ? "on" : "off"}</li>
          <li>Notifications: {notificationsText(challenge.muted)}</li>
        </ul>
      </div>
      <p className="flex shrink-0 items-center gap-1.5 text-sm leading-6 sm:min-h-8">
        <CalendarXIcon aria-hidden="true" className="size-4 text-muted-foreground" />
        {challenge.deletion
          ? `Deleted on ${formatLongDay(challenge.deletion.date)} (${deletionPhrase(challenge.deletion.days)})`
          : `Deleted ${RETENTION_DAYS} days after it closes`}
      </p>
    </li>
  );
}

async function DeleteButton() {
  const { summary } = await load();
  return <DeleteMyData summary={summary} />;
}
