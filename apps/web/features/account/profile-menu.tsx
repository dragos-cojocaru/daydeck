"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@daydeck/ui/components/dropdown-menu";
import { SidebarMenuButton, useSidebar } from "@daydeck/ui/components/sidebar";
import { cn } from "@daydeck/ui/lib/utils";
import {
  ChevronDownIcon,
  ChevronsUpDownIcon,
  ExternalLinkIcon,
  LayoutGridIcon,
  LogOutIcon,
  UserPenIcon,
} from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { UserAvatar } from "@/components/user-avatar";
import { BUFFER_HOME_URL, BUFFER_SETTINGS_URL } from "@/lib/buffer-links";
import { signOut } from "./actions";

type Person = { name: string; avatarUrl: string | null };

// 44px rows on phones for touch, compact rows with a pointer.
const itemClass = "min-h-11 gap-2 px-2 md:min-h-9";

/** The sidebar's account row. Opens a menu with Open Buffer and Sign out. */
export function SidebarProfileMenu({ name, avatarUrl }: Person) {
  const { isMobile } = useSidebar();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            size="lg"
            className="aria-expanded:bg-sidebar-accent group-data-[collapsible=icon]:justify-center"
          />
        }
      >
        <UserAvatar name={name} src={avatarUrl} size="sm" />
        {/* In the collapsed rail only the avatar shows; the name stays the button's label. */}
        <span className="min-w-0 flex-1 truncate text-left font-medium leading-5 group-data-[collapsible=icon]:sr-only">
          {name}
        </span>
        <ChevronsUpDownIcon
          aria-hidden="true"
          className="ml-auto group-data-[collapsible=icon]:hidden"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={isMobile ? "top" : "right"}
        align="end"
        sideOffset={4}
        className="w-auto min-w-56"
      >
        <MenuItems name={name} avatarUrl={avatarUrl} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The public header's account button: your name, and a menu to open the app or sign out. */
export function HeaderProfileMenu({ name, avatarUrl }: Person) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-11 min-w-0 items-center gap-2 rounded-lg px-2 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted">
        <UserAvatar name={name} src={avatarUrl} size="sm" />
        {/* Phones show only the avatar, so "Open app" fits; screen readers still hear the name. */}
        <span className="sr-only min-w-0 max-w-40 truncate font-medium leading-5 sm:not-sr-only">
          {name}
        </span>
        <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="w-auto min-w-56">
        <MenuItems name={name} avatarUrl={avatarUrl} withAppLink />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuItems({ name, avatarUrl, withAppLink = false }: Person & { withAppLink?: boolean }) {
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel className="flex items-center gap-2 px-2 py-2 font-normal text-foreground">
          <UserAvatar name={name} src={avatarUrl} size="sm" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-sm leading-5">{name}</span>
            <span className="text-muted-foreground text-xs leading-4">Signed in with Buffer</span>
          </span>
        </DropdownMenuLabel>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        {withAppLink ? (
          <DropdownMenuItem className={itemClass} render={<Link href="/challenges" />}>
            <LayoutGridIcon aria-hidden="true" />
            Your challenges
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          className={itemClass}
          render={
            // biome-ignore lint/a11y/useAnchorContent: the menu item renders the content
            <a href={BUFFER_HOME_URL} target="_blank" rel="noopener noreferrer" />
          }
        >
          <ExternalLinkIcon aria-hidden="true" />
          Open Buffer
          <span className="sr-only">(opens in a new tab)</span>
        </DropdownMenuItem>
        {/* Daydeck shows the name and photo from Buffer, copied each time you connect. */}
        <DropdownMenuItem
          className={cn(itemClass, "items-start py-2")}
          render={
            // biome-ignore lint/a11y/useAnchorContent: the menu item renders the content
            <a href={BUFFER_SETTINGS_URL} target="_blank" rel="noopener noreferrer" />
          }
        >
          <UserPenIcon aria-hidden="true" className="mt-0.5" />
          <span className="flex flex-col">
            <span>Change your name in Buffer</span>
            <span className="text-muted-foreground text-xs leading-4">
              Daydeck shows it after you next sign in.
            </span>
          </span>
          <span className="sr-only">(opens in a new tab)</span>
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <SignOutItem />
    </>
  );
}

/**
 * Signs out, then loads the start page in full. Next.js keeps recently visited pages alive for
 * back and forward; a full load makes sure none of the signed-out person's pages stay in the tab.
 */
function SignOutItem() {
  const [pending, startTransition] = useTransition();
  return (
    <DropdownMenuItem
      className={cn(itemClass)}
      closeOnClick={false}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await signOut();
          window.location.assign("/");
        })
      }
    >
      <LogOutIcon aria-hidden="true" />
      {pending ? "Signing out…" : "Sign out"}
    </DropdownMenuItem>
  );
}
