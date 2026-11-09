import { buttonVariants } from "@daydeck/ui/components/button";
import { Skeleton } from "@daydeck/ui/components/skeleton";
import { cn } from "@daydeck/ui/lib/utils";
import Link from "next/link";
import { getCurrentSessionOrNull } from "@/server/auth/current-user";
import { HeaderProfileMenu } from "./profile-menu";

/**
 * The header's right side. Visitors get "Connect Buffer"; signed-in people get "Open app" and
 * their account menu. Only this corner depends on the session, so the page below never changes.
 */
export async function AccountMenu() {
  const session = await getCurrentSessionOrNull();

  if (!session) {
    return (
      <Link
        href="/connect"
        className={cn(buttonVariants({ variant: "outline" }), "h-11 shrink-0 px-4")}
      >
        Connect Buffer
      </Link>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Link
        href="/challenges"
        className={cn(buttonVariants({ variant: "outline" }), "h-11 shrink-0 px-4")}
      >
        Open app
      </Link>
      <HeaderProfileMenu name={session.user.name ?? "You"} avatarUrl={session.user.avatarUrl} />
    </div>
  );
}

export function AccountMenuFallback() {
  return <Skeleton className="h-11 w-36 rounded-lg" />;
}
