import { Skeleton } from "@daydeck/ui/components/skeleton";
import { Suspense } from "react";
import { ChallengeBar } from "@/features/challenges/challenge-bar";
import { ChallengeTabsFromUrl } from "@/features/challenges/challenge-tabs";
import { NotificationsButton } from "@/features/notifications/notifications-button";
import { CHALLENGE_PAGES } from "@/features/shell/challenge-pages";
import { TOP_BAR_CLASS } from "@/features/shell/top-bar-styles";
import { getCurrentSession } from "@/server/auth/current-user";
import { navChallenges } from "@/server/challenges/nav";
import { challengeHeader } from "@/server/challenges/service";
import { getDb } from "@/server/db";

// Every page of one challenge starts with the breadcrumb bar: its title, the page you are on,
// and Invite for the host. The bar loads on its own, so the page below never waits for it.
export default function ChallengeLayout({ children, params }: LayoutProps<"/challenges/[slug]">) {
  return (
    <>
      <Suspense fallback={<BarSkeleton />}>
        <Bar params={params} />
      </Suspense>
      {/* The tabs need only the address, so they show without waiting for the bar's data. */}
      <Suspense fallback={<TabsPlaceholder />}>
        <ChallengeTabsFromUrl />
      </Suspense>
      {children}
    </>
  );
}

async function Bar({ params }: Pick<LayoutProps<"/challenges/[slug]">, "params">) {
  const { slug } = await params;
  const session = await getCurrentSession();
  // Without a session the page itself sends the person to connect Buffer.
  if (!session) return null;
  const db = getDb();
  const [header, challenges] = await Promise.all([
    challengeHeader(db, slug, session.user.id),
    navChallenges(session.user.id),
  ]);
  if (!header) return null;
  return (
    <ChallengeBar
      slug={header.slug}
      title={header.title}
      inviteCode={header.inviteCode}
      invitePaused={header.invitePaused}
      challenges={challenges}
    />
  );
}

/** The bar's own size and spacing, with a grey line where the crumbs will be. */
function BarSkeleton() {
  return (
    <div className={TOP_BAR_CLASS}>
      <Skeleton className="ml-2 h-4 w-48" />
      <NotificationsButton className="ml-auto hidden md:block" />
    </div>
  );
}

/** The same tab names, not yet links, in case the address is not known yet. */
function TabsPlaceholder() {
  return (
    <div aria-hidden="true" className="flex gap-1 overflow-x-hidden border-b px-2 sm:px-4 lg:px-6">
      {CHALLENGE_PAGES.map(({ label, Icon }) => (
        <span
          key={label}
          className="inline-flex h-11 shrink-0 items-center gap-2 px-3 text-muted-foreground text-sm"
        >
          <Icon className="size-4" />
          {label}
        </span>
      ))}
    </div>
  );
}
