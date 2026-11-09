import { buttonVariants } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import {
  EyeIcon,
  FilePenLineIcon,
  LockKeyholeIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BackLink } from "@/components/back-link";
import { ConnectNotice } from "@/features/connect/connect-notice";
import { shareMetadata } from "@/lib/site";
import { safeNextPath } from "@/server/auth/next-path";
import { env } from "@/server/env";

export const metadata: Metadata = shareMetadata({
  title: "Connect Buffer",
  description:
    "Connect your Buffer account to host or join a posting challenge on Daydeck. Daydeck never publishes anything for you.",
  path: "/connect",
});

export default function ConnectPage({ searchParams }: PageProps<"/connect">) {
  // Only when an AI service is on: then a post written outside Daydeck goes to it.
  const ai =
    (env.MATCHER_PROVIDER === "jev" && Boolean(env.JEV_API_KEY)) ||
    (env.MATCHER_PROVIDER === "llm" && Boolean(env.ANTHROPIC_API_KEY));
  return (
    // The shared public frame, so the text starts under "Daydeck"; a short column inside it.
    <main
      id="main"
      className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10 [&>*]:max-w-2xl"
    >
      <div className="flex flex-col gap-3">
        <BackLink href="/">Back to home</BackLink>
        <h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">
          Connect your Buffer account
        </h1>
        <p className="text-lg text-muted-foreground">
          Daydeck puts each day's prompt into Buffer as a draft and checks off the days you post.
        </p>
      </div>

      <Suspense fallback={null}>
        <ConnectNotice searchParams={searchParams} />
      </Suspense>

      <ul className="flex flex-col gap-4">
        <Fact icon={<EyeIcon />}>
          Reads your channels, the posts you schedule or send, and whether the ideas it saved are
          still there, to check off each day.
        </Fact>
        <Fact icon={<FilePenLineIcon />}>
          Creates drafts and ideas only, each with a "Daydeck" tag so you can find them. Nothing is
          published unless you schedule or publish it.
        </Fact>
        {ai ? (
          <Fact icon={<SparklesIcon />}>
            For a post you write outside Daydeck, an AI service suggests which day it is for, and
            you confirm. Only its first 100 characters are kept, until it has its day.
          </Fact>
        ) : null}
        <Fact icon={<LockKeyholeIcon />}>
          You approve access on Buffer's own site, and Daydeck never sees your password. You can
          remove Daydeck in Buffer's settings at any time.
        </Fact>
        <Fact icon={<ShieldCheckIcon />}>
          Delete everything Daydeck keeps about you whenever you want, from Your data. The{" "}
          <Link href="/privacy" className="underline underline-offset-3 hover:text-foreground">
            privacy page
          </Link>{" "}
          explains what is kept and why.
        </Fact>
      </ul>

      <Suspense fallback={<ConnectButton next={null} />}>
        <ConnectButtonWithNext searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function Fact({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground [&_svg]:size-4"
      >
        {icon}
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}

async function ConnectButtonWithNext({
  searchParams,
}: Pick<PageProps<"/connect">, "searchParams">) {
  const { next } = await searchParams;
  return <ConnectButton next={safeNextPath(typeof next === "string" ? next : null)} />;
}

function ConnectButton({ next }: { next: string | null }) {
  const href = next
    ? `/api/auth/buffer/start?next=${encodeURIComponent(next)}`
    : "/api/auth/buffer/start";
  // A plain link, not next/link: the start route answers with a redirect to Buffer.
  return (
    <a href={href} className={cn(buttonVariants(), "h-11 w-full px-5 sm:w-fit")}>
      Connect Buffer
    </a>
  );
}
