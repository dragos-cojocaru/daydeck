import { describe, expect, it } from "vitest";
import { zoneNowSentence, zoneOffset } from "./time-zones";

// 7 November 2026, 20:51 UTC: winter time in Europe, so Bucharest is GMT+2.
const at = new Date("2026-11-07T20:51:00.000Z");

describe("time zone labels", () => {
  it("names the offset, with half hours and summer time", () => {
    expect(zoneOffset("Europe/Bucharest", at)).toBe("GMT+2");
    expect(zoneOffset("Asia/Kolkata", at)).toBe("GMT+5:30");
    expect(zoneOffset("UTC", at)).toBe("GMT");
    expect(zoneOffset("Europe/Bucharest", new Date("2026-07-01T12:00:00Z"))).toBe("GMT+3");
  });

  it("says the day and time there", () => {
    expect(zoneNowSentence("Asia/Tokyo", at)).toBe("It is 05:51 on Sunday 8 November there now.");
  });
});
