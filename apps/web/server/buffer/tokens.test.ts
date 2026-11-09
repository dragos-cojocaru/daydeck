import { BufferApiError } from "@daydeck/buffer";
import { eq, schema } from "@daydeck/db";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { connect, createUser, FakeTokenServer, setupDeps } from "@/test/buffer-fakes";
import type { BufferDeps } from "./deps";
import { BufferNotConnectedError, BufferReconnectRequiredError } from "./errors";
import { getAccessToken, saveGrant } from "./tokens";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());

let deps: BufferDeps;
let close: () => Promise<void>;
let fake: FakeTokenServer;
let userId: string;

beforeEach(async () => {
  ({ deps, close } = await setupDeps());
  fake = new FakeTokenServer();
  server.use(fake.handler());
  userId = (await createUser(deps)).id;
});
afterEach(async () => {
  server.resetHandlers();
  await close();
});

async function connectionRow() {
  const [row] = await deps.db
    .select()
    .from(schema.bufferConnections)
    .where(eq(schema.bufferConnections.userId, userId));
  return row;
}

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

describe("token vault", () => {
  it("stores tokens encrypted, never in plain text", async () => {
    await connect(deps, userId, fake.issue(), HOUR);
    const row = await connectionRow();
    expect(row?.accessTokenEnc).not.toContain("at-1");
    expect(row?.refreshTokenEnc).not.toContain("rt-1");
    expect(row?.keyId).toBe(deps.keyring.keyId);
  });

  it("returns the stored token while it has more than five minutes left", async () => {
    await connect(deps, userId, fake.issue(), 10 * MINUTE);
    await expect(getAccessToken(deps, userId)).resolves.toBe("at-1");
    expect(fake.refreshCalls).toBe(0);
  });

  it("refreshes a token that expires within five minutes and saves the rotated pair", async () => {
    await connect(deps, userId, fake.issue(), 4 * MINUTE);
    await expect(getAccessToken(deps, userId)).resolves.toBe("at-2");
    expect(fake.refreshCalls).toBe(1);

    // The new refresh token was stored: a second expiry refreshes with rt-2, not rt-1.
    const later = new Date(deps.now().getTime() + 2 * HOUR);
    deps.now = () => later;
    await expect(getAccessToken(deps, userId)).resolves.toBe("at-3");
    expect(fake.revokedGrant).toBe(false);
    expect((await connectionRow())?.refreshedAt).toEqual(later);
  });

  it("lets only one of two racing callers refresh, and both get the new token", async () => {
    await connect(deps, userId, fake.issue(), -MINUTE);
    fake.latencyMs = 50;

    const [first, second] = await Promise.all([
      getAccessToken(deps, userId),
      getAccessToken(deps, userId),
    ]);

    expect(fake.refreshCalls).toBe(1);
    expect(first).toBe("at-2");
    expect(second).toBe("at-2");
    // Using rt-1 twice would have revoked the grant at Buffer.
    expect(fake.revokedGrant).toBe(false);
    expect((await connectionRow())?.status).toBe("active");
  });

  it("marks the connection as needing a reconnect on invalid_grant", async () => {
    await connect(deps, userId, { accessToken: "at-x", refreshToken: "rt-unknown" }, -MINUTE);

    const error = await getAccessToken(deps, userId).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BufferReconnectRequiredError);
    expect((error as BufferReconnectRequiredError).reason).toBe("invalid_grant");

    const row = await connectionRow();
    expect(row?.status).toBe("needs_reconnect");
    expect(row?.reconnectReason).toBe("invalid_grant");

    // Later calls fail fast without asking Buffer again.
    await expect(getAccessToken(deps, userId)).rejects.toBeInstanceOf(BufferReconnectRequiredError);
    expect(fake.refreshCalls).toBe(1);
  });

  it("changes nothing when a refresh fails for a passing reason", async () => {
    await connect(deps, userId, fake.issue(), -MINUTE);
    const before = await connectionRow();

    fake.nextFailure = "server_error";
    await expect(getAccessToken(deps, userId)).rejects.toBeInstanceOf(BufferApiError);
    fake.nextFailure = "network";
    await expect(getAccessToken(deps, userId)).rejects.toBeInstanceOf(BufferApiError);

    const after = await connectionRow();
    expect(after?.refreshTokenEnc).toBe(before?.refreshTokenEnc);
    expect(after?.status).toBe("active");
    // The stored refresh token still works.
    await expect(getAccessToken(deps, userId)).resolves.toBe("at-2");
  });

  it("refreshes a token Buffer rejected early, unless someone already replaced it", async () => {
    await connect(deps, userId, fake.issue(), HOUR);
    await expect(getAccessToken(deps, userId, { rejectedAccessToken: "at-1" })).resolves.toBe(
      "at-2",
    );
    // at-1 was already replaced, so a late caller reporting it gets at-2 without a refresh.
    await expect(getAccessToken(deps, userId, { rejectedAccessToken: "at-1" })).resolves.toBe(
      "at-2",
    );
    expect(fake.refreshCalls).toBe(1);
  });

  it("throws BufferNotConnectedError for a user without a grant", async () => {
    await expect(getAccessToken(deps, userId)).rejects.toBeInstanceOf(BufferNotConnectedError);
  });

  it("returns the previous refresh token when a new grant replaces an old one", async () => {
    await connect(deps, userId, fake.issue(), HOUR);
    const result = await saveGrant(deps, {
      userId,
      organizationId: "org-1",
      tokens: { ...fake.issue(), expiresAt: new Date(), scopes: null },
      requestedScopes: ["account:read", "offline_access"],
    });
    expect(result.previousRefreshToken).toBe("rt-1");
    expect((await connectionRow())?.scopes).toEqual(["account:read", "offline_access"]);
  });
});
