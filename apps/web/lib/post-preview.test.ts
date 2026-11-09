import { describe, expect, it } from "vitest";
import { bufferPostLink, postPreview } from "./post-preview";

describe("post preview", () => {
  it("puts the post on one line and keeps short posts whole", () => {
    expect(postPreview("  Day 1:\n\n  what I do,   in one line  ")).toBe(
      "Day 1: what I do, in one line",
    );
    expect(postPreview("   \n ")).toBeNull();
  });

  it("cuts at 100 characters, ending in …, and never splits an emoji", () => {
    const cut = postPreview("🚀".repeat(150)) ?? "";
    expect(Array.from(cut)).toHaveLength(100);
    expect(cut.endsWith("…")).toBe(true);
    expect(Array.from(cut.slice(0, -1)).every((char) => char === "🚀")).toBe(true);
    expect(postPreview("a".repeat(100))).toBe("a".repeat(100));
  });

  it("links a published post to its page in Buffer's Insights", () => {
    expect(bufferPostLink("6aef6af0e29c69a1719741ee", "6af1dc95bd51695ba458d90e")).toBe(
      "https://publish.buffer.com/insights/6aef6af0e29c69a1719741ee/posts/6af1dc95bd51695ba458d90e",
    );
  });
});
