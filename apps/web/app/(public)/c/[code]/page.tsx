import { and, eq, schema } from "@daydeck/db";
import { buttonVariants } from "@daydeck/ui/components/button";
import { Skeleton } from "@daydeck/ui/components/skeleton";
import { cn } from "@daydeck/ui/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { UserAvatar } from "@/components/user-avatar";
import { formatDay } from "@/features/challenges/format";
import { JoinForm } from "@/features/challenges/join-form";
import { countsOnNetwork, networksText } from "@/features/challenges/rules";
import { NoChannelsNotice } from "@/features/settings/no-channels";
import { serviceName } from "@/features/settings/services";
import { firstPromptDay, localDateOf } from "@/lib/day-engine";
import { getCurrentSessionOrNull } from "@/server/auth/current-user";
import { listChannels } from "@/server/buffer/channels";
import { cachedInvitePreview, peopleStamp } from "@/server/challenges/cached";
import { getChallengeByInvite } from "@/server/challenges/service";
import { isBanned } from "@/server/community/moderation";
import { getDb } from "@/server/db";

export const metadata: Metadata = { title: "Join a challenge", robots: { index: false } };

export default function InvitePage({ params }: PageProps<"/c/[code]">) {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10 sm:py-12"
    >
      <Suspense
        fallback={
          <div className="flex flex-col gap-4" aria-busy="true">
            <span className="sr-only">Loading the invite</span>
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-11 w-40" />
          </div>
        }
      >
        <Invite params={params} />
      </Suspense>
    </main>
  );
}

