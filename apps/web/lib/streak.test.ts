import { describe, expect, it } from "vitest";
import { bestStreak, streakText } from "./streak";

describe("best streak", () => {
  it("counts the longest run of posted days, late posts included", () => {
    expect(bestStreak([])).toBe(0);
    expect(bestStreak(["open", "saved", "planned"])).toBe(0);
    expect(bestStreak(["done", "open", "done", "caught_up", "done", "missed"])).toBe(3);
  });

  it("reads well for one day and for several", () => {
    expect(streakText(1)).toBe("Best streak: 1 day");
    expect(streakText(4)).toBe("Best streak: 4 days in a row");
  });
});
