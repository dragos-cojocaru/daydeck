import { SidebarInset, SidebarProvider, SidebarTrigger } from "@daydeck/ui/components/sidebar";
import { TooltipProvider } from "@daydeck/ui/components/tooltip";
import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { LiveProvider } from "@/features/community/live";
import { NotificationSound } from "@/features/notifications/notification-sound";
import { NotificationsButton } from "@/features/notifications/notifications-button";
import { AppSidebar } from "./sidebar";

/**
 * The signed-in layout, built on shadcn's Sidebar. From 768px the sidebar is docked and
 * collapses to icons (its own button, Ctrl or Cmd+B, or its edge). On phones it is a sheet,
 * opened from the top bar.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <LiveProvider>
        <NotificationSound />
        <SidebarProvider>
          <AppSidebar />
          {/* min-w-0: a wide element inside can never stretch the page past the screen. */}
          <SidebarInset className="min-w-0">
            {/* Phones only: the sidebar is a sheet, so this bar holds the button that opens it. */}
            <header className="sticky top-0 z-10 border-b bg-background md:hidden">
              <div className="flex h-14 w-full items-center gap-2 px-4">
                <SidebarTrigger className="-ml-2 size-11" />
                <Link
                  href="/challenges"
                  className="rounded-md font-heading font-semibold text-lg leading-7 tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  Daydeck
                </Link>
                <NotificationsButton className="-mr-2 ml-auto" />
              </div>
            </header>
            {/* The app's own pages get their bar here; a challenge's pages get theirs from its layout. */}
            {/* Each page draws its own top bar, so it is part of the first paint. */}
            <div className="flex flex-1 flex-col">{children}</div>
            <SiteFooter />
          </SidebarInset>
        </SidebarProvider>
      </LiveProvider>
    </TooltipProvider>
  );
}
