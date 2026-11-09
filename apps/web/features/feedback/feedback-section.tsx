import { CircleCheckIcon, ClockIcon, ExternalLinkIcon } from "lucide-react";
import { connection } from "next/server";
import { UserAvatar } from "@/components/user-avatar";
import { getDb } from "@/server/db";
import {
  feedbackForParticipant,
  type GroupRequestView,
  type OwnRequestView,
} from "@/server/feedback/service";
import { CloseRequestButton, CopyNoteButton, ReplyForm } from "./feedback-controls";

/**
 * Feedback on drafts for one participant: the group's open requests to reply to, and the
 * participant's own requests with their replies. A section with nothing in it renders nothing.
 * All text people wrote shows as plain text.
 */
export async function FeedbackSection({
  participantId,
  challengeId,
  userId,
  emptyText,
}: {
  participantId: string;
  challengeId: string;
  userId: string;
  /** Shown when nothing waits for feedback. Without it, an empty section renders nothing. */
  emptyText?: string;
}) {
  // A pending reply's age decides its label, so this reads the clock for the real request.
  await connection();
  const view = await feedbackForParticipant(
    getDb(),
    { participantId, challengeId, userId },
    new Date(),
  );
  if (view.forGroup.length === 0 && view.mine.length === 0) {
    return emptyText ? (
      <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
        {emptyText}
      </p>
    ) : null;
  }

  return (
    <>
      {view.forGroup.length > 0 ? (
        <section aria-labelledby="feedback-group-heading" className="flex flex-col gap-3">
          <h2 id="feedback-group-heading" className="font-semibold text-xl">
            Feedback for the group
          </h2>
          <p className="text-muted-foreground">
            People in this challenge would like a second pair of eyes on these drafts. A short, kind
            reply helps a lot.
          </p>
          <ul className="flex flex-col gap-3">
            {view.forGroup.map((request) => (
              <GroupRequest key={request.id} request={request} />
            ))}
          </ul>
        </section>
      ) : null}

      {view.mine.length > 0 ? (
        <section aria-labelledby="feedback-mine-heading" className="flex flex-col gap-3">
          <h2 id="feedback-mine-heading" className="font-semibold text-xl">
            Your feedback requests
          </h2>
          <ul className="flex flex-col gap-3">
            {view.mine.map((request) => (
              <OwnRequest key={request.id} request={request} />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function dayLabel(request: { dayNumber: number; promptTitle: string }) {
  return `Day ${request.dayNumber}: ${request.promptTitle}`;
}

/** The shared draft, kept as plain text with its line breaks. */
function Draft({ text, label }: { text: string; label: string }) {
  return (
    <figure className="flex min-w-0 flex-col gap-1">
      <figcaption className="text-muted-foreground text-sm">{label}</figcaption>
      <blockquote className="whitespace-pre-line rounded-lg bg-muted p-3 leading-6 wrap-anywhere">
        {text}
      </blockquote>
    </figure>
  );
}

function GroupRequest({ request }: { request: GroupRequestView }) {
  const label = dayLabel(request);
  return (
    <li className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex min-w-0 items-center gap-3">
        <UserAvatar name={request.askerName} src={request.askerAvatarUrl} />
        <p className="min-w-0 leading-6 wrap-anywhere">
          <span className="font-medium">{request.askerName}</span>{" "}
          <span className="text-muted-foreground">asked about {label}</span>
        </p>
      </div>
      <Draft text={request.draftSnapshot} label={`${request.askerName}'s draft`} />
      {request.myReplies.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm">
            {request.myReplies.length === 1 ? "Your reply" : "Your replies"}
          </p>
          <ul className="flex flex-col gap-2">
            {request.myReplies.map((reply) => (
              <li
                key={reply.id}
                className="whitespace-pre-line rounded-lg border p-3 leading-6 wrap-anywhere"
              >
                {reply.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {request.canReply ? (
        <ReplyForm requestId={request.id} askerName={request.askerName} />
      ) : (
        <p className="text-muted-foreground text-sm">
          You sent the most replies one person can send here. Thank you for helping.
        </p>
      )}
    </li>
  );
}

function OwnRequest({ request }: { request: OwnRequestView }) {
  const label = dayLabel(request);
  const open = request.status === "open";
  const needsCopy = request.replies.some((reply) => reply.display === "copy");
  return (
    <li className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="font-medium leading-6 wrap-anywhere">{label}</h3>
          <p className="text-muted-foreground text-sm">
            {open
              ? "Open: the group can see your draft and reply."
              : "Closed: the group does not see this draft."}
          </p>
        </div>
        {open ? <CloseRequestButton requestId={request.id} label={label} /> : null}
      </div>

      <details className="group">
        <summary className="flex h-11 w-fit cursor-pointer list-none items-center gap-1 rounded-md font-medium text-muted-foreground text-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="transition-transform group-open:rotate-90">
            ›
          </span>
          The draft you shared
        </summary>
        <p className="whitespace-pre-line rounded-lg bg-muted p-3 leading-6 wrap-anywhere">
          {request.draftSnapshot}
        </p>
      </details>

      {request.replies.length === 0 ? (
        <p className="text-muted-foreground">
          {open
            ? "No replies yet. They show here as soon as someone in the group replies."
            : "Nobody replied before you closed this request."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {request.replies.map((reply) => (
            <li key={reply.id} className="flex min-w-0 flex-col gap-2 rounded-lg bg-muted p-3">
              <p className="font-medium text-sm wrap-anywhere">{reply.authorName}</p>
              <p className="whitespace-pre-line leading-6 wrap-anywhere">{reply.text}</p>
              {reply.display === "written" ? (
                <p className="flex items-center gap-2 text-sm">
                  <CircleCheckIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
                  Saved to Buffer as a note
                </p>
              ) : reply.display === "saving" ? (
                <p className="flex items-center gap-2 text-muted-foreground text-sm">
                  <ClockIcon aria-hidden="true" className="size-4 shrink-0" />
                  On its way to Buffer as a note
                </p>
              ) : (
                <CopyNoteButton text={reply.noteText} authorName={reply.authorName} />
              )}
            </li>
          ))}
        </ul>
      )}

      {needsCopy ? (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-sm leading-6">
            Copy a reply, then paste it as a note on your draft in Buffer.
          </p>
          {request.draftsUrl ? (
            <a
              href={request.draftsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 w-fit items-center gap-1.5 rounded-md font-medium text-sm underline underline-offset-3 outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Open your drafts in Buffer
              <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
