"use client";

import { Button } from "@daydeck/ui/components/button";
import { cn } from "@daydeck/ui/lib/utils";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { closeFeedbackAction, type FeedbackActionState, replyFeedbackAction } from "./actions";

// The same limit as MAX_REPLY_LENGTH in server/feedback/service.ts, which checks it again.
const MAX_REPLY_LENGTH = 2_000;

/** The reply box under someone's shared draft. The text stays in the box if sending fails. */
export function ReplyForm({ requestId, askerName }: { requestId: string; askerName: string }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<FeedbackActionState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const fieldId = useId();
  const hintId = useId();
  const messageId = useId();
  const invalid = state.status === "error";

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!text.trim()) {
          setState({ status: "error", message: "Write a reply first.", at: Date.now() });
          return;
        }
        startTransition(async () => {
          const result = await replyFeedbackAction({ requestId, text });
          setState(result);
          if (result.status === "ok") setText("");
        });
      }}
    >
      <label htmlFor={fieldId} className="font-medium text-sm wrap-anywhere">
        Your reply to {askerName}
      </label>
      <textarea
        id={fieldId}
        value={text}
        maxLength={MAX_REPLY_LENGTH}
        rows={3}
        aria-describedby={invalid ? `${hintId} ${messageId}` : hintId}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          setText(event.target.value);
          if (state.status !== "idle") setState({ status: "idle" });
        }}
        // Grows with its text; never shorter than 3 lines plus equal top and bottom padding.
        className="field-sizing-content min-h-[calc(3lh+1.25rem+2px)] w-full min-w-0 resize-y rounded-lg border bg-background px-3 py-2.5 text-base leading-6 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
      />
      <p id={hintId} className="text-muted-foreground text-sm wrap-anywhere">
        {askerName} sees your reply with your name. Up to 2,000 characters.
      </p>
      <Button type="submit" className="h-11 w-fit px-5" disabled={pending}>
        {pending ? "Sending…" : "Send feedback"}
      </Button>
      <output
        id={messageId}
        aria-live="polite"
        className={cn("block text-sm", invalid && "text-destructive")}
      >
        {state.status === "idle" ? "" : state.message}
      </output>
    </form>
  );
}

/** Copies a reply, with its author's name, to paste as a Note on the draft in Buffer. */
export function CopyNoteButton({ text, authorName }: { text: string; authorName: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        className="h-11 w-fit gap-2 px-4"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setFailed(false);
          } catch {
            setFailed(true);
          }
        }}
      >
        {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
        {copied ? "Copied" : "Copy into Buffer"}
        <span className="sr-only"> the reply from {authorName}</span>
      </Button>
      <output className="sr-only">
        {copied
          ? `Reply from ${authorName} copied. Paste it as a note on your draft in Buffer.`
          : ""}
      </output>
      {failed ? (
        <p role="alert" className="text-destructive text-sm">
          Copying does not work in this browser. Select the reply and copy it yourself.
        </p>
      ) : null}
    </div>
  );
}

/** "Close request": hides the request from the group. The replies stay. */
export function CloseRequestButton({ requestId, label }: { requestId: string; label: string }) {
  const [state, setState] = useState<FeedbackActionState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        className="h-11 px-4"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setState(await closeFeedbackAction(requestId));
          })
        }
      >
        {pending ? "Closing…" : "Close request"}
        <span className="sr-only"> for {label}</span>
      </Button>
      {state.status === "error" ? (
        <p role="alert" className="text-destructive text-sm">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
