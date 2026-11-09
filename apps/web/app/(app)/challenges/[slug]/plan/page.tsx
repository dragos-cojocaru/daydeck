import { Skeleton } from "@daydeck/ui/components/skeleton";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PlanWeek } from "@/features/challenges/plan-week";
import { requireUser } from "@/server/auth/current-user";
import { bufferErrorMessage } from "@/server/buffer/messages";
import { userActionBudget } from "@/server/buffer/rate-limits";
import { type FindSlotsResult, toFindSlotsResult } from "@/server/challenges/plan";
import { cachedWeekSlots, planKey } from "@/server/challenges/plan-cache";
import { challengeForMember } from "@/server/challenges/service";
import { getDb } from "@/server/db";

export const metadata: Metadata = { title: "Schedule" };

export default function PlanPage({ params }: PageProps<"/challenges/[slug]/plan">) {
  return (
    <main
      id="main"
      className="flex w-full flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12 lg:px-8"
    >
      {/* Fixed text, so it is part of the first paint; the days stream in below it. */}
      <div className="flex flex-col gap-2">
        <h1 className="font-semibold text-3xl tracking-tight">Schedule</h1>
        <p className="text-muted-foreground">
          The one place where your days get a time to post. Each day of the coming week gets a free
          time from your Buffer posting schedule, or a time you pick. Saving makes a draft with that
          time on each of this challenge's channels; nothing is published until you schedule it in
          Buffer.
        </p>
      </div>
      <Suspense fallback={<PlanSkeleton />}>
        <Plan params={params} />
      </Suspense>
    </main>
  );
}

async function Plan({ params }: Pick<PageProps<"/challenges/[slug]/plan">, "params">) {
  const { slug } = await params;
  const user = await requireUser(`/challenges/${slug}/plan`);
  const data = await challengeForMember(getDb(), slug, user.id, new Date());
  if (!data?.participant) notFound();

  return (
    <>
      {/* The suggestions come from Buffer; the rest of the page does not wait for them. */}
      <Suspense fallback={<PlanSkeleton />}>
        <Suggestions userId={user.id} slug={slug} planKey={planKey(data)} />
      </Suspense>
    </>
  );
}

async function Suggestions({
  userId,
  slug,
  planKey: key,
}: {
  userId: string;
  slug: string;
  planKey: string;
}) {
  await connection();
  let initial: FindSlotsResult;
  const budget = await userActionBudget(getDb(), new Date());
  if (!budget.ok) {
    const minutes = Math.max(1, Math.ceil((budget.retryAt.getTime() - Date.now()) / 60_000));
    initial = {
      status: "error",
      message: `Daydeck has nearly used its Buffer requests for now. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
    };
  } else {
    try {
      initial = toFindSlotsResult(await cachedWeekSlots(userId, slug, key));
    } catch (error) {
      initial = { status: "error", message: bufferErrorMessage(error) };
    }
  }
  return <PlanWeek slug={slug} initial={initial} />;
}

// Shaped like the real page: day cards with a time box, the save bar, and the side cards.
function PlanSkeleton() {
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start" aria-busy="true">
      <span className="sr-only">Checking your Buffer queue for free times</span>
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3, 4].map((row) => (
          <div
            key={row}
            className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-4 w-56" />
            </div>
            <Skeleton className="h-11 w-full rounded-lg sm:w-72" />
          </div>
        ))}
        <div className="flex items-center gap-4 rounded-xl border bg-card p-3">
          <Skeleton className="h-11 w-44" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <div className="flex flex-col gap-4">
        {[3, 3, 2].map((lines, card) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders in a fixed order
          <div key={card} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <Skeleton className="h-4 w-36" />
            {Array.from({ length: lines }, (_, line) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: placeholders in a fixed order
              <Skeleton key={line} className={line === lines - 1 ? "h-3 w-2/3" : "h-3 w-full"} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
