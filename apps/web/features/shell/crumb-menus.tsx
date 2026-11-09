"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@daydeck/ui/components/dropdown-menu";
import { cn } from "@daydeck/ui/lib/utils";
import {
  BookOpenIcon,
  ChevronDownIcon,
  FlameIcon,
  LayoutGridIcon,
  RadioTowerIcon,
  ShieldCheckIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { NavChallenge } from "@/server/challenges/nav";
import { CHALLENGE_PAGES } from "./challenge-pages";
import { crumbClass } from "./top-bar-styles";

// Every breadcrumb menu shares these, so they all have one item height, text size and spacing.
const ITEM = "min-h-11 gap-2 px-2 text-sm md:min-h-9";
const CURRENT = "bg-accent font-medium text-accent-foreground";
const CONTENT = "w-auto min-w-56 max-w-80";
/** Items per list before "N more", as in Notion. */
const LIMIT = 5;

export const TOP_PAGES = [
  { href: "/challenges", label: "Your challenges", Icon: LayoutGridIcon },
  { href: "/settings/channels", label: "Channels", Icon: RadioTowerIcon },
  { href: "/settings/data", label: "Your data", Icon: ShieldCheckIcon },
  { href: "/guide", label: "How Daydeck works", Icon: BookOpenIcon },
] as const;

/** A challenge's own pages. The recap has its own address, so it can be shared. */
export { CHALLENGE_PAGES };

/**
 * A crumb before the last one: a link, as in any breadcrumb, with a menu of this crumb's
 * siblings, as Notion's has. With a mouse the menu opens on hover. On touch screens and narrow
 * windows hover does not exist, so the name opens the page and an arrow button next to it opens
 * the menu; opening one crumb's menu closes any other.
 */
export function HoverCrumb({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <>
      {/* Only one of the two shows: both use the same pair of conditions, so they never clash. */}
      <span className="hidden min-w-0 md:pointer-fine:flex">
        <HoverMenu href={href} label={label}>
          {children}
        </HoverMenu>
      </span>
      <span className="flex min-w-0 items-center md:pointer-fine:hidden">
        <TapMenu href={href} label={label}>
          {children}
        </TapMenu>
      </span>
    </>
  );
}

function HoverMenu({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  const { open, setOpen, closeOnLink } = useNavMenu();
  const keyButton = useRef<HTMLButtonElement>(null);
  const openedByKey = useRef(false);
  // Keyboard users cannot hover, so a menu button follows the link. It shows only when it has
  // focus, opens the menu on its first page, and gets focus back when the menu closes.
  const openFromKeys = () => {
    openedByKey.current = true;
    setOpen(true);
    setTimeout(() => {
      document
        .querySelector<HTMLElement>("[data-slot=dropdown-menu-content] [role=menuitem]")
        ?.focus();
    }, 60);
  };
  const onKeyButtonKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openFromKeys();
    }
  };
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && openedByKey.current) {
      openedByKey.current = false;
      setTimeout(() => keyButton.current?.focus(), 0);
    }
  };
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        openOnHover
        delay={150}
        closeDelay={200}
        // The crumb is a link that also opens the menu on hover, so it is not a native button.
        // It stays a link for screen readers too; the menu button after it opens the menu.
        nativeButton={false}
        role="link"
        render={<Link href={href as Route} />}
        className={cn(crumbClass, "text-muted-foreground aria-expanded:bg-muted")}
      >
        <span className="truncate">{label}</span>
      </DropdownMenuTrigger>
      <button
        ref={keyButton}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More pages next to ${label}`}
        onClick={openFromKeys}
        onKeyDown={onKeyButtonKey}
        className="sr-only inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none focus-visible:not-sr-only focus-visible:size-8 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronDownIcon aria-hidden="true" className="size-4" />
      </button>
      <DropdownMenuContent align="start" className={CONTENT} onClickCapture={closeOnLink}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TapMenu({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  const { open, setOpen, closeOnLink } = useNavMenu();
  return (
    <>
      <Link
        href={href as Route}
        className={cn(crumbClass, "min-w-0 pr-1 text-muted-foreground md:pr-1")}
      >
        <span className="truncate">{label}</span>
      </Link>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          aria-label={`More pages next to ${label}`}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted md:size-8"
        >
          <ChevronDownIcon aria-hidden="true" className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className={CONTENT} onClickCapture={closeOnLink}>
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/**
 * A menu that closes as soon as one of its links is chosen, before the next page loads, and
 * again whenever the address changes. Next.js keeps a page you leave alive in the background
 * for back and forward, and a menu left open there would stay on screen.
 */
function useNavMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: closes on every new address
  useEffect(() => setOpen(false), [pathname]);
  const closeOnLink = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("a")) setOpen(false);
  };
  return { open, setOpen, closeOnLink };
}

/**
 * The last crumb, the page you are on. With sibling pages it has a down arrow and opens their
 * menu on hover, click or keyboard; without siblings it is plain text.
 */
export function EndCrumb({ label, children }: { label: string; children?: ReactNode }) {
  if (!children) {
    return (
      <span aria-current="page" className={cn(crumbClass, "font-medium hover:bg-transparent")}>
        <span className="truncate">{label}</span>
      </span>
    );
  }
  return <EndCrumbMenu label={label}>{children}</EndCrumbMenu>;
}

function EndCrumbMenu({ label, children }: { label: string; children: ReactNode }) {
  const { open, setOpen, closeOnLink } = useNavMenu();
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        openOnHover
        delay={80}
        closeDelay={200}
        aria-current="page"
        className={cn(crumbClass, "font-medium aria-expanded:bg-muted")}
      >
        <span className="truncate">{label}</span>
        <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={CONTENT} onClickCapture={closeOnLink}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const SPLIT_QUERY = "(pointer: coarse), (max-width: 767px)";

function subscribeSplit(onChange: () => void) {
  const query = window.matchMedia(SPLIT_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * True on touch screens and narrow windows, where hover does not exist: a menu row with a
 * deeper menu then splits into the page link and its own arrow button. Menus only render once
 * opened, in the browser, so the server's guess (false) is never shown.
 */
function useSplitRows(): boolean {
  return useSyncExternalStore(
    subscribeSplit,
    () => window.matchMedia(SPLIT_QUERY).matches,
    () => false,
  );
}

/**
 * A menu row that also opens a deeper menu. With a mouse the whole row is the link and hovering
 * it opens the deeper menu. On touch, the name is the link and the arrow opens the deeper menu.
 */
function SubRow({
  href,
  current,
  label,
  icon,
  children,
}: {
  href: string;
  current: boolean;
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const split = useSplitRows();
  const arrow = useRef<HTMLDivElement>(null);
  const link = <Link href={href as Route} aria-current={current ? "page" : undefined} />;
  // On the split row, ArrowRight on the name does what it does on any row with a deeper menu.
  const openDeeper = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowRight" || !arrow.current) return;
    event.preventDefault();
    arrow.current.focus();
    arrow.current.dispatchEvent(
      new globalThis.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
  };
  return (
    <DropdownMenuSub>
      {split ? (
        <div className="flex items-center gap-0.5">
          <DropdownMenuItem
            className={cn(ITEM, "min-w-0 flex-1", current && CURRENT)}
            render={link}
            onKeyDown={openDeeper}
          >
            {icon}
            <span className="min-w-0 truncate">{label}</span>
          </DropdownMenuItem>
          {/* A thin line between the two, so the arrow reads as its own button. */}
          <span aria-hidden="true" className="h-6 w-px shrink-0 bg-border" />
          <DropdownMenuSubTrigger
            ref={arrow}
            aria-label={`More pages under ${label}`}
            className="size-11 shrink-0 justify-center p-0 [&>svg]:ml-0"
          />
        </div>
      ) : (
        <DropdownMenuSubTrigger className={cn(ITEM, current && CURRENT)} render={link}>
          {icon}
          <span className="min-w-0 truncate">{label}</span>
        </DropdownMenuSubTrigger>
      )}
      <DropdownMenuSubContent className={CONTENT}>{children}</DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/** The app's top-level pages; "Your challenges" opens your challenges one level deeper. */
export function TopPagesItems({ challenges }: { challenges: NavChallenge[] }) {
  const pathname = usePathname();
  return TOP_PAGES.map(({ href, label, Icon }) => {
    const current = pathname === href || pathname.startsWith(`${href}/`);
    if (href === "/challenges" && challenges.length > 0) {
      return (
        <SubRow
          key={href}
          href={href}
          current={current}
          label={label}
          icon={<Icon aria-hidden="true" />}
        >
          <ChallengesItems challenges={challenges} />
        </SubRow>
      );
    }
    return (
      <DropdownMenuItem
        key={href}
        className={cn(ITEM, current && CURRENT)}
        render={<Link href={href as Route} aria-current={current ? "page" : undefined} />}
      >
        <Icon aria-hidden="true" />
        {label}
      </DropdownMenuItem>
    );
  });
}

/**
 * Your challenges, active ones first, at most five plus the one you are in. Each opens its pages
 * one level deeper. "N more" leads to the full list, or is plain text when you are on it.
 */
export function ChallengesItems({ challenges }: { challenges: NavChallenge[] }) {
  const pathname = usePathname();
  const currentSlug = /^\/challenges\/([^/]+)/.exec(pathname)?.[1];
  // A stable sort: active ones first, each group still newest first.
  const ordered = [...challenges].sort((a, b) => Number(!a.inSidebar) - Number(!b.inSidebar));
  const shown = ordered.slice(0, LIMIT);
  const current = ordered.find((challenge) => challenge.slug === currentSlug);
  if (current && !shown.includes(current)) shown.push(current);
  const more = ordered.length - shown.length;

  return (
    <>
      {shown.map((challenge) => {
        const isCurrent = challenge.slug === currentSlug;
        const href = `/challenges/${challenge.slug}`;
        return (
          <SubRow
            key={challenge.slug}
            href={href}
            current={isCurrent}
            label={challenge.title}
            icon={<FlameIcon aria-hidden="true" />}
          >
            <ChallengePagesItems slug={challenge.slug} />
          </SubRow>
        );
      })}
      {more > 0 ? (
        pathname === "/challenges" ? (
          <p className="px-2 py-2 text-muted-foreground text-sm leading-5">{more} more</p>
        ) : (
          <DropdownMenuItem
            className={cn(ITEM, "text-muted-foreground")}
            render={<Link href="/challenges" />}
          >
            {more} more
          </DropdownMenuItem>
        )
      ) : null}
    </>
  );
}

/** One challenge's pages: Overview, Board, Schedule and Recap. */
export function ChallengePagesItems({ slug }: { slug: string }) {
  const pathname = usePathname();
  return CHALLENGE_PAGES.map(({ href: hrefFor, label, Icon }) => {
    const href = hrefFor(slug);
    const current = pathname === href;
    return (
      <DropdownMenuItem
        key={label}
        className={cn(ITEM, current && CURRENT)}
        render={<Link href={href as Route} aria-current={current ? "page" : undefined} />}
      >
        <Icon aria-hidden="true" />
        {label}
      </DropdownMenuItem>
    );
  });
}

/** The " / " between crumbs. */
export function CrumbSeparator({ className }: { className?: string }) {
  return (
    <li aria-hidden="true" className={cn("shrink-0 text-muted-foreground text-sm", className)}>
      /
    </li>
  );
}
