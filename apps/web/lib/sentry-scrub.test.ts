import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { scrubEvent } from "./sentry-scrub";

describe("scrubEvent", () => {
  it("redacts auth headers, cookies and nested token fields", () => {
    const event = {
      type: undefined,
      request: { headers: { Authorization: "Bearer abc", "user-agent": "x" }, cookies: { s: "1" } },
      extra: { connection: { refreshToken: "r1", status: "active" } },
    } as ErrorEvent;

    const scrubbed = scrubEvent(event);

    expect(scrubbed.request?.headers).toEqual({ Authorization: "[redacted]", "user-agent": "x" });
    expect(scrubbed.request?.cookies).toBe("[redacted]");
    expect(scrubbed.extra).toEqual({
      connection: { refreshToken: "[redacted]", status: "active" },
    });
  });
});
