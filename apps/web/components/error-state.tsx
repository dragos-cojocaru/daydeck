"use client";

import { Button, buttonVariants } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

/**
 * What a page shows when something breaks while it loads: what happened in plain words, a
 * way to try again, and a way out. The error goes to Sentry, scrubbed; never to the screen.
 */
export function ErrorState({
  error,
  retry,
  home = "/",
}: {
  error: Error & { digest?: string };
  retry: () => void;
  home?: "/" | "/challenges";
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-start gap-4 px-4 py-12 sm:py-16"
    >
      <h1 className="font-semibold text-3xl tracking-tight">This page did not load</h1>
      <p className="text-lg text-muted-foreground">
        Something went wrong on our side, not yours. Your days and your Buffer posts are safe. Try
        again, and if it keeps happening, come back in a few minutes.
      </p>
      {error.digest ? (
        <p className="text-muted-foreground text-sm">Error reference: {error.digest}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-11 px-5" onClick={() => retry()}>
          Try again
        </Button>
        <Link href={home} className={cn(buttonVariants({ variant: "outline" }), "h-11 px-5")}>
          {home === "/" ? "Back to home" : "Your challenges"}
        </Link>
      </div>
    </main>
  );
}
