import { and, asc, eq, isNotNull, schema } from "@daydeck/db";
import { Button } from "@daydeck/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@daydeck/ui/components/sheet";
import { Skeleton } from "@daydeck/ui/components/skeleton";
import { UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { userAgent } from "next/server";
import { Suspense } from "react";
import { CommunitySkeleton } from "@/components/skeletons";
import { MarkPlaceRead } from "@/features/community/mark-read";
import { MemberCardProvider } from "@/features/community/member-card";
import { ChannelView, type ShareableDay } from "@/features/community/messages";
import { PLACES } from "@/features/community/places";
import { CommunitySettings, MemberList, PlaceNav } from "@/features/community/side";
import { FeedbackSection } from "@/features/feedback/feedback-section";
import { requireUser } from "@/server/auth/current-user";
import { serviceForUrl } from "@/server/community/link-preview";
import { listBans, listMembers } from "@/server/community/moderation";
import {
  type Channel,
  firstUnreadId,
  listMessages,
  type Member,
  memberOf,
  type Place,
  writeRefusal,
} from "@/server/community/service";
import { getDb } from "@/server/db";

export const metadata: Metadata = { title: "Community" };

// The page fills the screen below the bars, so the messages scroll and the box to write in
// stays at the bottom, as in any chat app.
// The bottom border closes the pane, so the chat ends cleanly above the page footer.
const PANE = "h-[calc(100dvh-9.75rem)] min-h-[28rem] border-b md:h-[calc(100dvh-5.875rem)]";

export default function CommunityPage({
  params,
  searchParams,
}: PageProps<"/challenges/[slug]/community">) {
  return (
    <Suspense fallback={<CommunitySkeleton className={PANE} />}>
      <Community params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Community({ params, searchParams }: PageProps<"/challenges/[slug]/community">) {
  const { slug } = await params;
  const user = await requireUser(`/challenges/${slug}/community`);
  const db = getDb();
  const member = await memberOf(db, slug, user.id);
  if (!member) {
    return (
      <main id="main" className="flex flex-1 flex-col gap-3 px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="font-semibold text-3xl tracking-tight">Community</h1>
        <p className="text-muted-foreground">
          You are not in this challenge. Ask the host for the invite link to join.
        </p>
      </main>
    );
  }
  const query = await searchParams;
  // Next.js's own user-agent reader: phones and tablets get the touch way of writing.
  const { device } = userAgent({ headers: await headers() });
  const touch = device.type === "mobile" || device.type === "tablet";
  const asked = typeof query.place === "string" ? query.place : "updates";
  const allowed: Place[] = member.challenge.chatEnabled
    ? ["updates", "chat", "posts", "feedback"]
    : ["updates", "feedback"];
  const place = (allowed as string[]).includes(asked) ? (asked as Place) : "updates";
  const info = PLACES.find((item) => item.place === place);
  if (!info) notFound();

  const [members, bans, messages, shareDays, unreadFrom] = await Promise.all([
    listMembers(db, member),
    member.isHost ? listBans(db, member) : Promise.resolve([]),
    place === "feedback" ? Promise.resolve([]) : listMessages(db, member, place, new Date()),
    place === "posts" ? shareableDays(member) : Promise.resolve([]),
    // Read before the page marks the place as read, so the "New" line knows where to go.
    place === "feedback" ? Promise.resolve(null) : firstUnreadId(db, member, place),
  ]);

  const side = (
    <div className="flex flex-col gap-4">
      <MemberList members={members} isHost={member.isHost} />
      {member.isHost ? (
        <CommunitySettings slug={slug} chatEnabled={member.challenge.chatEnabled} bans={bans} />
      ) : null}
    </div>
  );

  return (
    <MemberCardProvider slug={slug} isHost={member.isHost}>
      <main id="main" className={`flex w-full flex-col md:flex-row ${PANE}`}>
        <h1 className="sr-only">Community</h1>
        <div className="border-b md:border-r md:border-b-0">
          <PlaceNav slug={slug} current={place} chatEnabled={member.challenge.chatEnabled} />
        </div>
        <section aria-labelledby="place-heading" className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b px-4 py-2.5">
            <info.Icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            <div className="flex min-w-0 flex-1 flex-col">
              <h2 id="place-heading" className="font-semibold leading-6">
                {info.label}
              </h2>
              <p className="truncate text-muted-foreground text-sm">{info.about}</p>
            </div>
            {/* Below 1280px the member list sits in a side sheet. */}
            <Sheet>
              <SheetTrigger
                render={
                  <Button variant="outline" className="h-11 shrink-0 gap-2 px-3 md:h-9 xl:hidden" />
                }
              >
                <UsersIcon aria-hidden="true" />
                {members.length}
                <span className="sr-only">members</span>
              </SheetTrigger>
              <SheetContent side="right" className="w-80 overflow-y-auto p-4">
                <SheetHeader className="p-0">
                  <SheetTitle>Members</SheetTitle>
                  <SheetDescription>Select a name to open their card.</SheetDescription>
                </SheetHeader>
                {side}
              </SheetContent>
            </Sheet>
          </header>
          {place === "feedback" ? (
            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-5">
              <p className="max-w-3xl text-muted-foreground leading-6">
                On the challenge page, any day with a draft in Buffer has "Ask the group for
                feedback". Replies show here and are saved as Notes on that draft in Buffer, so you
                see them while you edit.
              </p>
              <Suspense fallback={<Skeleton className="h-40 w-full" />}>
                <FeedbackSection
                  participantId={member.participant.id}
                  challengeId={member.challenge.id}
                  userId={user.id}
                  emptyText="No drafts are waiting for feedback right now."
                />
              </Suspense>
              <MarkPlaceRead slug={slug} place="feedback" />
            </div>
          ) : (
            <ChannelView
              key={place}
              slug={slug}
              channel={place}
              initial={{
                version: member.challenge.communityVersion,
                chatEnabled: member.challenge.chatEnabled,
                messages,
                firstUnreadId: unreadFrom,
              }}
              isHost={member.isHost}
              writeNote={writeNoteFor(member, place)}
              shareDays={shareDays}
              touch={touch}
            />
          )}
        </section>
        <aside
          aria-label="Members"
          className="hidden w-72 shrink-0 overflow-y-auto border-l p-3 xl:block"
        >
          {side}
        </aside>
      </main>
    </MemberCardProvider>
  );
}

function writeNoteFor(member: Member, channel: Channel): string | null {
  const refusal = writeRefusal(member, channel);
  if (channel === "updates" && refusal) {
    return "Only the host posts here. React to anything with the smiley button.";
  }
  return refusal;
}

/** Your days, for "For day" when you share a post, with the link of each published post. */
async function shareableDays(member: Member): Promise<ShareableDay[]> {
  const db = getDb();
  const { challengePrompts, entries, entryPosts } = schema;
  const [days, links] = await Promise.all([
    db
      .select({
        entryId: entries.id,
        dayIndex: challengePrompts.dayIndex,
        title: challengePrompts.title,
      })
      .from(entries)
      .innerJoin(challengePrompts, eq(challengePrompts.id, entries.challengePromptId))
      .where(eq(entries.participantId, member.participant.id))
      .orderBy(asc(challengePrompts.dayIndex)),
    db
      .select({ entryId: entryPosts.entryId, url: entryPosts.externalLink })
      .from(entryPosts)
      .innerJoin(entries, eq(entries.id, entryPosts.entryId))
      .where(
        and(eq(entries.participantId, member.participant.id), isNotNull(entryPosts.externalLink)),
      ),
  ]);
  const linkByEntry = new Map(links.map((row) => [row.entryId, row.url]));
  return days.map((day) => {
    const url = linkByEntry.get(day.entryId) ?? null;
    return {
      entryId: day.entryId,
      dayNumber: day.dayIndex + 1,
      title: day.title,
      url,
      service: url ? serviceForUrl(url) : null,
    };
  });
}
