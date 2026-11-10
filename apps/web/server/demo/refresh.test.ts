import { ensureDemo } from "@daydeck/db/demo";
import { createTestDb } from "@daydeck/db/testing";
import { describe, expect, it } from "vitest";
import { refreshDemo } from "./refresh";

// The "demo-refresh" job: it runs only for the demo named in DEMO_INVITE_CODE, and stops after
// DEMO_UNTIL, so no other challenge is ever touched.

const NOW = new Date("2026-11-10T15:00:00Z");

describe("refreshDemo", () => {
  it("does nothing without a demo, after the end day, or for an unknown code", async () => {
    const { db, close } = await createTestDb();
    try {
      expect(await refreshDemo(db, NOW, {})).toEqual({ status: "off" });
      expect(
        await refreshDemo(db, new Date("2026-12-09T10:00:00Z"), {
          inviteCode: "any-demo-code",
          until: "2026-12-08",
        }),
      ).toEqual({ status: "ended" });
      expect(await refreshDemo(db, NOW, { inviteCode: "no-such-code-here" })).toEqual({
        status: "missing",
      });
    } finally {
      await close();
    }
  });

  it("brings the demo up to the moment, through the app's own database client", async () => {
    const { db, close } = await createTestDb();
    try {
      const client = (db as unknown as { $client: Parameters<typeof ensureDemo>[0] }).$client;
      const demo = await ensureDemo(client, { now: NOW });
      const settings = { inviteCode: demo.inviteCode, until: "2026-12-08" };

      // The last day still runs; the job compares whole days in UTC.
      const first = await refreshDemo(db, NOW, settings);
      expect(first.status).toBe("ticked");
      expect(first.status === "ticked" && first.changes).toBeGreaterThan(0);
      const again = await refreshDemo(db, NOW, settings);
      expect(again.status === "ticked" && again.changes).toBe(0);
      const lastDay = await refreshDemo(db, new Date("2026-12-08T23:30:00Z"), settings);
      expect(lastDay.status).toBe("ticked");
    } finally {
      await close();
    }
  });
});
