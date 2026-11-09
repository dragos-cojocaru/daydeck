import { cookies } from "next/headers";
import { Suspense } from "react";
import { PublicFrame } from "@/components/public-frame";
import { RecapSkeleton } from "@/components/skeletons";
import { AppShell } from "@/features/shell/app-shell";
import { SESSION_COOKIE } from "@/server/auth/cookies";

// Pages made to be shared, such as a challenge's recap: inside the app, with the sidebar, for
// people who are signed in; with the public header for everyone else.
export default function ShareLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense
      fallback={
        <PublicFrame>
          <main
            id="main"
            className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12"
          >
            <RecapSkeleton />
          </main>
        </PublicFrame>
      }
    >
      <Frame>{children}</Frame>
    </Suspense>
  );
}

// Only whether a session cookie is there picks the frame: no database wait, so the frame (and
// the sidebar's own placeholders) shows at once. The page itself checks the session properly; an
// expired cookie just shows the app frame around the visitor's view.
async function Frame({ children }: { children: React.ReactNode }) {
  const signedIn = (await cookies()).has(SESSION_COOKIE);
  return signedIn ? <AppShell>{children}</AppShell> : <PublicFrame>{children}</PublicFrame>;
}
