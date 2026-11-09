import Link from "next/link";
import { Suspense } from "react";
import { AccountMenu, AccountMenuFallback } from "@/features/account/account-menu";

/**
 * The header on public pages. Every public page shares its frame (max-w-6xl), so "Daydeck"
 * starts where the wide pages' headings start; short forms such as Connect sit in a narrow
 * column inside it. Signed-in navigation lives in the app's sidebar instead.
 */
export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="shrink-0 rounded-md font-heading font-semibold text-lg leading-7 tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Daydeck
        </Link>
        <Suspense fallback={<AccountMenuFallback />}>
          <AccountMenu />
        </Suspense>
      </div>
    </header>
  );
}
