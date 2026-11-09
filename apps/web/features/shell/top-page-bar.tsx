import { Suspense } from "react";
import { NotificationsButton } from "@/features/notifications/notifications-button";
import { getCurrentSessionOrNull } from "@/server/auth/current-user";
import { type NavChallenge, navChallenges } from "@/server/challenges/nav";
import { CrumbSeparator, EndCrumb, HoverCrumb, TopPagesItems } from "./crumb-menus";
import { TOP_BAR_CLASS } from "./top-bar-styles";

/**
 * The top bar of one of the app's own pages, such as "Your data" or "Your challenges / Host a
 * challenge". It is part of the page's first paint, so nothing moves; only the menus' list of
 * your challenges fills in a moment later.
 */
export function TopPageBar({ label, underChallenges = false }: TopPageBarProps) {
  return (
    <Suspense fallback={<Bar label={label} underChallenges={underChallenges} challenges={[]} />}>
      <BarWithData label={label} underChallenges={underChallenges} />
    </Suspense>
  );
}

interface TopPageBarProps {
  label: string;
  /** Shows "Your challenges" before the page, as on "Host a challenge". */
  underChallenges?: boolean;
}

async function BarWithData(props: TopPageBarProps) {
  const session = await getCurrentSessionOrNull();
  return <Bar {...props} challenges={session ? await navChallenges(session.user.id) : []} />;
}

function Bar({
  label,
  underChallenges,
  challenges,
}: TopPageBarProps & { challenges: NavChallenge[] }) {
  return (
    <div className={TOP_BAR_CLASS}>
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-0.5">
          {underChallenges ? (
            <>
              <li className="flex shrink-0">
                <HoverCrumb href="/challenges" label="Your challenges">
                  <TopPagesItems challenges={challenges} />
                </HoverCrumb>
              </li>
              <CrumbSeparator />
              <li className="flex min-w-0">
                <EndCrumb label={label} />
              </li>
            </>
          ) : (
            <li className="flex min-w-0">
              <EndCrumb label={label}>
                <TopPagesItems challenges={challenges} />
              </EndCrumb>
            </li>
          )}
        </ol>
      </nav>
      {/* Phones have the bell in the header above, next to the menu button. */}
      <NotificationsButton className="hidden md:block" />
    </div>
  );
}
