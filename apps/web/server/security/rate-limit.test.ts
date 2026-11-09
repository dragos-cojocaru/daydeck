import { schema } from "@daydeck/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupDeps, T0 } from "@/test/buffer-fakes";
import type { BufferDeps } from "../buffer/deps";
import { hit, tooManyMessage } from "./rate-limit";

let deps: BufferDeps;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ deps, close } = await setupDeps());
});
afterEach(async () => {
  await close();
});

describe("endpoint rate limits", () => {
  const rule = { limit: 3, windowSeconds: 60 };

  it("allows the limit, then says how long to wait", async () => {
    for (let i = 0; i < 3; i++) expect(await hit(deps.db, "k", rule, T0)).toEqual({ ok: true });
    const blocked = await hit(deps.db, "k", rule, new Date(T0.getTime() + 15_000));
    expect(blocked).toEqual({ ok: false, retryAfterSeconds: 45 });
    expect(tooManyMessage(45)).toContain("a minute");
  });

  it("starts again in the next window, and keys do not share counts", async () => {
    for (let i = 0; i < 4; i++) await hit(deps.db, "k", rule, T0);
    expect(await hit(deps.db, "k", rule, new Date(T0.getTime() + 60_000))).toEqual({ ok: true });
    expect(await hit(deps.db, "other", rule, T0)).toEqual({ ok: true });
    const rows = await deps.db.select().from(schema.endpointHits);
    expect(rows.map((row) => row.key).sort()).toEqual(["k", "k", "other"]);
  });
});
