import type { Route } from "next";
import Link from "next/link";
import type { GettingStartedStep } from "@/server/onboarding";
import { ChecklistFooter } from "./hide-getting-started-button";

/**
 * The getting-started card at the bottom of the sidebar: progress, the next step as a link, and
 * all four steps folded away. It disappears when everything is done, or when hidden.
 */
export function GettingStarted({ steps }: { steps: GettingStartedStep[] }) {
  const done = steps.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done);
  if (!next) return null;

  return (
    <section
      aria-label="Getting started"
      className="flex flex-col gap-2 rounded-xl border bg-background p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-sm leading-5">Getting started</h2>
        <span className="text-muted-foreground text-xs">
          {done} of {steps.length} done
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Getting started progress"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={done}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${(done / steps.length) * 100}%` }}
        />
      </div>
      {/* The next step is always in view; the full list folds away, so the card stays short. */}
      <Link
        href={next.href as Route}
        className="-mx-1 flex flex-col rounded-md px-1 py-0.5 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="text-muted-foreground text-xs">Next step</span>
        <span className="font-medium leading-5">{next.label}</span>
        <span className="text-muted-foreground text-xs leading-4">{next.hint}</span>
      </Link>
      <ChecklistFooter steps={steps} nextKey={next.key} />
    </section>
  );
}
