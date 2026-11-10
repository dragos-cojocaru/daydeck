import { buttonVariants } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import { FlaskConicalIcon } from "lucide-react";
import Link from "next/link";

/**
 * Said plainly on the demo challenge: its other members are sample accounts, there to try
 * everything alone. One quiet way on: host a real challenge and invite real people.
 */
export function DemoNotice() {
  return (
    <aside
      aria-labelledby="demo-notice-title"
      className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex gap-3">
        <FlaskConicalIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="flex flex-col gap-1">
          <p id="demo-notice-title" className="font-medium text-sm leading-5">
            This is a demo challenge
          </p>
          <p className="text-muted-foreground text-sm leading-5">
            The other members are sample accounts, there so you can try every part of Daydeck on
            your own: save a prompt to Buffer, chat, share a post and give feedback. When you are
            ready, host your own and invite real people.
          </p>
        </div>
      </div>
      <Link
        href="/challenges/new"
        className={cn(buttonVariants({ variant: "outline" }), "h-11 shrink-0 px-4 md:h-9")}
      >
        Host your own challenge
      </Link>
    </aside>
  );
}
