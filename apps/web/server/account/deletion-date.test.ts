import { describe, expect, it } from "vitest";
import { deletionCountdown, deletionPhrase, deletionTime } from "./retention";

// The deletion date people see must match when the daily purge really deletes a challenge:
// the first run (00:45 UTC) more than 30 days after it closed.
describe("deletion date", () => {
  it("is the first daily purge after 30 days", () => {
    expect(deletionTime(new Date("2026-11-09T10:00:00Z")).toISOString()).toBe(
      "2026-12-10T00:45:00.000Z",
    );
    expect(deletionTime(new Date("2026-11-09T00:30:00Z")).toISOString()).toBe(
      "2026-12-09T00:45:00.000Z",
    );
    // Exactly on the purge time is not "more than" 30 days yet, so it waits a day.
    expect(deletionTime(new Date("2026-11-09T00:45:00Z")).toISOString()).toBe(
      "2026-12-10T00:45:00.000Z",
    );
  });

  it("counts the days in the person's own time zone", () => {
    const closed = new Date("2026-11-09T22:30:00Z");
    // Deleted at 2026-12-10T00:45Z: still 9 December in New York, 10 December in Bucharest.
    expect(deletionCountdown(closed, new Date("2026-12-08T12:00:00Z"), "America/New_York")).toEqual(
      {
        date: "2026-12-09",
        days: 1,
      },
    );
    expect(deletionCountdown(closed, new Date("2026-12-08T12:00:00Z"), "Europe/Bucharest")).toEqual(
      {
        date: "2026-12-10",
        days: 2,
      },
    );
    expect(deletionCountdown(closed, new Date("2026-12-20T12:00:00Z"), "UTC").days).toBe(0);
  });

  it("reads as words", () => {
    expect([0, 1, 23].map(deletionPhrase)).toEqual(["today", "tomorrow", "in 23 days"]);
  });
});
