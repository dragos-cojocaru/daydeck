import { buttonVariants } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import { ArrowLeftIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The "back" link at the top of a page. The negative margin lines the arrow up with the page
 * text; a long label is cut short instead of making the page wider than the screen.
 */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href as Route}
      className={cn(
        buttonVariants({ variant: "ghost" }),
        "-ml-3 h-11 w-fit max-w-[calc(100%+0.75rem)] justify-start gap-2 px-3 text-muted-foreground",
      )}
    >
      <ArrowLeftIcon aria-hidden="true" />
      <span className="truncate">{children}</span>
    </Link>
  );
}
