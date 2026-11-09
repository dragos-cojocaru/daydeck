import { HttpResponse, http } from "msw/http";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BufferOAuthError } from "./errors";
import {
  BUFFER_SCOPES,
  buildAuthorizationUrl,
  createPkcePair,
  exchangeAuthorizationCode,
  pkceChallenge,
  refreshAccessToken,
  revokeToken,
} from "./oauth";

const client = {
  clientId: "client-123",
  clientSecret: "secret-456",
  redirectUri: "https://localhost:3000/api/auth/buffer/callback",
};

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/** Captures the form body of the next token request and answers with `reply`. */
function onToken(reply: () => Response) {
  const seen: { body?: URLSearchParams; authorization?: string | null } = {};
  server.use(
    http.post("https://auth.buffer.com/token", async ({ request }) => {
      seen.body = new URLSearchParams(await request.text());
      seen.authorization = request.headers.get("authorization");
      return reply();
    }),
  );
  return seen;
}

describe("PKCE", () => {
  it("matches the RFC 7636 test vector", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("creates a 43-character verifier and its S256 challenge", () => {
    const pair = createPkcePair();
    expect(pair.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pair.challenge).toBe(pkceChallenge(pair.verifier));
  });
});

describe("buildAuthorizationUrl", () => {
  it("asks for every scope, offline access and fresh consent", () => {
    const url = buildAuthorizationUrl({ client, state: "s1", codeChallenge: "c1" });
    expect(url.origin + url.pathname).toBe("https://auth.buffer.com/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "client-123",
      redirect_uri: client.redirectUri,
      response_type: "code",
      scope: BUFFER_SCOPES.join(" "),
      state: "s1",
      code_challenge: "c1",
      code_challenge_method: "S256",
      prompt: "consent",
    });
  });
});

describe("exchangeAuthorizationCode", () => {
  it("sends the secret in the form body (client_secret_post), never as HTTP Basic", async () => {
    const seen = onToken(() =>
      HttpResponse.json({
        access_token: "at-1",
        refresh_token: "rt-1",
        token_type: "Bearer",
        expires_in: 3600,
        scope: "account:read offline_access",
      }),
    );

    const tokens = await exchangeAuthorizationCode({
      client,
      code: "code-1",
      codeVerifier: "verifier-1",
      now: () => Date.UTC(2026, 10, 8, 12),
    });

    expect(seen.authorization).toBeNull();
    expect(Object.fromEntries(seen.body ?? [])).toEqual({
      grant_type: "authorization_code",
      code: "code-1",
      redirect_uri: client.redirectUri,
      code_verifier: "verifier-1",
      client_id: "client-123",
      client_secret: "secret-456",
    });
    expect(tokens).toEqual({
      accessToken: "at-1",
      refreshToken: "rt-1",
      expiresAt: new Date(Date.UTC(2026, 10, 8, 13)),
      scopes: ["account:read", "offline_access"],
    });
  });

  it("rejects a response without a refresh token", async () => {
    onToken(() => HttpResponse.json({ access_token: "at-1", expires_in: 3600 }));
    const error = await exchangeAuthorizationCode({ client, code: "c", codeVerifier: "v" }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(BufferOAuthError);
    expect((error as BufferOAuthError).code).toBe("missing_refresh_token");
  });

  it("turns an expired code into invalid_grant", async () => {
    onToken(() =>
      HttpResponse.json(
        { error: "invalid_grant", error_description: "Authorization code has expired" },
        { status: 400 },
      ),
    );
    const error = await exchangeAuthorizationCode({ client, code: "c", codeVerifier: "v" }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(BufferOAuthError);
    expect((error as BufferOAuthError).isInvalidGrant).toBe(true);
    expect((error as BufferOAuthError).status).toBe(400);
  });
});

describe("refreshAccessToken", () => {
  it("uses the refresh_token grant and returns the rotated refresh token", async () => {
    const seen = onToken(() =>
      HttpResponse.json({ access_token: "at-2", refresh_token: "rt-2", expires_in: 3600 }),
    );
    const tokens = await refreshAccessToken({ client, refreshToken: "rt-1" });
    expect(seen.body?.get("grant_type")).toBe("refresh_token");
    expect(seen.body?.get("refresh_token")).toBe("rt-1");
    expect(seen.body?.get("client_secret")).toBe("secret-456");
    expect(tokens.refreshToken).toBe("rt-2");
    expect(tokens.scopes).toBeNull();
  });
});

describe("revokeToken", () => {
  it("posts the token to the revocation endpoint with client credentials", async () => {
    let body: URLSearchParams | undefined;
    server.use(
      http.post("https://auth.buffer.com/token/revocation", async ({ request }) => {
        body = new URLSearchParams(await request.text());
        return new HttpResponse(null, { status: 200 });
      }),
    );
    await revokeToken({ client, token: "rt-old", tokenTypeHint: "refresh_token" });
    expect(body?.get("token")).toBe("rt-old");
    expect(body?.get("token_type_hint")).toBe("refresh_token");
    expect(body?.get("client_id")).toBe("client-123");
  });
});
