import { describe, expect, it } from "vitest";
import { combinedState } from "./day-posts";

const day = { date: "2026-11-08", current: "open" as const, hasIdea: false };
const tz = "Europe/Bucharest";
const post = (status: string, sentAt: string | null = null) => ({
  status,
  sentAt: sentAt ? new Date(sentAt) : null,
});

describe("a day with posts on several channels", () => {
  it("is posted as soon as any one of its posts is published", () => {
    expect(combinedState([post("draft"), post("sent", "2026-11-08T10:00:00Z")], day, tz)).toBe(
      "done",
    );
  });

  it("prefers on time over late when posts went out on different days", () => {
    expect(
      combinedState(
        [post("sent", "2026-11-09T10:00:00Z"), post("sent", "2026-11-08T10:00:00Z")],
        day,
        tz,
      ),
    ).toBe("done");
    expect(combinedState([post("sent", "2026-11-09T10:00:00Z")], day, tz)).toBe("caught_up");
  });

  it("is scheduled when one post waits to go out, and saved when all are drafts", () => {
    expect(combinedState([post("draft"), post("scheduled")], day, tz)).toBe("planned");
    expect(combinedState([post("draft"), post("error")], day, tz)).toBe("saved");
  });

  it("counts an idea as saved, and otherwise keeps a day off or a waiting day", () => {
    expect(combinedState([], { ...day, hasIdea: true }, tz)).toBe("saved");
    expect(combinedState([], { ...day, current: "paused" }, tz)).toBe("paused");
    expect(combinedState([], { ...day, current: "missed" }, tz)).toBe("missed");
    expect(combinedState([], { ...day, current: "done" }, tz)).toBe("open");
  });
});
