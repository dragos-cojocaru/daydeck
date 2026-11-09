import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { GuideContent } from "@/features/guide/guide-content";
import { ShowGettingStarted } from "@/features/shell/show-getting-started";
import { TopPageBar } from "@/features/shell/top-page-bar";
import { getCurrentSessionOrNull } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "How Daydeck works" };

/** The guide inside the app, with the sidebar. Visitors get the same text at /how-it-works. */
export default function GuidePage() {
  return (
    <>
      <TopPageBar label="How Daydeck works" />
      <main
        id="main"
        className="flex w-full flex-1 flex-col gap-10 px-4 py-10 sm:px-6 sm:py-12 lg:px-8"
      >
        {/* For someone who hid the sidebar's checklist: one line to show it again. */}
        <Suspense fallback={null}>
          <ShowGettingStarted />
        </Suspense>
        <GuideContent />
        <Suspense fallback={null}>
          <SessionCheck />
        </Suspense>
      </main>
    </>
  );
}

async function SessionCheck() {
  // The proxy sends visitors without a session cookie to /how-it-works; this covers an
  // expired session.
  if (!(await getCurrentSessionOrNull())) redirect("/how-it-works");
  return null;
}
