import { buttonVariants } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import { CircleCheckIcon, ExternalLinkIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BUFFER_PUBLISH_URL } from "@/lib/buffer-links";

export const metadata: Metadata = { title: "Your data is deleted", robots: { index: false } };

/** The confirmation after "Delete my data": exactly what was removed. */
export default function GoodbyePage({ searchParams }: PageProps<"/goodbye">) {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12 sm:py-16"
    >
      <CircleCheckIcon aria-hidden="true" className="size-10 text-primary" />
      <h1 className="font-semibold text-3xl tracking-tight">Your data is deleted</h1>
      <Suspense fallback={null}>
        <Deleted searchParams={searchParams} />
      </Suspense>
      <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "h-11 w-fit px-4")}>
        Back to home
      </Link>
    </main>
  );
}

async function Deleted({ searchParams }: Pick<PageProps<"/goodbye">, "searchParams">) {
  const query = await searchParams;
  const number = (key: string) => {
    const value = Number(query[key]);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  };
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const revoked = query.revoked === "1";
  return (
    <>
      <p className="text-lg">Daydeck deleted, just now:</p>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        <li>your account and your Buffer connection</li>
        <li>{plural(number("channels"), "channel", "channels")}</li>
        <li>
          your place in {plural(number("joined"), "challenge", "challenges")} and{" "}
          {plural(number("days"), "tracked day", "tracked days")}
        </li>
        {number("hosted") > 0 ? (
          <li>{plural(number("hosted"), "challenge you hosted", "challenges you hosted")}</li>
        ) : null}
        <li>{plural(number("feedback"), "feedback reply", "feedback replies")}</li>
        <li>{plural(number("messages"), "Community message", "Community messages")}</li>
      </ul>
      <p className="text-muted-foreground">
        {revoked
          ? "Buffer confirmed that Daydeck's access is revoked."
          : "Buffer did not confirm the revoke. To be sure, remove Daydeck in Buffer's settings."}{" "}
        Your posts and drafts in Buffer are still there.
      </p>
      <a
        href={`${BUFFER_PUBLISH_URL}/settings/apps`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-fit items-center gap-1.5 underline underline-offset-3"
      >
        Open Buffer's connected apps
        <ExternalLinkIcon aria-hidden="true" className="size-4" />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </>
  );
}
