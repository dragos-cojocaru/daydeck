import { schema } from "@daydeck/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupDeps, T0 } from "@/test/buffer-fakes";
import type { BufferDeps } from "./deps";
import { backgroundBudget, userActionBudget } from "./rate-limits";

let deps: BufferDeps;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ deps, close } = await setupDeps());
});
afterEach(async () => {
  await close();
});

const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

async function snapshot(windowSeconds: number, quota: number, remaining: number, resetAt: Date) {
  await deps.db
    .insert(schema.rateLimitSnapshots)
    .values({ windowSeconds, quota, remaining, resetAt, capturedAt: T0 });
}

describe("userActionBudget", () => {
  it("allows user actions when nothing is known or plenty is left", async () => {
    expect(await userActionBudget(deps.db, T0)).toEqual({ ok: true });
    await snapshot(900, 110, 40, minutes(10));
    expect(await userActionBudget(deps.db, T0)).toEqual({ ok: true });
  });

  it("stops at 2% left and says when the window resets", async () => {
    await snapshot(900, 110, 2, minutes(10));
    await snapshot(86_400, 525, 300, minutes(600));
    expect(await userActionBudget(deps.db, T0)).toEqual({ ok: false, retryAt: minutes(10) });
  });

  it("ignores a window that has already reset", async () => {
    await snapshot(900, 110, 0, minutes(-1));
    expect(await userActionBudget(deps.db, T0)).toEqual({ ok: true });
  });
});

describe("backgroundBudget", () => {
  it("defers background checks below 10% while people can still act", async () => {
    // 10 of 110 left in the 15-minute window: under 10%, over 2%.
    await snapshot(900, 110, 10, minutes(7));
    expect(await backgroundBudget(deps.db, T0)).toEqual({ ok: false, retryAt: minutes(7) });
    expect(await userActionBudget(deps.db, T0)).toEqual({ ok: true });
  });

  it("waits for the last window that is short to reset", async () => {
    await snapshot(900, 110, 5, minutes(7));
    await snapshot(86_400, 525, 40, minutes(300));
    expect(await backgroundBudget(deps.db, T0)).toEqual({ ok: false, retryAt: minutes(300) });
  });

  it("runs with more than 10% left everywhere", async () => {
    await snapshot(900, 110, 12, minutes(7));
    await snapshot(2_592_000, 15_100, 9_000, minutes(40_000));
    expect(await backgroundBudget(deps.db, T0)).toEqual({ ok: true });
  });
});
