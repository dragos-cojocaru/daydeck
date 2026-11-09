import { NonRetriableError } from "inngest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupDeps } from "@/test/buffer-fakes";
import type { BufferDeps } from "../server/buffer/deps";
import { type CheckResult, checkParticipant } from "../server/progress/check";
import { type CheckSteps, runParticipantCheck } from "./functions";

// The participant check as Inngest runs it, with stand-in steps: what happens with bad data, a
// participant who has left, and a Buffer budget that runs low.

let deps: BufferDeps;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ deps, close } = await setupDeps());
});
afterEach(async () => {
  await close();
});

/** Steps that run at once and remember what they did. */
function fakeSteps() {
  const done: string[] = [];
  const steps: CheckSteps = {
    run: async (id, work) => {
      done.push(id);
      return work();
    },
    sleepUntil: async (id, until) => {
      done.push(`${id}@${until.toISOString()}`);
    },
  };
  return { steps, done };
}

const ID = "7d3c6f0e-2a4b-4c1d-9e8f-123456789abc";

describe("participant check job", () => {
  it("stops for good on data it cannot use, instead of retrying it four times", async () => {
    const { steps, done } = fakeSteps();
    for (const bad of [undefined, {}, { participantId: "not-a-uuid" }, { participantId: 42 }]) {
      await expect(runParticipantCheck(bad, steps)).rejects.toBeInstanceOf(NonRetriableError);
    }
    expect(done).toEqual([]);
  });

  it("skips a participant who has left, without an error", async () => {
    const { steps, done } = fakeSteps();
    const result = await runParticipantCheck({ participantId: ID }, steps, (id) =>
      checkParticipant(deps, id, { matchPost: null, mode: "background" }),
    );
    expect(result).toEqual({ status: "skipped", reason: "not-active" });
    expect(done).toEqual(["check"]);
  });

  it("waits for Buffer's budget to reset, then checks once more", async () => {
    const { steps, done } = fakeSteps();
    const retryAt = new Date("2026-11-09T10:00:00Z");
    const answers: CheckResult[] = [
      { status: "deferred", retryAt },
      { status: "checked", posts: 1, changedDays: 1, suggested: 0, unmatched: 0 },
    ];
    const result = await runParticipantCheck({ participantId: ID }, steps, async () => {
      const next = answers.shift();
      if (!next) throw new Error("checked too often");
      return next;
    });
    expect(result.status).toBe("checked");
    expect(done).toEqual(["check", `wait-for-budget@${retryAt.toISOString()}`, "check-after-wait"]);
  });
});
