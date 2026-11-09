import { describe, expect, it } from "vitest";
import {
  addDays,
  dayOneFor,
  firstPromptDay,
  isValidTimeZone,
  localDateOf,
  localDayRange,
  positionOn,
  promptDates,
  scheduleTimeZone,
  timingOf,
  weekdayOf,
  zonedTimeToUtc,
} from "./day-engine";

const HOUR = 60 * 60 * 1000;

describe("local dates", () => {
  it("reads the calendar date in the given time zone", () => {
    const instant = new Date("2026-11-08T23:30:00Z");
    expect(localDateOf(instant, "UTC")).toBe("2026-11-08");
    expect(localDateOf(instant, "Europe/Bucharest")).toBe("2026-11-09");
    expect(localDateOf(instant, "America/Los_Angeles")).toBe("2026-11-08");
  });

  it("adds days across months, years and leap days", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("knows the weekday and valid time zones", () => {
    expect(weekdayOf("2026-11-09")).toBe(1); // Monday
    expect(weekdayOf("2026-11-14")).toBe(6); // Saturday
    expect(isValidTimeZone("Europe/Bucharest")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});

describe("daylight saving", () => {
  it("gives a 23-hour day when clocks go forward and a 25-hour day when they go back", () => {
    const spring = localDayRange("2026-03-29", "Europe/Bucharest");
    expect(spring.end.getTime() - spring.start.getTime()).toBe(23 * HOUR);
    const autumn = localDayRange("2026-10-25", "Europe/Bucharest");
    expect(autumn.end.getTime() - autumn.start.getTime()).toBe(25 * HOUR);
    const newYork = localDayRange("2026-11-01", "America/New_York");
    expect(newYork.end.getTime() - newYork.start.getTime()).toBe(25 * HOUR);
  });

  it("finds local midnight in UTC on both sides of a change", () => {
    expect(localDayRange("2026-10-25", "Europe/Bucharest").start.toISOString()).toBe(
      "2026-10-24T21:00:00.000Z",
    );
    expect(localDayRange("2026-10-26", "Europe/Bucharest").start.toISOString()).toBe(
      "2026-10-25T22:00:00.000Z",
    );
  });

  it("handles a half-hour daylight-saving shift (Lord Howe Island)", () => {
    const day = localDayRange("2026-10-04", "Australia/Lord_Howe");
    expect(day.end.getTime() - day.start.getTime()).toBe(23.5 * HOUR);
  });

  it("moves a time inside a spring-forward gap to just after it", () => {
    // In New York, 02:30 on 8 March 2026 does not exist; clocks jump from 02:00 to 03:00.
    expect(
      zonedTimeToUtc("2026-03-08", { hours: 2, minutes: 30 }, "America/New_York").toISOString(),
    ).toBe("2026-03-08T07:30:00.000Z");
    expect(
      zonedTimeToUtc("2026-03-08", { hours: 9, minutes: 0 }, "America/New_York").toISOString(),
    ).toBe("2026-03-08T13:00:00.000Z");
  });
});

describe("schedules", () => {
  it("gives every day a prompt for daily challenges", () => {
    expect(promptDates("2026-11-13", "daily", 4)).toEqual([
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
      "2026-11-16",
    ]);
  });

  it("skips weekends for weekday challenges", () => {
    expect(promptDates("2026-11-12", "weekdays", 4)).toEqual([
      "2026-11-12",
      "2026-11-13",
      "2026-11-16",
      "2026-11-17",
    ]);
  });

  it("moves a weekend start of a weekday challenge to Monday", () => {
    expect(firstPromptDay("2026-11-14", "weekdays")).toBe("2026-11-16");
    expect(promptDates("2026-11-15", "weekdays", 1)).toEqual(["2026-11-16"]);
  });

  it("starts fixed challenges on their date and rolling ones on the day each person joins", () => {
    const joinedAt = new Date("2026-11-10T23:30:00Z");
    expect(
      dayOneFor({ startMode: "fixed", startDate: "2026-11-09" }, joinedAt, "Europe/Bucharest"),
    ).toBe("2026-11-09");
    // 23:30 UTC is already the 11th in Bucharest.
    expect(
      dayOneFor({ startMode: "rolling", startDate: "2026-11-01" }, joinedAt, "Europe/Bucharest"),
    ).toBe("2026-11-11");
    expect(
      dayOneFor({ startMode: "rolling", startDate: "2026-11-01" }, joinedAt, "America/Chicago"),
    ).toBe("2026-11-10");
    // Joining before a rolling challenge opens starts on its opening day.
    expect(dayOneFor({ startMode: "rolling", startDate: "2026-11-20" }, joinedAt, "UTC")).toBe(
      "2026-11-20",
    );
  });

  it("uses the challenge's clock for fixed starts and the person's for rolling ones", () => {
    expect(scheduleTimeZone({ startMode: "fixed", timezone: "Europe/London" }, "Asia/Tokyo")).toBe(
      "Europe/London",
    );
    expect(
      scheduleTimeZone({ startMode: "rolling", timezone: "Europe/London" }, "Asia/Tokyo"),
    ).toBe("Asia/Tokyo");
  });
});

describe("position in a schedule", () => {
  const dates = promptDates("2026-11-12", "weekdays", 3); // Thu, Fri, Mon

  it("reports before, prompt days, rest days and after", () => {
    expect(positionOn("2026-11-11", dates)).toEqual({ kind: "before", startsOn: "2026-11-12" });
    expect(positionOn("2026-11-12", dates)).toEqual({
      kind: "prompt",
      index: 0,
      date: "2026-11-12",
    });
    expect(positionOn("2026-11-14", dates)).toEqual({
      kind: "rest",
      date: "2026-11-14",
      nextIndex: 2,
      nextDate: "2026-11-16",
    });
    expect(positionOn("2026-11-16", dates)).toEqual({
      kind: "prompt",
      index: 2,
      date: "2026-11-16",
    });
    expect(positionOn("2026-11-17", dates)).toEqual({ kind: "after", lastDate: "2026-11-16" });
  });
});

describe("timing", () => {
  it("counts a post sent before the end of its local day as on time, later as caught up", () => {
    const tz = "Europe/Bucharest";
    expect(timingOf(new Date("2026-11-12T21:59:00Z"), "2026-11-12", tz)).toBe("on_time");
    expect(timingOf(new Date("2026-11-12T22:00:00Z"), "2026-11-12", tz)).toBe("late");
    expect(timingOf(new Date("2026-11-11T12:00:00Z"), "2026-11-12", tz)).toBe("early");
  });
});
