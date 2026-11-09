import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarTrigger,
} from "@daydeck/ui/components/sidebar";
import {
  BookOpenIcon,
  LayoutGridIcon,
  PlusIcon,
  RadioTowerIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { SidebarProfileMenu } from "@/features/account/profile-menu";
import { getCurrentSessionOrNull } from "@/server/auth/current-user";
import { navChallenges } from "@/server/challenges/nav";
import { getDb } from "@/server/db";
import { gettingStarted, HIDE_GETTING_STARTED_COOKIE } from "@/server/onboarding";
import { ChallengeNavList } from "./challenge-nav-list";
import { GettingStarted } from "./getting-started";
import { CloseSheetOnLink, NavItem } from "./nav-link";

/**
 * The app's sidebar (shadcn's Sidebar on Base UI), in the order people use it: create, your
 * challenges, then setup, help and your account. From 768px it is docked and collapses to a
 * rail of icons with tooltips; on phones it is a sheet.
 */
export function AppSidebar() {
  return (
    // A landmark of its own, so its logo and account menu are part of a named region too.
    <Sidebar collapsible="icon" role="complementary" aria-label="Sidebar">
      <CloseSheetOnLink>
        <SidebarHeader className="gap-0 p-0">
          {/* 48px with a bottom border, the same as the top bar beside it: one line across. */}
          <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-sidebar-border border-b px-2 pl-4 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <Link
              href="/challenges"
              className="rounded-md font-heading font-semibold text-lg leading-7 tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50 group-data-[collapsible=icon]:hidden"
            >
              Daydeck
            </Link>
            {/* Wide screens only: the phone sheet has its own close button. */}
            <SidebarTrigger className="hidden size-8 md:inline-flex" />
          </div>
          <SidebarMenu className="p-2">
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Host a challenge"
                render={<Link href="/challenges/new" />}
                className="bg-primary font-medium text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
              >
                <PlusIcon aria-hidden="true" />
                <span>Host a challenge</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <Suspense fallback={<SidebarBodySkeleton />}>
          <SidebarBody />
        </Suspense>
      </CloseSheetOnLink>
    </Sidebar>
  );
}

async function SidebarBody() {
  const session = await getCurrentSessionOrNull();
  // Signed-in pages redirect on their own; this only shows while that happens.
  if (!session) return <SidebarContent />;

  const db = getDb();
  const [challenges, steps] = await Promise.all([
    navChallenges(session.user.id),
    gettingStarted(db, session.user.id),
  ]);
  const hidden = (await cookies()).get(HIDE_GETTING_STARTED_COOKIE)?.value === "1";

  return (
    <>
      <SidebarContent>
        <SidebarGroup>
          <nav aria-label="Main">
            <SidebarMenu>
              <SidebarMenuItem>
                <NavItem
                  href="/challenges"
                  exact
                  label="Your challenges"
                  icon={<LayoutGridIcon aria-hidden="true" />}
                />
                {challenges.length > 0 ? (
                  <ChallengeNavList challenges={challenges} />
                ) : (
                  <p className="px-2 py-2 text-muted-foreground text-xs leading-4 group-data-[collapsible=icon]:hidden">
                    No challenges yet. Host one, or open an invite link someone sent you.
                  </p>
                )}
              </SidebarMenuItem>
            </SidebarMenu>
          </nav>
        </SidebarGroup>

        {/* Stays in view while a long challenge list scrolls above it; on very short windows
            it scrolls with the rest, so the list always keeps some room. */}
        <SidebarGroup className="sticky bottom-0 z-10 mt-auto gap-2 border-sidebar-border border-t bg-sidebar [@media(max-height:640px)]:static">
          {hidden ? null : (
            <div className="group-data-[collapsible=icon]:hidden">
              <GettingStarted steps={steps} />
            </div>
          )}
          <nav aria-label="Setup and help">
            <SidebarMenu>
              <SidebarMenuItem>
                <NavItem
                  href="/settings/channels"
                  label="Channels"
                  icon={<RadioTowerIcon aria-hidden="true" />}
                />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <NavItem
                  href="/settings/data"
                  label="Your data"
                  icon={<ShieldCheckIcon aria-hidden="true" />}
                />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <NavItem
                  href="/guide"
                  label="How Daydeck works"
                  icon={<BookOpenIcon aria-hidden="true" />}
                />
              </SidebarMenuItem>
            </SidebarMenu>
          </nav>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarProfileMenu
              name={session.user.name ?? "You"}
              avatarUrl={session.user.avatarUrl}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  );
}

function SidebarBodySkeleton() {
  return (
    <SidebarContent aria-busy="true">
      <span className="sr-only">Loading the menu</span>
      <SidebarGroup>
        <SidebarMenu>
          {["80%", "60%", "70%"].map((width) => (
            <SidebarMenuItem key={width}>
              <SidebarMenuSkeleton showIcon width={width} />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>
  );
}
