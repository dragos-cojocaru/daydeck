import { BufferRateLimitError, fetchAccount } from "@daydeck/buffer";
import { eq, schema } from "@daydeck/db";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { API_URL, connect, createUser, FakeTokenServer, setupDeps, T0 } from "@/test/buffer-fakes";
import { callBuffer } from "./call";
import type { BufferDeps } from "./deps";
import { BufferReconnectRequiredError } from "./errors";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());

let deps: BufferDeps;
let close: () => Promise<void>;
let fake: FakeTokenServer;
let userId: string;

const account = {
  id: "acc-1",
  name: "Ana",
  avatar: "",
  timezone: "Europe/Bucharest",
  organizations: [{ id: "org-1", name: "Org" }],
};

beforeEach(async () => {
  ({ deps, close } = await setupDeps());
  fake = new FakeTokenServer();
  server.use(fake.handler());
  userId = (await createUser(deps)).id;
  await connect(deps, userId, fake.issue(), 60 * 60 * 1000);
});
afterEach(async () => {
  server.resetHandlers();
  await close();
});

async function status() {
  const [row] = await deps.db
    .select({
      status: schema.bufferConnections.status,
      reason: schema.bufferConnections.reconnectReason,
    })
    .from(schema.bufferConnections)
    .where(eq(schema.bufferConnections.userId, userId));
  return row;
}

describe("callBuffer", () => {
  it("refreshes once and retries when Buffer rejects a token early", async () => {
    const seen: string[] = [];
    server.use(
      http.post(API_URL, ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        seen.push(auth);
        if (auth === "Bearer at-1") return new HttpResponse(null, { status: 401 });
        return HttpResponse.json({ data: { account } });
      }),
    );

    await expect(callBuffer(deps, userId, fetchAccount)).resolves.toEqual(account);
    expect(seen).toEqual(["Bearer at-1", "Bearer at-2"]);
    expect(fake.refreshCalls).toBe(1);
  });

  it("asks for a reconnect when the refreshed token is rejected too", async () => {
    server.use(http.post(API_URL, () => new HttpResponse(null, { status: 401 })));
    const error = await callBuffer(deps, userId, fetchAccount).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BufferReconnectRequiredError);
    expect(await status()).toEqual({ status: "needs_reconnect", reason: "unauthorized" });
  });

  it("asks for a reconnect when a scope is missing", async () => {
    server.use(
      http.post(API_URL, () =>
        HttpResponse.json({
          errors: [{ message: "Missing scope", extensions: { code: "INSUFFICIENT_SCOPE" } }],
        }),
      ),
    );
    const error = await callBuffer(deps, userId, fetchAccount).catch((e: unknown) => e);
    expect(error).toMatchObject({ reason: "insufficient_scope" });
    expect(await status()).toEqual({ status: "needs_reconnect", reason: "insufficient_scope" });
  });

  it("passes a 429 through untouched and records the exhausted window", async () => {
    server.use(
      http.post(API_URL, () =>
        HttpResponse.json(
          {
            errors: [
              { message: "Too many", extensions: { code: "RATE_LIMIT_EXCEEDED", window: "15m" } },
            ],
          },
          {
            status: 429,
            headers: {
              "Retry-After": "120",
              RateLimit: '"100-in-15min";r=0;t=120',
              "RateLimit-Policy": '"100-in-15min";q=100;w=900',
            },
          },
        ),
      ),
    );

    const error = await callBuffer(deps, userId, fetchAccount).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BufferRateLimitError);
    expect(error).toMatchObject({ retryAfterSeconds: 120 });
    // A rate limit is not an auth problem: the connection stays active.
    expect(await status()).toEqual({ status: "active", reason: null });

    const snapshots = await deps.db.select().from(schema.rateLimitSnapshots);
    expect(snapshots).toEqual([
      {
        windowSeconds: 900,
        quota: 100,
        remaining: 0,
        resetAt: new Date(T0.getTime() + 120_000),
        capturedAt: T0,
      },
    ]);
  });

  it("never lets an older snapshot overwrite a newer one", async () => {
    let remaining = 50;
    server.use(
      http.post(API_URL, () =>
        HttpResponse.json(
          { data: { account } },
          { headers: { RateLimit: `"100-in-15min";r=${remaining};t=600` } },
        ),
      ),
    );
    deps.now = () => new Date(T0.getTime() + 60_000);
    await callBuffer(deps, userId, fetchAccount);

    remaining = 80;
    deps.now = () => T0;
    await callBuffer(deps, userId, fetchAccount);

    const [snapshot] = await deps.db.select().from(schema.rateLimitSnapshots);
    expect(snapshot?.remaining).toBe(50);
  });
});
