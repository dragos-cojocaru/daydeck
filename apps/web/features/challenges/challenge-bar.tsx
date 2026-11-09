"use client";

import { Button } from "@daydeck/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@daydeck/ui/components/popover";
import { UserPlusIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { NotificationsButton } from "@/features/notifications/notifications-button";
import {
  CHALLENGE_PAGES,
  ChallengePagesItems,
  ChallengesItems,
  CrumbSeparator,
  EndCrumb,
  HoverCrumb,
  TopPagesItems,
} from "@/features/shell/crumb-menus";
import { TOP_BAR_CLASS } from "@/features/shell/top-bar-styles";
import type { NavChallenge } from "@/server/challenges/nav";
import { InviteLink } from "./invite-link";

/**
 * The bar above a challenge's pages, like Notion's: "Your challenges / <challenge> / <page>".
 * Crumbs before the last are links whose menus open on hover; the last has a down arrow when it
 * has sibling pages. Invite sits at the far right.
 */
export function ChallengeBar({
  slug,
  title,
  inviteCode,
  invitePaused = false,
  challenges,
}: {
  slug: string;
  title: string;
  challenges: NavChallenge[];
  /** Only the host of an open challenge gets it, so only they see Invite. */
  inviteCode: string | null;
  invitePaused?: boolean;
}) {
  const pathname = usePathname();
  const base = `/challenges/${slug}`;
  // The page under the challenge, when it is not the overview: Board, Schedule or Recap.
  const page = CHALLENGE_PAGES.slice(1).find((item) => pathname === item.href(slug));

  return (
    <div className={TOP_BAR_CLASS}>
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-0.5">
          {/* Phones skip the first crumb: three do not fit, and the sidebar is one tap away. */}
          <li className="hidden shrink-0 sm:flex">
            <HoverCrumb href="/challenges" label="Your challenges">
              <TopPagesItems challenges={challenges} />
            </HoverCrumb>
          </li>
          <CrumbSeparator className="hidden sm:block" />
          <li className="flex min-w-0">
            {page ? (
              <HoverCrumb href={base} label={title}>
                <ChallengesItems challenges={challenges} />
              </HoverCrumb>
            ) : (
              <EndCrumb label={title}>
                {challenges.length > 1 ? <ChallengesItems challenges={challenges} /> : null}
              </EndCrumb>
            )}
          </li>
          {page ? (
            <>
              <CrumbSeparator />
              <li className="flex shrink-0">
                <EndCrumb label={page.label}>
                  <ChallengePagesItems slug={slug} />
                </EndCrumb>
              </li>
            </>
          ) : null}
        </ol>
      </nav>
      {inviteCode ? (
        <Popover>
          <PopoverTrigger
            render={
              <Button variant="ghost" className="h-11 shrink-0 gap-1.5 px-3 md:h-8 md:px-2.5" />
            }
          >
            <UserPlusIcon aria-hidden="true" />
            {/* On the narrowest phones only the icon shows, so the challenge's name has room. */}
            <span className="max-[380px]:sr-only">Invite</span>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[28rem]">
            <PopoverHeader>
              <PopoverTitle>Invite people</PopoverTitle>
              <PopoverDescription>Anyone with this link can join {title}.</PopoverDescription>
            </PopoverHeader>
            <InviteLink slug={slug} inviteCode={inviteCode} paused={invitePaused} />
          </PopoverContent>
        </Popover>
      ) : null}
      <NotificationsButton className="hidden md:block" />
    </div>
  );
}
