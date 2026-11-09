import "server-only";
import { BUFFER_SCOPES, type BufferEndpoints, type BufferOAuthClient } from "@daydeck/buffer";
import { getKeyring } from "../crypto/keyring";
import { getDb } from "../db";
import { env, requireEnv } from "../env";
import type { BufferDeps } from "./deps";

export function getEndpoints(): BufferEndpoints {
  return { authUrl: env.BUFFER_AUTH_URL, apiUrl: env.BUFFER_API_URL };
}

/** The app client's credentials. Throws MissingEnvError until Buffer is configured. */
export function getOAuthClient(): BufferOAuthClient {
  return {
    clientId: requireEnv("BUFFER_CLIENT_ID"),
    clientSecret: requireEnv("BUFFER_CLIENT_SECRET"),
    redirectUri: requireEnv("BUFFER_REDIRECT_URI"),
    endpoints: getEndpoints(),
  };
}

/** The scopes requested at connect: BUFFER_SCOPES when set, otherwise the full set. */
export function getRequestedScopes(): string[] {
  const custom = env.BUFFER_SCOPES?.split(/\s+/).filter(Boolean);
  return custom && custom.length > 0 ? custom : [...BUFFER_SCOPES];
}

/** The real dependencies for the Buffer services. Tests build their own. */
export function getBufferDeps(): BufferDeps {
  return { db: getDb(), client: getOAuthClient(), keyring: getKeyring(), now: () => new Date() };
}
