// Runs a Buffer API call as a user: gets a working token, records rate-limit headers, and
// handles the two auth failures that need more than a retry.
import {
  BufferInsufficientScopeError,
  BufferUnauthorizedError,
  type RequestOptions,
} from "@daydeck/buffer";
import type { BufferDeps } from "./deps";
import { BufferReconnectRequiredError } from "./errors";
import { recordRateLimits } from "./rate-limits";
import { getAccessToken, markNeedsReconnect } from "./tokens";

export interface CallBufferOptions {
  /**
   * For extra features, such as experimental Buffer Notes: a missing scope is passed on as
   * BufferInsufficientScopeError and the connection keeps working for everything else.
   */
  scopeIsOptional?: boolean;
}

export async function callBuffer<T>(
  deps: BufferDeps,
  userId: string,
  call: (options: RequestOptions) => Promise<T>,
  { scopeIsOptional = false }: CallBufferOptions = {},
): Promise<T> {
  const options = (accessToken: string): RequestOptions => ({
    accessToken,
    endpoints: deps.client.endpoints,
    fetch: deps.client.fetch,
    onRateLimit: (windows) => recordRateLimits(deps.db, windows, deps.now()),
  });

  const token = await getAccessToken(deps, userId);
  try {
    return await call(options(token));
  } catch (error) {
    if (error instanceof BufferInsufficientScopeError && scopeIsOptional) throw error;
    if (error instanceof BufferInsufficientScopeError) {
      // The grant lacks a scope the app now needs: connect again with the full set.
      await markNeedsReconnect(deps.db, userId, "insufficient_scope", deps.now());
      throw new BufferReconnectRequiredError("insufficient_scope");
    }
    if (!(error instanceof BufferUnauthorizedError)) throw error;
  }

  // Buffer rejected a token we thought was valid (revoked early, or clock skew).
  // Refresh once and retry; a second rejection means the grant itself is gone.
  const retryToken = await getAccessToken(deps, userId, { rejectedAccessToken: token });
  try {
    return await call(options(retryToken));
  } catch (error) {
    if (error instanceof BufferUnauthorizedError) {
      await markNeedsReconnect(deps.db, userId, "unauthorized", deps.now());
      throw new BufferReconnectRequiredError("unauthorized");
    }
    if (error instanceof BufferInsufficientScopeError && scopeIsOptional) throw error;
    if (error instanceof BufferInsufficientScopeError) {
      await markNeedsReconnect(deps.db, userId, "insufficient_scope", deps.now());
      throw new BufferReconnectRequiredError("insufficient_scope");
    }
    throw error;
  }
}
