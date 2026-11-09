"use client";

import { CheckIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useId, useState } from "react";
import { useFormStatus } from "react-dom";
import type { GettingStartedStep } from "@/server/onboarding";
import { hideGettingStarted } from "./actions";

/**
 * The checklist's last part: "All 4 steps" and "Hide checklist" on one row, the steps below
 * when opened, and where to find the checklist again once hidden.
 */
export function ChecklistFooter({
  steps,
  nextKey,
}: {
  steps: GettingStartedStep[];
  nextKey: string;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-muted-foreground text-xs outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 lg:min-h-8"
        >
          <span
            aria-hidden="true"
            className={open ? "rotate-90 transition-transform" : "transition-transform"}
          >
            ›
          </span>
          All {steps.length} steps
        </button>
        <form action={hideGettingStarted}>
          <HideButton />
        </form>
      </div>
      {open ? (
        <ol id={listId} className="flex flex-col gap-1 pb-1">
          {steps.map((step) => (
            <li key={step.key} className="flex items-start gap-2 text-sm">
              <span
                aria-hidden="true"
                className={
                  step.done
                    ? "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                    : "mt-0.5 size-4 shrink-0 rounded-full border-2 border-muted-foreground/40"
                }
              >
                {step.done ? <CheckIcon className="size-3" strokeWidth={3} /> : null}
              </span>
              <span className={step.done ? "text-muted-foreground" : undefined}>
                {step.done ? <span className="sr-only">Done: </span> : null}
                {step.key === nextKey ? <span className="sr-only">Next: </span> : null}
                {step.label}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      <p className="px-1 text-muted-foreground text-xs leading-4">
        Hidden, it shows again from{" "}
        <Link
          href={"/guide#checklist" as Route}
          className="underline underline-offset-3 hover:text-foreground"
        >
          How Daydeck works
        </Link>
        .
      </p>
    </div>
  );
}

function HideButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 rounded-md px-1 text-muted-foreground text-xs underline-offset-3 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 lg:min-h-8"
    >
      {pending ? "Hiding…" : "Hide checklist"}
    </button>
  );
}
