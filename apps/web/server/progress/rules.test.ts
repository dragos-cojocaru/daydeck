import { describe, expect, it } from "vitest";
import { isDueForCheck, localHour, stateForPost } from "./rules";

const zone = "Europe/Bucharest";

describe("stateForPost", () => {
  it("maps Buffer statuses to day states", () => {
    expect(stateForPost({ status: "draft", sentAt: null }, "2026-11-09", zone)).toBe("saved");
    expect(stateForPost({ status: "scheduled", sentAt: null }, "2026-11-09", zone)).toBe("planned");
    expect(stateForPost({ status: "needs_approval", sentAt: null }, "2026-11-09", zone)).toBe(
      "planned",
    );
    expect(stateForPost({ status: "error", sentAt: null }, "2026-11-09", zone)).toBe("saved");
  });

  it("counts a post sent by the end of the prompt's local day as on time", () => {
    // 23:30 in Bucharest on 9 November is 21:30 UTC.
    const lateEvening = "2026-11-09T21:30:00.000Z";
    expect(stateForPost({ status: "sent", sentAt: lateEvening }, "2026-11-09", zone)).toBe("done");
    // Ten minutes past local midnight is the next day: caught up, never "late".
    const afterMidnight = "2026-11-09T22:10:00.000Z";
    expect(stateForPost({ status: "sent", sentAt: afterMidnight }, "2026-11-09", zone)).toBe(
      "caught_up",
    );
  });

  it("counts a post sent before its day (batching ahead) as done", () => {
    expect(
      stateForPost({ status: "sent", sentAt: "2026-11-07T08:00:00.000Z" }, "2026-11-09", zone),
    ).toBe("done");
  });
});

describe("isDueForCheck", () => {
  // 12:00 in Bucharest (waking hours) and 03:00 (night), both in UTC.
  const noon = new Date("2026-11-09T10:00:00.000Z");
  const night = new Date("2026-11-09T01:00:00.000Z");
  const minutesBefore = (date: Date, minutes: number) =>
    new Date(date.getTime() - minutes * 60_000);
  const base = { timeZone: zone, doneForToday: false, hasPlanned: false };

  it("reads the local hour", () => {
    expect(localHour(noon, zone)).toBe(12);
    expect(localHour(night, zone)).toBe(3);
  });

  it("checks someone never checked", () => {
    expect(isDueForCheck({ ...base, lastCheckedAt: null, now: noon })).toBe(true);
  });

  it("checks hourly in waking hours, with a few minutes of slack", () => {
    expect(isDueForCheck({ ...base, lastCheckedAt: minutesBefore(noon, 30), now: noon })).toBe(
      false,
    );
    expect(isDueForCheck({ ...base, lastCheckedAt: minutesBefore(noon, 57), now: noon })).toBe(
      true,
    );
  });

  it("checks every 3 hours at night", () => {
    expect(isDueForCheck({ ...base, lastCheckedAt: minutesBefore(night, 90), now: night })).toBe(
      false,
    );
    expect(isDueForCheck({ ...base, lastCheckedAt: minutesBefore(night, 180), now: night })).toBe(
      true,
    );
  });

  it("skips anyone done for today with nothing scheduled", () => {
    const done = { ...base, doneForToday: true, lastCheckedAt: null, now: noon };
    expect(isDueForCheck({ ...done, hasPlanned: false })).toBe(false);
    expect(isDueForCheck({ ...done, hasPlanned: true })).toBe(true);
  });
});
