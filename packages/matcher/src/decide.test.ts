import { describe, expect, it } from "vitest";
import {
  AUTO_MATCH_CHECK_THRESHOLD,
  AUTO_MATCH_CHOICE_THRESHOLD,
  DEFAULT_THRESHOLDS,
  decide,
  SUGGEST_THRESHOLD,
} from "./decide";
import type { MatchResult } from "./types";

function result(
  confidence: number,
  check?: number,
  promptId: string | null = "day-3",
): MatchResult {
  return check === undefined
    ? { promptId, confidence, perPrompt: {} }
    : { promptId, confidence, perPrompt: {}, check };
}

describe("decide", () => {
  it("uses the thresholds from the product plan", () => {
    expect(AUTO_MATCH_CHOICE_THRESHOLD).toBe(0.75);
    expect(AUTO_MATCH_CHECK_THRESHOLD).toBe(0.7);
    expect(SUGGEST_THRESHOLD).toBe(0.4);
    expect(DEFAULT_THRESHOLDS).toEqual({ autoChoice: 0.75, autoCheck: 0.7, suggest: 0.4 });
  });

  it.each([
    // [choice confidence, double-check, expected kind]
    [0.9, 0.95, "auto"],
    [0.75, 0.7, "auto"], // both exactly on the auto-match thresholds
    [0.74, 0.95, "suggest"], // choice just below 0.75
    [0.95, 0.69, "suggest"], // check just below 0.7
    [0.4, 0.4, "suggest"], // both exactly on the suggest threshold
    [0.6, 0.5, "suggest"],
    [0.39, 0.95, "none"], // choice below 0.4
    [0.95, 0.39, "none"], // the double-check says no
    [0.1, 0.1, "none"],
  ] as const)("choice %s with check %s is %s", (confidence, check, kind) => {
    const decision = decide(result(confidence, check));
    expect(decision.kind).toBe(kind);
    expect(decision.promptId).toBe(kind === "none" ? null : "day-3");
    expect(decision.confidence).toBe(confidence);
  });

  it("returns none when none of these wins, however confident", () => {
    expect(decide(result(0.99, 0.99, null))).toEqual({
      kind: "none",
      promptId: null,
      confidence: 0.99,
    });
  });

  it("never auto-matches without a double-check score", () => {
    expect(decide(result(0.99)).kind).toBe("suggest");
    expect(decide(result(0.3)).kind).toBe("none");
  });

  it("treats a score that is not a number as 0 and keeps scores between 0 and 1", () => {
    expect(decide(result(Number.NaN, 0.9)).kind).toBe("none");
    expect(decide(result(0.9, Number.NaN)).kind).toBe("none");
    expect(decide(result(1.5, 2)).confidence).toBe(1);
  });

  it("accepts other thresholds, for the evaluation sweep", () => {
    const strict = { ...DEFAULT_THRESHOLDS, autoChoice: 0.9 };
    expect(decide(result(0.85, 0.9), strict).kind).toBe("suggest");
    expect(decide(result(0.95, 0.9), strict).kind).toBe("auto");
  });
});
