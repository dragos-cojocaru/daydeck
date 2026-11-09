import { HttpResponse, http } from "msw/http";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  BufferApiError,
  BufferInsufficientScopeError,
  BufferRateLimitError,
  BufferUnauthorizedError,
} from "./errors";
import { fetchAccount } from "./queries/account";
import { fetchChannels } from "./queries/channels";

const API = "https://api.buffer.com";
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const account = {
  id: "acc-1",
  name: "Ana",
  avatar: "https://example.com/a.png",
  timezone: "Europe/Bucharest",
  organizations: [{ id: "org-1", name: "Ana's org" }],
};

function respondWith(response: () => Response) {
  server.use(http.post(API, () => response()));
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("expected the call to fail");
    },
    (error: unknown) => error,
  );
}

describe("request", () => {
  it("sends the bearer token and the query, and returns typed data", async () => {
    let seen: { authorization: string | null; body: { query: string } } | undefined;
    server.use(
      http.post(API, async ({ request }) => {
        seen = {
          authorization: request.headers.get("authorization"),
          body: (await request.json()) as { query: string },
        };
        return HttpResponse.json({ data: { account } });
      }),
    );

    await expect(fetchAccount({ accessToken: "at-1" })).resolves.toEqual(account);
    expect(seen?.authorization).toBe("Bearer at-1");
    expect(seen?.body.query).toContain("query Account");
  });

  it("reports rate-limit headers from every response", async () => {
    respondWith(() =>
      HttpResponse.json(
        { data: { account } },
        {
          headers: {
            RateLimit: '"100-in-15min";r=42;t=600',
            "RateLimit-Policy": '"100-in-15min";q=100;w=900',
          },
        },
      ),
    );
    const onRateLimit = vi.fn();
    await fetchAccount({ accessToken: "at-1", onRateLimit });
    expect(onRateLimit).toHaveBeenCalledWith([
      { policy: "100-in-15min", windowSeconds: 900, quota: 100, remaining: 42, resetSeconds: 600 },
    ]);
  });

  it("turns a 429 into a typed error carrying Retry-After and the window", async () => {
    respondWith(() =>
      HttpResponse.json(
        {
          errors: [
            {
              message: "Too many requests from this client. Please try again later.",
              extensions: { code: "RATE_LIMIT_EXCEEDED", window: "15m" },
            },
          ],
        },
        {
          status: 429,
          headers: {
            "Retry-After": "753",
            RateLimit: '"100-in-15min"; r=0; t=753',
            "RateLimit-Policy": '"100-in-15min"; q=100; w=900',
          },
        },
      ),
    );
    const onRateLimit = vi.fn();
    const error = await failure(fetchAccount({ accessToken: "at-1", onRateLimit }));
    expect(error).toBeInstanceOf(BufferRateLimitError);
    expect(error).toMatchObject({ retryAfterSeconds: 753, window: "15m" });
    // The exhausted window is still recorded, so background jobs can hold off.
    expect(onRateLimit).toHaveBeenCalledOnce();
  });

  it("falls back to the exhausted window's reset when Retry-After is missing", async () => {
    respondWith(() =>
      HttpResponse.json(
        { errors: [{ message: "slow down", extensions: { code: "RATE_LIMIT_EXCEEDED" } }] },
        { status: 429, headers: { RateLimit: '"500-in-1day";r=0;t=4000' } },
      ),
    );
    const error = await failure(fetchAccount({ accessToken: "at-1" }));
    expect(error).toMatchObject({ retryAfterSeconds: 4000 });
  });

  it("maps HTTP 401 and GraphQL UNAUTHORIZED to BufferUnauthorizedError", async () => {
    respondWith(() => new HttpResponse("Unauthorized", { status: 401 }));
    expect(await failure(fetchAccount({ accessToken: "bad" }))).toBeInstanceOf(
      BufferUnauthorizedError,
    );

    respondWith(() =>
      HttpResponse.json({
        data: null,
        errors: [{ message: "Not authorized", extensions: { code: "UNAUTHORIZED" } }],
      }),
    );
    expect(await failure(fetchAccount({ accessToken: "bad" }))).toBeInstanceOf(
      BufferUnauthorizedError,
    );
  });

  it("maps a missing scope to BufferInsufficientScopeError", async () => {
    respondWith(() =>
      HttpResponse.json({
        errors: [{ message: "Missing scope", extensions: { code: "INSUFFICIENT_SCOPE" } }],
      }),
    );
    expect(await failure(fetchChannels("org-1", { accessToken: "at" }))).toBeInstanceOf(
      BufferInsufficientScopeError,
    );

    respondWith(() =>
      HttpResponse.json({
        errors: [
          { message: "Token lacks the posts:read scope", extensions: { code: "FORBIDDEN" } },
        ],
      }),
    );
    expect(await failure(fetchChannels("org-1", { accessToken: "at" }))).toBeInstanceOf(
      BufferInsufficientScopeError,
    );
  });

  it("keeps other GraphQL errors as BufferApiError with their code", async () => {
    respondWith(() =>
      HttpResponse.json({ errors: [{ message: "Nope", extensions: { code: "NOT_FOUND" } }] }),
    );
    const error = await failure(fetchAccount({ accessToken: "at" }));
    expect(error).toBeInstanceOf(BufferApiError);
    expect(error).toMatchObject({ code: "NOT_FOUND", isRetryable: false });
  });

  it("marks server errors as retryable", async () => {
    respondWith(() => new HttpResponse("oops", { status: 503 }));
    const error = await failure(fetchAccount({ accessToken: "at" }));
    expect(error).toBeInstanceOf(BufferApiError);
    expect(error).toMatchObject({ status: 503, isRetryable: true });
  });

  it("rejects data that does not match what the app relies on", async () => {
    respondWith(() => HttpResponse.json({ data: { account: { id: "" } } }));
    const error = await failure(fetchAccount({ accessToken: "at" }));
    expect(error).toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
