import { describe, expect, it } from "vitest";
import { MIN_LEAD_MS, planWeek, type ScheduleDay, type SlotChannel, slotsOn } from "./slot-finder";

const everyDay = (times: string[], paused: ScheduleDay["day"][] = []): ScheduleDay[] =>
  (["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).map((day) => ({
    day,
    paused: paused.includes(day),
    times,
  }));

const linkedIn: SlotChannel = {
  id: "li",
  timezone: "Europe/Bucharest",
  schedule: everyDay(["09:00", "17:30"]),
};
const bluesky: SlotChannel = {
  id: "bs",
  timezone: "Europe/Bucharest",
  schedule: everyDay(["12:00"], ["sat", "sun"]),
};

// Monday 9 November 2026, 06:00 in Bucharest.
const now = new Date("2026-11-09T04:00:00Z");

describe("slotsOn", () => {
  it("turns schedule times into instants in the channel's time zone", () => {
    expect(slotsOn(linkedIn, "2026-11-09").map((d) => d.toISOString())).toEqual([
      "2026-11-09T07:00:00.000Z",
      "2026-11-09T15:30:00.000Z",
    ]);
  });

  it("gives nothing on a paused day and ignores broken times", () => {
    expect(slotsOn(bluesky, "2026-11-14")).toEqual([]);
    const odd: SlotChannel = {
      id: "x",
      timezone: "UTC",
      schedule: everyDay(["25:00", "nine", "08:05"]),
    };
    expect(slotsOn(odd, "2026-11-09").map((d) => d.toISOString())).toEqual([
      "2026-11-09T08:05:00.000Z",
    ]);
  });
});

describe("planWeek", () => {
  it("suggests the first free slot on each prompt's date, preferring the first channel", () => {
    const rows = planWeek({
      prompts: [
        { entryId: "d1", date: "2026-11-09" },
        { entryId: "d2", date: "2026-11-10" },
      ],
      channels: [linkedIn, bluesky],
      now,
      busy: [],
    });
    expect(
      rows.map((row) => [
        row.entryId,
        row.suggested?.channelId,
        row.suggested?.dueAt.toISOString(),
      ]),
    ).toEqual([
      ["d1", "li", "2026-11-09T07:00:00.000Z"],
      ["d2", "li", "2026-11-10T07:00:00.000Z"],
    ]);
    expect(rows[0]?.options).toHaveLength(3);
  });

  it("skips past slots, slots too soon to review, and slots already taken in Buffer", () => {
    const rows = planWeek({
      prompts: [{ entryId: "d1", date: "2026-11-09" }],
      channels: [linkedIn],
      // 08:50 in Bucharest: 09:00 is less than 15 minutes away.
      now: new Date(new Date("2026-11-09T07:00:00Z").getTime() - MIN_LEAD_MS + 60_000),
      busy: [{ channelId: "li", dueAt: new Date("2026-11-09T15:30:00Z") }],
    });
    expect(rows[0]?.suggested).toBeNull();
    expect(rows[0]?.options).toEqual([]);
  });

  it("never gives two prompts the same slot", () => {
    const rows = planWeek({
      prompts: [
        { entryId: "a", date: "2026-11-09" },
        { entryId: "b", date: "2026-11-09" },
        { entryId: "c", date: "2026-11-09" },
        { entryId: "d", date: "2026-11-09" },
      ],
      channels: [linkedIn, bluesky],
      now,
      busy: [],
    });
    const picked = rows.map(
      (row) => row.suggested && `${row.suggested.channelId}@${row.suggested.dueAt.toISOString()}`,
    );
    expect(picked).toEqual([
      "li@2026-11-09T07:00:00.000Z",
      "li@2026-11-09T15:30:00.000Z",
      "bs@2026-11-09T10:00:00.000Z",
      null,
    ]);
  });

  it("leaves out channels that are at their daily limit", () => {
    const rows = planWeek({
      prompts: [{ entryId: "d1", date: "2026-11-09" }],
      channels: [linkedIn, bluesky],
      now,
      busy: [],
      isFull: (channelId) => channelId === "li",
    });
    expect(rows[0]?.suggested?.channelId).toBe("bs");
  });

  it("orders rows by date even when prompts arrive out of order", () => {
    const rows = planWeek({
      prompts: [
        { entryId: "late", date: "2026-11-11" },
        { entryId: "early", date: "2026-11-09" },
      ],
      channels: [linkedIn],
      now,
      busy: [],
    });
    expect(rows.map((row) => row.entryId)).toEqual(["early", "late"]);
  });
});
