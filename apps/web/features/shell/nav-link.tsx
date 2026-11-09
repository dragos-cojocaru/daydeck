"use client";

import {
  SidebarMenuButton,
  SidebarMenuSubButton,
  useSidebar,
} from "@daydeck/ui/components/sidebar";
import { cn } from "@daydeck/ui/lib/utils";
import { ChevronRightIcon, FlameIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useId, useState } from "react";
import { LinkIcon } from "@/components/link-icon";
import { UnreadBadge } from "@/features/community/live";

function isWithin(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function useLinkState(href: string, exact: boolean) {
  const pathname = usePathname();
  const current = exact ? pathname === href : isWithin(pathname, href);
  return { current, within: !current && isWithin(pathname, href) };
}

/**
 * A top-level sidebar row. The page you are on gets aria-current, a fill and heavier text,
 * so colour is never the only signal. In the collapsed rail the label shows as a tooltip.
 */
export function NavItem({
  href,
  icon,
  label,
  exact = false,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  /** Mark as current only on this exact path, not on pages below it. */
  exact?: boolean;
}) {
  const { current } = useLinkState(href, exact);
  return (
    <SidebarMenuButton
      isActive={current}
      tooltip={label}
      render={<Link href={href as Route} aria-current={current ? "page" : undefined} />}
    >
      <LinkIcon>{icon}</LinkIcon>
      <span>{label}</span>
    </SidebarMenuButton>
  );
}

/** A nested row, such as one challenge. A row whose sub-page is open gets heavier text. */
export function NavSubItem({
  href,
  icon,
  children,
  exact = false,
  badge = 0,
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
  exact?: boolean;
  /** Unread items, shown as a count at the end of the row. */
  badge?: number;
}) {
  const { current, within } = useLinkState(href, exact);
  return (
    <SidebarMenuSubButton
      isActive={current}
      className={cn((current || within) && "font-medium")}
      render={<Link href={href as Route} aria-current={current ? "page" : undefined} />}
    >
      <LinkIcon>{icon}</LinkIcon>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <UnreadBadge count={badge} />
    </SidebarMenuSubButton>
  );
}

/**
 * One challenge in the sidebar, like a Notion page: its icon turns into an arrow only while the
 * row is hovered or reached with the keyboard (always in the phone sheet, which has no hover).
 * The arrow opens or closes the challenge's pages.
 * It opens on its own while one of its pages is showing.
 */
export function ChallengeNavGroup({
  slug,
  title,
  meta,
  unread = 0,
  children,
}: {
  slug: string;
  title: string;
  /** Unread messages and feedback in the challenge's community. */
  unread?: number;
  /** Days left, short for the eye ("3d left") and spoken in full ("3 days left"). */
  meta?: { short: string; long: string };
  children: ReactNode;
}) {
  const href = `/challenges/${slug}`;
  const { current, within } = useLinkState(href, true);
  // The recap has its own address, but it is one of this challenge's pages too.
  const onRecap = usePathname() === `/recap/${slug}`;
  const inside = current || within || onRecap;
  const [open, setOpen] = useState(inside);
  const listId = useId();
  useEffect(() => {
    if (inside) setOpen(true);
  }, [inside]);

  return (
    <>
      <div className="group/challenge relative">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={`${open ? "Hide" : "Show"} the pages of ${title}`}
          onClick={() => setOpen((value) => !value)}
          className="absolute top-1/2 left-1 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-sidebar-foreground outline-none hover:bg-sidebar-foreground/10 focus-visible:ring-2 focus-visible:ring-sidebar-ring in-data-[mobile=true]:size-9"
        >
          <FlameIcon
            aria-hidden="true"
            className="size-4 group-hover/challenge:hidden group-has-[:focus-visible]/challenge:hidden in-data-[mobile=true]:hidden"
          />
          <ChevronRightIcon
            aria-hidden="true"
            className={cn(
              "hidden size-4 transition-transform duration-150 group-hover/challenge:block group-has-[:focus-visible]/challenge:block in-data-[mobile=true]:block motion-reduce:transition-none",
              open && "rotate-90",
            )}
          />
        </button>
        <SidebarMenuSubButton
          isActive={current}
          // The row keeps its hover fill while the pointer is on the arrow, which adds its own.
          className={cn(
            "pl-9 group-hover/challenge:bg-sidebar-accent group-hover/challenge:text-sidebar-accent-foreground",
            inside && "font-medium",
          )}
          render={<Link href={href as Route} aria-current={current ? "page" : undefined} />}
        >
          <span className="min-w-0 flex-1 truncate">{title}</span>
          {/* While open, the Community row below shows the count instead. */}
          <UnreadBadge count={open ? 0 : unread} />
          {meta ? (
            <>
              <span
                aria-hidden="true"
                className="ml-auto shrink-0 font-normal text-muted-foreground text-xs tabular-nums"
              >
                {meta.short}
              </span>
              <span className="sr-only">, {meta.long}</span>
            </>
          ) : null}
        </SidebarMenuSubButton>
      </div>
      <div id={listId} hidden={!open}>
        {children}
      </div>
    </>
  );
}

/** Shows `children` (a challenge's own pages) only while that challenge is open. */
export function WhenWithin({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  return isWithin(pathname, href) ? children : null;
}

/**
 * On phones the sidebar is a sheet. Following any link inside it, including one in the
 * profile menu, closes the sheet before the next page shows.
 */
export function CloseSheetOnLink({ children }: { children: ReactNode }) {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the links inside are the controls
    // biome-ignore lint/a11y/useKeyWithClickEvents: links fire click on Enter too
    <div
      className="contents"
      onClick={(event) => {
        if (isMobile && (event.target as HTMLElement).closest("a")) setOpenMobile(false);
      }}
    >
      {children}
    </div>
  );
}
