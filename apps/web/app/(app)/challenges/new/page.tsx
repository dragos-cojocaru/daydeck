import { STARTER_SETS } from "@daydeck/db";
import type { Metadata } from "next";
import {
  ChallengeWizard,
  type StarterSetView,
} from "@/features/challenges/wizard/challenge-wizard";
import { TopPageBar } from "@/features/shell/top-page-bar";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Host a challenge" };

// The starter sets ship with the code (the deploy seeds the same list into the database), so
// the wizard needs no request-time data: this page is static and shows the form at once.
// Signing in is checked by the proxy before the page, and again by the create action.
// Each pack's whole pool ships with the page (a few KB), so swapping and shuffling never wait.
const toDraft = (prompt: (typeof STARTER_SETS)[number]["prompts"][number]) => ({
  theme: "",
  steps: [],
  ...prompt,
  bufferTemplateId: null,
});
const starterSets: StarterSetView[] = STARTER_SETS.map((set) => ({
  slug: set.slug,
  title: set.title,
  description: set.description,
  prompts: set.prompts.map(toDraft),
  pool: [...set.prompts, ...set.extra].map(toDraft),
}));

export default function NewChallengePage() {
  return (
    <>
      <TopPageBar label="Host a challenge" underChallenges />
      <main
        id="main"
        className="flex w-full flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12 lg:px-8"
      >
        <div className="flex flex-col gap-2">
          <h1 className="font-semibold text-3xl tracking-tight">Host a challenge</h1>
          <p className="max-w-3xl text-lg text-muted-foreground">
            Five short steps. Then your challenge opens, with a link to invite your team, community
            or class.
          </p>
        </div>
        <ChallengeWizard
          starterSets={starterSets}
          creatorCamp={env.FEATURE_CREATOR_CAMP === "true"}
        />
      </main>
    </>
  );
}
