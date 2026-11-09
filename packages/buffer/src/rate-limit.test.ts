import { describe, expect, it } from "vitest";
import { parseRateLimitHeaders, parseRetryAfter } from "./rate-limit";

function headersOf(entries: [string, string][]): Headers {
  const headers = new Headers();
  for (const [name, value] of entries) headers.append(name, value);
  return headers;
}

describe("parseRateLimitHeaders", () => {
  it("reads the headers api.buffer.com really sends", () => {
    // Captured from a live response in November 2026; only the partition keys are shortened.
    const headers = headersOf([
      ["ratelimit", '"15m"; r=101; t=769, "24h"; r=516; t=86269, "30d"; r=15091; t=2591869'],
      [
        "ratelimit-policy",
        '"15m"; q=110; w=900; pk=:abc:, "24h"; q=525; w=86400; pk=:abc:, "30d"; q=15100; w=2592000; pk=:abc:',
      ],
    ]);
    expect(parseRateLimitHeaders(headers)).toEqual([
      { policy: "15m", windowSeconds: 900, quota: 110, remaining: 101, resetSeconds: 769 },
      { policy: "24h", windowSeconds: 86_400, quota: 525, remaining: 516, resetSeconds: 86_269 },
      {
        policy: "30d",
        windowSeconds: 2_592_000,
        quota: 15_100,
        remaining: 15_091,
        resetSeconds: 2_591_869,
      },
    ]);
  });

  it("skips a short-named window when the policy header is missing, since the quota is unknown", () => {
    const headers = headersOf([["ratelimit", '"15m"; r=101; t=769']]);
    expect(parseRateLimitHeaders(headers)).toEqual([]);
  });

  it("joins RateLimit and RateLimit-Policy on the policy name, one header per window", () => {
    // The format from Buffer's API limits guide. Repeated headers arrive joined with ", ".
    const headers = headersOf([
      ["RateLimit", '"100-in-15min";r=98;t=897'],
      ["RateLimit", '"500-in-1day"; r=498; t=86397'],
      ["RateLimit", '"15000-in-30days";r=14969;t=696980'],
      ["RateLimit-Policy", '"100-in-15min";q=100;w=900;pk=:ZjJjZjVmNzM5M2Zm:'],
      ["RateLimit-Policy", '"500-in-1day"; q=500; w=86400; pk=:ZjJjZjVmNzM5M2Zm:'],
      ["RateLimit-Policy", '"15000-in-30days";q=15000;w=2592000;pk=:ZjJjZjVmNzM5M2Zm:'],
    ]);

    expect(parseRateLimitHeaders(headers)).toEqual([
      { policy: "100-in-15min", windowSeconds: 900, quota: 100, remaining: 98, resetSeconds: 897 },
      {
        policy: "500-in-1day",
        windowSeconds: 86_400,
        quota: 500,
        remaining: 498,
        resetSeconds: 86_397,
      },
      {
        policy: "15000-in-30days",
        windowSeconds: 2_592_000,
        quota: 15_000,
        remaining: 14_969,
        resetSeconds: 696_980,
      },
    ]);
  });

  it("reads a 429's exhausted window", () => {
    const headers = headersOf([
      ["ratelimit", '"100-in-15min"; r=0; t=753'],
      ["ratelimit-policy", '"100-in-15min"; q=100; w=900; pk=:ZjJj:'],
    ]);
    expect(parseRateLimitHeaders(headers)).toEqual([
      { policy: "100-in-15min", windowSeconds: 900, quota: 100, remaining: 0, resetSeconds: 753 },
    ]);
  });

  it("infers quota and window from the name when the policy header is missing", () => {
    const headers = headersOf([["RateLimit", '"25-in-1day";r=20;t=100, "10-in-15min";r=9;t=5']]);
    expect(parseRateLimitHeaders(headers)).toEqual([
      { policy: "25-in-1day", windowSeconds: 86_400, quota: 25, remaining: 20, resetSeconds: 100 },
      { policy: "10-in-15min", windowSeconds: 900, quota: 10, remaining: 9, resetSeconds: 5 },
    ]);
  });

  it("skips members it cannot read and returns nothing without headers", () => {
    expect(parseRateLimitHeaders(new Headers())).toEqual([]);
    const headers = headersOf([["RateLimit", '"mystery";r=1, "100-in-15min";r=oops;t=1']]);
    expect(parseRateLimitHeaders(headers)).toEqual([]);
  });
});

describe("parseRetryAfter", () => {
  it("reads seconds and HTTP dates", () => {
    const now = Date.UTC(2026, 10, 8, 12, 0, 0);
    expect(parseRetryAfter("753")).toBe(753);
    expect(parseRetryAfter("Sun, 08 Nov 2026 12:01:30 GMT", now)).toBe(90);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
  });
});
