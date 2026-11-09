import { describe, expect, it } from "vitest";
import { deletionCountdown, deletionPhrase, deletionTime } from "./retention";

// The deletion date people see must match when the daily purge really deletes a challenge: the
// first run (00:45 UTC) on its 30th day after closing, in the challenge's own time zone.
describe("deletion date", () => {
  it("falls on the 30th local day, in any time zone", () => {
    const cases: [string, string, string][] = [
      // closed at, challenge time zone, deleted at
      ["2026-11-09T17:30:00Z", "Europe/Bucharest", "2026-12-09T00:45:00.000Z"],
      ["2026-11-09T17:30:00Z", "America/New_York", "2026-12-10T00:45:00.000Z"],
      ["2026-11-09T17:30:00Z", "America/Los_Angeles", "2026-12-10T00:45:00.000Z"],
      ["2026-11-09T17:30:00Z", "Pacific/Auckland", "2026-12-10T00:45:00.000Z"],
    ];
    for (const [closed, zone, deleted] of cases) {
      expect(deletionTime(new Date(closed), zone).toISOString()).toBe(deleted);
    }
  });

  it("reads as 30 days on the day a challenge closes", () => {
    const closedAt = new Date("2026-11-09T17:30:00Z");
    for (const zone of [
      "Europe/Bucharest",
      "America/New_York",
      "America/Los_Angeles",
      "Pacific/Auckland",
      "UTC",
    ]) {
      expect(deletionCountdown({ closedAt, timeZone: zone }, closedAt, zone).days).toBe(30);
    }
  });

  it("counts the days in the person's own time zone", () => {
    const challenge = { closedAt: new Date("2026-11-09T22:30:00Z"), timeZone: "Europe/Bucharest" };
    // Closed at 00:30 on 10 November in Bucharest, so deleted at 2026-12-10T00:45Z: still
    // 9 December in New York, 10 December in Bucharest.
    expect(
      deletionCountdown(challenge, new Date("2026-12-08T12:00:00Z"), "America/New_York"),
    ).toEqual({ date: "2026-12-09", days: 1 });
    expect(
      deletionCountdown(challenge, new Date("2026-12-08T12:00:00Z"), "Europe/Bucharest"),
    ).toEqual({ date: "2026-12-10", days: 2 });
    expect(deletionCountdown(challenge, new Date("2026-12-20T12:00:00Z"), "UTC").days).toBe(0);
  });

  it("reads as words", () => {
    expect([0, 1, 23].map(deletionPhrase)).toEqual(["today", "tomorrow", "in 23 days"]);
  });
});
