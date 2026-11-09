import { describe, expect, it } from "vitest";
import { relativeTime } from "./relative-time";

const now = Date.parse("2026-11-09T20:00:00Z");
const ago = (ms: number) => now - ms;

describe("relative time", () => {
  it("says just now under a minute, then counts", () => {
    expect(relativeTime(ago(0), now)).toBe("just now");
    expect(relativeTime(ago(59_000), now)).toBe("just now");
    expect(relativeTime(ago(60_000), now)).toBe("1 minute ago");
    expect(relativeTime(ago(5 * 60_000), now, "short")).toBe("5 min. ago");
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe("3 hours ago");
    expect(relativeTime(ago(3 * 86_400_000), now)).toBe("3 days ago");
  });

  it("never shows the future, even with a clock a little ahead", () => {
    expect(relativeTime(now + 30_000, now)).toBe("just now");
  });
});
