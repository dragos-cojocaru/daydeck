"use client";

import {
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@daydeck/ui/components/sidebar";
import {
  AwardIcon,
  CalendarRangeIcon,
  EllipsisIcon,
  LayoutListIcon,
  MessagesSquareIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { notifiedTotal, useLive } from "@/features/community/live";
import type { NavChallenge } from "@/server/challenges/nav";
import { ChallengeNavGroup, NavSubItem } from "./nav-link";

/** How many challenges the sidebar lists before "All challenges" takes over. */
const SIDEBAR_LIMIT = 7;

/**
 * The challenges in the sidebar, kept short however many you are in: only running and upcoming
 * ones, plus those finished in the last three days, at most seven, then "All challenges". The
 * challenge you are on always shows, even when it is finished or past the seventh.
 */
export function ChallengeNavList({ challenges }: { challenges: NavChallenge[] }) {
  const pathname = usePathname();
  const live = useLive().data;
  const currentSlug = /^\/(?:challenges|recap)\/([^/]+)/.exec(pathname)?.[1];
  const shown = challenges.filter((challenge) => challenge.inSidebar).slice(0, SIDEBAR_LIMIT);
  const current = challenges.find((challenge) => challenge.slug === currentSlug);
  if (current && !shown.includes(current)) shown.push(current);
  const more = challenges.length > shown.length;

  return (
    <SidebarMenuSub aria-label="Challenges you are in" className="mr-0 pr-0">
      {shown.map((challenge) => (
        <SidebarMenuSubItem key={challenge.slug}>
          <ChallengeNavGroup
            slug={challenge.slug}
            title={challenge.title}
            meta={challenge.inSidebar ? challenge.meta : undefined}
            unread={notifiedTotal(live[challenge.slug])}
          >
            {/* Shallower than shadcn's default, so the page names fit a phone. */}
            <SidebarMenuSub className="mr-0 ml-2.5 pr-0 pl-2">
              <SidebarMenuSubItem>
                <NavSubItem
                  href={`/challenges/${challenge.slug}/board`}
                  icon={<LayoutListIcon aria-hidden="true" />}
                >
                  Board
                </NavSubItem>
              </SidebarMenuSubItem>
              <SidebarMenuSubItem>
                <NavSubItem
                  href={`/challenges/${challenge.slug}/plan`}
                  icon={<CalendarRangeIcon aria-hidden="true" />}
                >
                  Schedule
                </NavSubItem>
              </SidebarMenuSubItem>
              <SidebarMenuSubItem>
                <NavSubItem
                  href={`/challenges/${challenge.slug}/community`}
                  icon={<MessagesSquareIcon aria-hidden="true" />}
                  badge={notifiedTotal(live[challenge.slug])}
                >
                  Community
                </NavSubItem>
              </SidebarMenuSubItem>
              <SidebarMenuSubItem>
                <NavSubItem
                  href={`/recap/${challenge.slug}`}
                  icon={<AwardIcon aria-hidden="true" />}
                >
                  Recap
                </NavSubItem>
              </SidebarMenuSubItem>
            </SidebarMenuSub>
          </ChallengeNavGroup>
        </SidebarMenuSubItem>
      ))}
      {more ? (
        <SidebarMenuSubItem>
          <SidebarMenuSubButton
            className="text-muted-foreground"
            render={<Link href="/challenges" />}
          >
            <EllipsisIcon aria-hidden="true" />
            <span>All challenges ({challenges.length})</span>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      ) : null}
    </SidebarMenuSub>
  );
}
