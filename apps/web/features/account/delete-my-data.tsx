"use client";

import { ConfirmAction } from "@/components/confirm-action";
import type { DataSummary } from "@/server/account/data";
import { deleteMyDataAction } from "./data-actions";

/** "Delete my data", with a confirmation that lists exactly what goes. */
export function DeleteMyData({ summary }: { summary: DataSummary }) {
  return (
    <ConfirmAction
      triggerLabel="Disconnect Buffer and delete my data"
      title="Delete all your Daydeck data?"
      confirmLabel="Delete my data"
      pendingLabel="Deleting…"
      description={
        <div className="flex flex-col gap-2">
          <p>This cannot be undone. Daydeck deletes, straight away:</p>
          <ul className="list-disc pl-5">
            <li>your account and your Buffer connection (Daydeck also revokes it at Buffer)</li>
            <li>
              {summary.challengesJoined === 1
                ? "your place in 1 challenge"
                : `your place in ${summary.challengesJoined} challenges`}{" "}
              and{" "}
              {summary.daysTracked === 1 ? "1 tracked day" : `${summary.daysTracked} tracked days`}
            </li>
            {summary.challengesHosted > 0 ? (
              <li>
                {summary.challengesHosted === 1
                  ? "the challenge you host"
                  : `the ${summary.challengesHosted} challenges you host`}
                {summary.othersInHostedChallenges > 0
                  ? `, for everyone in it (${summary.othersInHostedChallenges} other ${summary.othersInHostedChallenges === 1 ? "person" : "people"})`
                  : ""}
              </li>
            ) : null}
            <li>the feedback you wrote for others</li>
            <li>
              your messages and reactions in Community ({summary.messagesWritten}{" "}
              {summary.messagesWritten === 1 ? "message" : "messages"})
            </li>
          </ul>
          <p>
            Your posts, drafts, ideas and "Daydeck" tags in Buffer stay in Buffer. Notes already
            saved in someone else's Buffer stay there too.
          </p>
        </div>
      }
      action={async () => {
        const result = await deleteMyDataAction();
        if (!result.ok) return result.message;
        window.location.assign(result.goodbye);
      }}
    />
  );
}
