import { buttonVariants } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { GuideContent } from "@/features/guide/guide-content";
import { shareMetadata } from "@/lib/site";

export const metadata: Metadata = shareMetadata({
  title: "How Daydeck works",
  description:
    "How a posting challenge runs on Daydeck: a prompt each day, drafts in Buffer, days that check themselves off, a shared board, a group chat and a recap.",
  path: "/how-it-works",
});

/** The guide for visitors who have not connected Buffer. Signed-in links go to /guide. */
export default function HowItWorksPage() {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10"
    >
      <BackLink href="/">Back to home</BackLink>
      <GuideContent />
      <section
        aria-labelledby="next-heading"
        className="mt-4 flex flex-col items-start gap-3 rounded-xl border p-5"
      >
        <h2 id="next-heading" className="font-semibold text-lg">
          Ready to start?
        </h2>
        <p className="text-muted-foreground">
          Connect Buffer, then set up a challenge in five short steps. Got an invite link? Open it
          to join that challenge.
        </p>
        <Link
          href="/connect?next=%2Fchallenges%2Fnew"
          className={cn(buttonVariants(), "h-11 px-5")}
        >
          Host a challenge
        </Link>
      </section>
    </main>
  );
}
