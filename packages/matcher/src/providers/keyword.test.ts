import { describe, expect, it } from "vitest";
import type { MatchCandidate } from "../types";
import { KeywordMatcher, keywords } from "./keyword";

const candidates: MatchCandidate[] = [
  {
    id: "tool",
    title: "A tool you would be lost without",
    description: "Share one tool, habit or template, and how it fits into your week.",
  },
  {
    id: "mistake",
    title: "A mistake that taught you something",
    description: "Tell a short story about something that went wrong, and what changed after.",
  },
];

describe("keywords", () => {
  it("drops short words, stop words, accents and a plural s", () => {
    expect([...keywords("The Templates I use: café notes, and my week!")]).toEqual([
      "template",
      "use",
      "cafe",
      "note",
      "week",
    ]);
  });
});

describe("KeywordMatcher", () => {
  const matcher = new KeywordMatcher();

  it("picks the candidate that shares the most words with the post", async () => {
    const result = await matcher.match({
      postText: "My mistake last month taught me something: a short story of what went wrong.",
      candidates,
    });
    expect(result.promptId).toBe("mistake");
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.check).toBeGreaterThan(0);
    expect(Object.keys(result.perPrompt)).toEqual(["tool", "mistake"]);
  });

  it("returns none when no candidate shares enough words", async () => {
    const result = await matcher.match({ postText: "Spring sale starts tomorrow!", candidates });
    expect(result.promptId).toBeNull();
    expect(result.check).toBeUndefined();
  });

  it("gives the same answer every time", async () => {
    const input = { postText: "One tool and one template for the week", candidates };
    expect(await matcher.match(input)).toEqual(await matcher.match(input));
  });

  it("returns none without candidates or without post text", async () => {
    expect((await matcher.match({ postText: "Hello", candidates: [] })).promptId).toBeNull();
    expect(await matcher.match({ postText: "  ", candidates })).toEqual({
      promptId: null,
      confidence: 1,
      perPrompt: { tool: 0, mistake: 0 },
    });
  });

  it("rejects a candidate list with the same prompt twice", async () => {
    const [first] = candidates;
    if (!first) throw new Error("fixture missing");
    await expect(matcher.match({ postText: "tool", candidates: [first, first] })).rejects.toThrow(
      "appears more than once",
    );
  });
});
