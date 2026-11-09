"use client";

import { Button } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import { MessageCircleIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { askFeedbackAction, type FeedbackActionState } from "./actions";

/**
 * "Ask the group for feedback" on a day whose draft is in Buffer. A short confirm says the
 * draft text is shared with the group before anything leaves Buffer.
 */
export function AskFeedbackButton({
  entryId,
  asked = false,
  feedbackHref,
}: {
  entryId: string;
  /** True when this day already has an open feedback request. */
  asked?: boolean;
  /** Where replies show: the challenge's Community, under Feedback. */
  feedbackHref: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<FeedbackActionState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const shareRef = useRef<HTMLButtonElement>(null);
  const askRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLOutputElement>(null);
  const noticeId = useId();
  const [returnFocus, setReturnFocus] = useState(false);
  const shared = state.status === "ok";
  const done = shared || (asked && state.status === "idle");

  // Opening the confirm moves focus to it; cancelling puts focus back on the first button.
  // Once shared, the buttons go away, so focus moves to the confirmation.
  useEffect(() => {
    if (shared) doneRef.current?.focus();
    else if (confirming) shareRef.current?.focus();
    else if (returnFocus) askRef.current?.focus();
  }, [shared, confirming, returnFocus]);

  const share = () =>
    startTransition(async () => {
      setState(await askFeedbackAction(entryId));
    });

  return (
    <div className="flex flex-col gap-3">
      {/* One live region that stays in place, so screen readers hear the result. */}
      <output
        ref={doneRef}
        tabIndex={-1}
        className={cn("block text-sm outline-none", !done && "sr-only")}
      >
        {done ? (
          <>
            {shared ? state.message : "You asked the group for feedback on this draft."} Replies
            show in{" "}
            <Link
              href={feedbackHref as Route}
              className="font-medium text-primary underline underline-offset-3 hover:no-underline"
            >
              Community, under Feedback
            </Link>
            .
          </>
        ) : null}
      </output>
      {done ? null : confirming ? (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <p id={noticeId} className="text-sm leading-6">
            The people in this challenge see the current text of your draft in Buffer and can reply
            to it. Daydeck keeps this copy of the text so they can read it.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              ref={shareRef}
              type="button"
              className="h-11 px-5"
              disabled={pending}
              aria-describedby={noticeId}
              onClick={share}
            >
              {pending ? "Sharing your draft…" : "Share my draft"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 px-5"
              disabled={pending}
              onClick={() => {
                setConfirming(false);
                setReturnFocus(true);
                setState({ status: "idle" });
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          ref={askRef}
          type="button"
          variant="outline"
          className="h-11 w-fit gap-2 px-4"
          onClick={() => setConfirming(true)}
        >
          <MessageCircleIcon aria-hidden="true" />
          Ask the group for feedback
        </Button>
      )}
      {state.status === "error" ? (
        <p role="alert" className="text-destructive text-sm">
          {state.message}
          {state.reconnect ? (
            <>
              {" "}
              <a className="underline" href="/api/auth/buffer/start">
                Connect Buffer again
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
