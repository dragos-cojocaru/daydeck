// Test doubles for Buffer: a token endpoint with Buffer's rotation rules, and helpers that
// set up a PGlite database with a connected user.
import { type BufferTokenSet, DEFAULT_ENDPOINTS } from "@daydeck/buffer";
import { schema } from "@daydeck/db";
import { createTestDb } from "@daydeck/db/testing";
import { delay, HttpResponse, http } from "msw";
import type { BufferDeps } from "@/server/buffer/deps";
import { saveGrant } from "@/server/buffer/tokens";
import { createKeyring } from "@/server/crypto/vault";

export const TOKEN_URL = `${DEFAULT_ENDPOINTS.authUrl}/token`;
export const API_URL = DEFAULT_ENDPOINTS.apiUrl;

/**
 * Buffer's token endpoint in memory. Every refresh token works once; using one again revokes
 * every token of its grant, as Buffer documents.
 */
export class FakeTokenServer {
  refreshCalls = 0;
  private counter = 0;
  private live = new Set<string>();
  private used = new Set<string>();
  revokedGrant = false;
  /** Milliseconds each refresh takes, to widen race windows. */
  latencyMs = 0;
  /** When set, the next refresh fails this way instead of rotating. */
  nextFailure: "network" | "server_error" | null = null;

  issue(): { accessToken: string; refreshToken: string } {
    this.counter += 1;
    const pair = { accessToken: `at-${this.counter}`, refreshToken: `rt-${this.counter}` };
    this.live.add(pair.refreshToken);
    return pair;
  }

  handler() {
    return http.post(TOKEN_URL, async ({ request }) => {
      const body = new URLSearchParams(await request.text());
      if (body.get("grant_type") !== "refresh_token") {
        return HttpResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
      }
      this.refreshCalls += 1;
      if (this.latencyMs) await delay(this.latencyMs);
      if (this.nextFailure === "network") {
        this.nextFailure = null;
        return HttpResponse.error();
      }
      if (this.nextFailure === "server_error") {
        this.nextFailure = null;
        return new HttpResponse("oops", { status: 500 });
      }
      const token = body.get("refresh_token") ?? "";
      if (this.used.has(token)) {
        // Reuse: Buffer revokes the whole grant.
        this.revokedGrant = true;
        this.live.clear();
      }
      if (this.revokedGrant || !this.live.has(token)) {
        return HttpResponse.json(
          { error: "invalid_grant", error_description: "grant request is invalid" },
          { status: 400 },
        );
      }
      this.live.delete(token);
      this.used.add(token);
      const pair = this.issue();
      return HttpResponse.json({
        access_token: pair.accessToken,
        refresh_token: pair.refreshToken,
        token_type: "Bearer",
        expires_in: 3600,
        scope: "account:read posts:read posts:write offline_access",
      });
    });
  }
}

export const T0 = new Date("2026-11-08T12:00:00Z");

export async function setupDeps() {
  const { db, close } = await createTestDb();
  const clock = { now: T0 };
  const deps: BufferDeps = {
    db,
    keyring: createKeyring(Buffer.alloc(32, 7).toString("base64")),
    client: {
      clientId: "client-1",
      clientSecret: "secret-1",
      redirectUri: "https://localhost:3000/api/auth/buffer/callback",
      endpoints: DEFAULT_ENDPOINTS,
    },
    now: () => clock.now,
  };
  return { deps, clock, close };
}

export async function createUser(deps: BufferDeps, bufferAccountId = "acc-1") {
  const [user] = await deps.db
    .insert(schema.users)
    .values({ bufferAccountId, name: "Ana", timezone: "Europe/Bucharest" })
    .returning();
  if (!user) throw new Error("no user");
  return user;
}

/** Stores a grant whose access token expires `expiresInMs` after the clock's current time. */
export async function connect(
  deps: BufferDeps,
  userId: string,
  pair: { accessToken: string; refreshToken: string },
  expiresInMs: number,
) {
  const tokens: BufferTokenSet = {
    ...pair,
    expiresAt: new Date(deps.now().getTime() + expiresInMs),
    scopes: ["account:read", "posts:read", "posts:write", "offline_access"],
  };
  await saveGrant(deps, { userId, organizationId: "org-1", tokens, requestedScopes: [] });
}