async function Invite({ params }: Pick<PageProps<"/c/[code]">, "params">) {
  const { code } = await params;
  const db = getDb();
  const challenge = await getChallengeByInvite(db, code);
  if (!challenge) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="font-semibold text-3xl tracking-tight">This invite link does not work</h1>
        <p className="text-muted-foreground">
          It may be mistyped or the challenge may have been removed. Ask the host for a new link.
        </p>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "h-11 w-fit px-4")}>
          Go to the start page
        </Link>
      </div>
    );
  }

  const [cached, session] = await Promise.all([
    // The board version changes when someone shows or hides their name, so the key does too.
    peopleStamp(db, challenge.id).then((stamp) =>
      cachedInvitePreview(challenge.id, `${stamp}:${challenge.boardVersion}`),
    ),
    getCurrentSessionOrNull(),
  ]);
  const preview = cached ?? { host: { name: null, avatarUrl: null }, prompts: [], members: [] };
  const hostName = preview.host.name ?? "A Daydeck host";
  const days = preview.prompts.length;
  const opensOn =
    challenge.startMode === "fixed" ? firstPromptDay(challenge.startDate, challenge.cadence) : null;
  // A shared start already behind us: someone joining now begins with today's prompt.
  const started = opensOn !== null && opensOn <= localDateOf(new Date(), challenge.timezone);
  // Listed on the homepage, this page is public: it names only people who chose to be named.
  const listed = challenge.showOnHome;
  const named = listed ? preview.members.filter((member) => member.shown) : preview.members;
  const unnamed = preview.members.length - named.length;

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <UserAvatar name={hostName} src={preview.host.avatarUrl} />
          <p className="text-muted-foreground">{hostName} invites you to</p>
        </div>
        <h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">{challenge.title}</h1>
        <p className="text-lg">
          {days} {days === 1 ? "day" : "days"} of posting,{" "}
          {challenge.cadence === "daily" ? "one every day" : "one each weekday"}. Each day comes
          with a prompt: a short idea for what to post.{" "}
          {opensOn
            ? started
              ? `It started on ${formatDay(opensOn)}. Join now to start with today's prompt; you can still post earlier days to catch up.`
              : `Everyone starts on ${formatDay(opensOn)}.`
            : "Your day 1 is the day you join."}
          {challenge.allowedServices.length > 0
            ? ` Posts on ${networksText(challenge.allowedServices)} count.`
            : null}
        </p>
      </div>

      <section aria-labelledby="first-prompts" className="flex flex-col gap-3">
        <h2 id="first-prompts" className="font-medium">
          The first prompts
        </h2>
        <ol className="flex flex-col gap-2">
          {preview.prompts.slice(0, 3).map((prompt, index) => (
            <li
              key={`${index}-${prompt.title}`}
              className="flex gap-3 rounded-xl border bg-card p-3"
            >
              <span className="w-12 shrink-0 text-muted-foreground text-sm">Day {index + 1}</span>
              <span>{`${prompt.emoji} ${prompt.title}`.trim()}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="whos-in" className="flex flex-col gap-3">
        <h2 id="whos-in" className="font-medium">
          {preview.members.length === 1
            ? "1 person is in"
            : `${preview.members.length} people are in`}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {named.slice(0, 12).map((member, index) => (
            <li
              key={`${index}-${member.name}`}
              className="flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm"
            >
              <UserAvatar name={member.name ?? "?"} src={member.avatarUrl} size="sm" />
              {member.name ?? "Someone"}
            </li>
          ))}
        </ul>
        {unnamed > 0 ? (
          <p className="text-muted-foreground text-sm">
            {unnamed === 1 ? "1 more person keeps" : `${unnamed} more people keep`} their name
            private on this public page.
          </p>
        ) : null}
      </section>

      <JoinSection
        code={code}
        session={session}
        challengeId={challenge.id}
        slug={challenge.slug}
        open={challenge.status === "open"}
        allowedServices={challenge.allowedServices}
        paused={challenge.invitePaused}
        listed={listed}
      />
    </>
  );
}

async function JoinSection({
  code,
  session,
  challengeId,
  slug,
  open,
  allowedServices,
  paused,
  listed,
}: {
  code: string;
  session: Awaited<ReturnType<typeof getCurrentSessionOrNull>>;
  challengeId: string;
  slug: string;
  open: boolean;
  allowedServices: string[];
  paused: boolean;
  listed: boolean;
}) {
  if (!open) {
    return (
      <p className="rounded-lg bg-muted p-4">
        This challenge has finished and is closed for joining.
      </p>
    );
  }
  if (paused) {
    return (
      <p className="rounded-lg bg-muted p-4">
        The host has paused joining for now. Ask them when it opens again.
      </p>
    );
  }
  if (!session) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border p-5">
        <h2 className="font-semibold text-lg">Connect Buffer to join</h2>
        <p className="text-muted-foreground">
          Daydeck puts each prompt into your Buffer as a draft and checks off the days you post. You
          approve access on Buffer's own site.
        </p>
        <a
          href={`/api/auth/buffer/start?next=${encodeURIComponent(`/c/${code}`)}`}
          className={cn(buttonVariants(), "h-11 w-full px-5 sm:w-fit")}
        >
          Connect Buffer and join
        </a>
      </div>
    );
  }

  const db = getDb();
  const { participants } = schema;
  const [membership] = await db
    .select({ status: participants.status })
    .from(participants)
    .where(
      and(eq(participants.challengeId, challengeId), eq(participants.userId, session.user.id)),
    );
  if (await isBanned(db, challengeId, session.user.bufferAccountId)) {
    return <p className="rounded-lg bg-muted p-4">You cannot join this challenge.</p>;
  }
  if (membership?.status === "active") {
    return (
      <div className="flex flex-col gap-3 rounded-xl border p-5">
        <h2 className="font-semibold text-lg">You are in this challenge</h2>
        <Link href={`/challenges/${slug}`} className={cn(buttonVariants(), "h-11 w-fit px-5")}>
          Open today's prompt
        </Link>
      </div>
    );
  }

  const usable = (await listChannels({ db }, session.user.id)).filter(
    (channel) => !channel.isDisconnected && !channel.isLocked,
  );
  if (usable.length === 0) return <NoChannelsNotice />;
  // Only channels on the networks this challenge counts can be picked.
  const channels = usable.filter((channel) => countsOnNetwork(allowedServices, channel.service));
  if (channels.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border p-5">
        <h2 className="font-semibold text-lg">None of your channels counts here</h2>
        <p className="text-muted-foreground">
          This challenge counts posts on {networksText(allowedServices)} only. Add a channel on{" "}
          {allowedServices.length === 1 ? "that network" : "one of them"} in Buffer, then refresh
          your channels in Daydeck and open this link again.
        </p>
        <Link
          href="/settings/channels"
          className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4")}
        >
          Open your channels
        </Link>
      </div>
    );
  }

  return (
    <JoinForm
      code={code}
      listed={listed}
      channels={channels.map((channel) => ({
        id: channel.bufferChannelId,
        name: channel.displayName || channel.name,
        service: serviceName(channel.service),
        avatarUrl: channel.avatarUrl,
        selected: channel.selected,
      }))}
    />
  );
}
