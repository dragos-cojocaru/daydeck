import type { Metadata } from "next";
import { Suspense } from "react";
import { ChannelsSkeleton } from "@/components/skeletons";
import { ChannelsSection } from "@/features/settings/channels-section";
import { TopPageBar } from "@/features/shell/top-page-bar";

export const metadata: Metadata = { title: "Your channels" };

export default function ChannelsPage({ searchParams }: PageProps<"/settings/channels">) {
  return (
    <>
      <TopPageBar label="Channels" />
      <main
        id="main"
        className="flex w-full flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12 lg:px-8"
      >
        <div className="flex flex-col gap-2">
          <h1 className="font-semibold text-3xl tracking-tight">Your channels</h1>
          <p className="text-muted-foreground">
            Channels are the social accounts you connected in Buffer, such as LinkedIn or X. Choose
            the ones Daydeck may use: their posts count for your challenges, and your drafts go
            there.
          </p>
        </div>
        <Suspense fallback={<ChannelsSkeleton />}>
          <ChannelsSection searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}
