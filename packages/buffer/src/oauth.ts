// Buffer OAuth 2.0: Authorization Code with PKCE, for a confidential client.
//
// Buffer's token endpoint accepts only `client_secret_post` (its discovery document lists
// "none" and "client_secret_post"), so the secret always goes in the form body, never in an
// HTTP Basic header. Refresh tokens rotate on every use, and reusing an old one revokes the
// whole grant, so callers must save each new refresh token before using the access token.
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  authorizeEndpoint,
  type BufferEndpoints,
  DEFAULT_ENDPOINTS,
  revocationEndpoint,
  tokenEndpoint,
} from "./endpoints";
import { BufferApiError, BufferOAuthError } from "./errors";

/** Every scope the app uses, requested once at connect so people approve a single screen. */
export const BUFFER_SCOPES = [
  "account:read",
  "posts:read",
  "posts:write",
  "ideas:read",
  "ideas:write",
  "notes:read",
  "notes:write",
  "offline_access",
] as const;

/** Without these the app cannot work at all; the rest unlock features. */
export const REQUIRED_SCOPES = ["account:read", "offline_access"] as const;

export interface BufferOAuthClient {
  clientId: string;
  clientSecret: string;
  /** Must match a redirect URI registered on the app client, character for character. */
  redirectUri: string;
  endpoints?: BufferEndpoints;
  fetch?: typeof fetch;
}

export interface BufferTokenSet {
  accessToken: string;
  refreshToken: string;
  /** When the access token stops working. */
  expiresAt: Date;
  /** Scopes Buffer granted, or null when the response did not list them. */
  scopes: string[] | null;
}

const REQUEST_TIMEOUT_MS = 10_000;

// Buffer documents a lifetime of about an hour. Used only if expires_in is missing.
const DEFAULT_LIFETIME_SECONDS = 3600;

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  token_type: z.string().optional(),
  expires_in: z.coerce.number().int().positive().optional(),
  scope: z.string().optional(),
});

const errorResponseSchema = z.object({
  error: z.string().min(1),
  error_description: z.string().optional(),
});

/** A random value that ties the callback to the browser that started the flow. */
export function createState(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * PKCE pair. The verifier stays on our server; only its SHA-256 hash (the challenge) goes to
 * Buffer. A stolen authorization code is useless without the verifier.
 */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: pkceChallenge(verifier) };
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function buildAuthorizationUrl(input: {
  client: Pick<BufferOAuthClient, "clientId" | "redirectUri" | "endpoints">;
  state: string;
  codeChallenge: string;
  scopes?: readonly string[];
}): URL {
  const endpoints = input.client.endpoints ?? DEFAULT_ENDPOINTS;
  const url = new URL(authorizeEndpoint(endpoints));
  url.search = new URLSearchParams({
    client_id: input.client.clientId,
    redirect_uri: input.client.redirectUri,
    response_type: "code",
    scope: (input.scopes ?? BUFFER_SCOPES).join(" "),
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    // Buffer only returns a refresh token when consent is shown again.
    prompt: "consent",
  }).toString();
  return url;
}

/** Trades the one-time authorization code for tokens. */
export async function exchangeAuthorizationCode(input: {
  client: BufferOAuthClient;
  code: string;
  codeVerifier: string;
  now?: () => number;
}): Promise<BufferTokenSet> {
  const tokens = await requestTokens(input.client, {
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.client.redirectUri,
    code_verifier: input.codeVerifier,
  });
  return toTokenSet(tokens, input.now ?? Date.now);
}

/**
 * Uses a refresh token once. The returned refresh token replaces the old one, which Buffer
 * has now invalidated: save it before doing anything else.
 */
export async function refreshAccessToken(input: {
  client: BufferOAuthClient;
  refreshToken: string;
  now?: () => number;
}): Promise<BufferTokenSet> {
  const tokens = await requestTokens(input.client, {
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
  });
  return toTokenSet(tokens, input.now ?? Date.now);
}

/** Revokes a token at Buffer (RFC 7009). Revoking a refresh token ends its grant. */
export async function revokeToken(input: {
  client: BufferOAuthClient;
  token: string;
  tokenTypeHint: "refresh_token" | "access_token";
}): Promise<void> {
  const { client } = input;
  const endpoints = client.endpoints ?? DEFAULT_ENDPOINTS;
  const response = await post(client, revocationEndpoint(endpoints), {
    token: input.token,
    token_type_hint: input.tokenTypeHint,
  });
  // RFC 7009: the server answers 200 even for unknown tokens, so any other status is an error.
  if (!response.ok) throw await toOAuthError(response);
}

async function requestTokens(
  client: BufferOAuthClient,
  params: Record<string, string>,
): Promise<z.infer<typeof tokenResponseSchema>> {
  const endpoints = client.endpoints ?? DEFAULT_ENDPOINTS;
  const response = await post(client, tokenEndpoint(endpoints), params);
  if (!response.ok) throw await toOAuthError(response);

  const body: unknown = await response.json().catch(() => null);
  const error = errorResponseSchema.safeParse(body);
  if (error.success) {
    throw new BufferOAuthError(error.data.error, error.data.error_description, response.status);
  }
  const parsed = tokenResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new BufferApiError("Buffer returned an unreadable token response", undefined, 502);
  }
  return parsed.data;
}

function toTokenSet(tokens: z.infer<typeof tokenResponseSchema>, now: () => number) {
  if (!tokens.refresh_token) {
    // Without a refresh token the connection would break after an hour.
    throw new BufferOAuthError(
      "missing_refresh_token",
      "Buffer did not return a refresh token. Check that the app client allows offline_access.",
      200,
    );
  }
  const lifetime = tokens.expires_in ?? DEFAULT_LIFETIME_SECONDS;
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(now() + lifetime * 1000),
    scopes: tokens.scope ? tokens.scope.split(" ").filter(Boolean) : null,
  } satisfies BufferTokenSet;
}

async function post(
  client: BufferOAuthClient,
  url: string,
  params: Record<string, string>,
): Promise<Response> {
  const body = new URLSearchParams({
    ...params,
    client_id: client.clientId,
    client_secret: client.clientSecret,
  });
  const doFetch = client.fetch ?? fetch;
  try {
    return await doFetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (cause) {
    throw new BufferApiError(
      `Could not reach Buffer's OAuth server: ${describe(cause)}`,
      undefined,
      0,
    );
  }
}

async function toOAuthError(response: Response): Promise<BufferOAuthError | BufferApiError> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = errorResponseSchema.safeParse(body);
  if (parsed.success) {
    return new BufferOAuthError(parsed.data.error, parsed.data.error_description, response.status);
  }
  return new BufferApiError(
    `Buffer's OAuth server answered HTTP ${response.status}`,
    undefined,
    response.status,
  );
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.name : "network error";
}
