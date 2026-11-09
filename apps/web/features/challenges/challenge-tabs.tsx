"use client";

import { cn } from "@daydeck/ui/lib/utils";
import type { Route } from "next";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { LinkIcon } from "@/components/link-icon";
import { UnreadBadge, unreadTotal, useLive } from "@/features/community/live";
import { CHALLENGE_PAGES } from "@/features/shell/crumb-menus";

/**
 * A challenge's pages as tabs under the top bar, the way GitHub and Notion show a page's own
 * views: Overview, Board, Schedule, Community and Recap, always in reach.
 */
export function ChallengeTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const unread = unreadTotal(useLive().data[slug]);
  return (
    <nav
      aria-label="Challenge pages"
      className="flex gap-1 overflow-x-auto border-b px-2 sm:px-4 lg:px-6"
    >
      {CHALLENGE_PAGES.map(({ href: hrefFor, label, Icon }) => {
        const href = hrefFor(slug);
        const current = pathname === href;
        return (
          <Link
            key={label}
            href={href as Route}
            aria-current={current ? "page" : undefined}
            className={cn(
              "relative inline-flex h-11 shrink-0 items-center gap-2 rounded-t-md px-3 text-muted-foreground text-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
              // The current tab is underlined in the primary colour and has heavier text.
              current &&
                "font-medium text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary",
            )}
          >
            <LinkIcon>
              <Icon aria-hidden="true" className="size-4" />
            </LinkIcon>
            {label}
            {label === "Community" ? <UnreadBadge count={unread} /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** The tabs for the challenge in the address, so they never wait for the page's data. */
export function ChallengeTabsFromUrl() {
  const { slug } = useParams<{ slug: string }>();
  return slug ? <ChallengeTabs slug={slug} /> : null;
}
