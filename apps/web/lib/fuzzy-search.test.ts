import { describe, expect, it } from "vitest";
import { editDistance, fuzzySearch } from "./fuzzy-search";

const templates = [
  { title: "Behind the scenes", description: "Show how your work gets made." },
  { title: "A tool you use every day", description: "Share one tool and why it helps." },
  { title: "Ask your audience", description: "Start a conversation with a question." },
  { title: "Café recommendations", description: "Your favourite place to work from." },
  { title: "Lessons learned", description: "A mistake and what it taught you." },
];
const search = (query: string) =>
  fuzzySearch(templates, query, (t) => [t.title, t.description]).map((t) => t.title);

describe("fuzzy search", () => {
  it("returns everything for an empty query", () => {
    expect(search("  ")).toHaveLength(templates.length);
  });

  it("matches the start of words, in any order", () => {
    expect(search("scen behind")).toEqual(["Behind the scenes"]);
  });

  it("forgives a small typo", () => {
    expect(search("behnd")).toEqual(["Behind the scenes"]);
    expect(search("audeince")).toEqual(["Ask your audience"]);
  });

  it("ignores accents and letter case", () => {
    expect(search("CAFE")).toEqual(["Café recommendations"]);
  });

  it("needs every word to match", () => {
    expect(search("tool audience")).toEqual([]);
  });

  it("does not guess on very short words", () => {
    expect(search("tol")).toEqual([]);
  });

  it("ranks a title match above a description match", () => {
    expect(search("mistake lesson")).toEqual(["Lessons learned"]);
    expect(search("work")[0]).toBe("Behind the scenes");
  });

  it("counts a swap of two letters as one typo", () => {
    expect(editDistance("tool", "tolo")).toBe(1);
    expect(editDistance("kitten", "sitting")).toBe(3);
  });
});
