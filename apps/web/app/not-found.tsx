import { buttonVariants } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found" };

/** A page or challenge that does not exist, or that this person may not see. */
export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-start justify-center gap-4 px-4 py-12"
    >
      <p className="font-heading font-semibold text-lg">Daydeck</p>
      <h1 className="font-semibold text-3xl tracking-tight">This page does not exist</h1>
      <p className="text-lg text-muted-foreground">
        The link may be mistyped, or the challenge may have closed and been deleted. If someone sent
        you an invite, ask them for a new link.
      </p>
      <Link href="/" className={cn(buttonVariants(), "h-11 px-5")}>
        Back to home
      </Link>
    </main>
  );
}
