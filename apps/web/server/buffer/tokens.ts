// The token vault: stores Buffer grants encrypted, and hands out working access tokens.
//
// Buffer rotates the refresh token on every use and revokes the whole grant if an old one is
// used again. So only one refresh may run per user at a time: it happens inside a transaction
// that locks the connection row (SELECT ... FOR UPDATE), re-reads the row after taking the
// lock, and saves the new refresh token before anyone uses the new access token.
import {
  BufferOAuthError,
  type BufferTokenSet,
  refreshAccessToken,
  revokeToken,
} from "@daydeck/buffer";
import { type BufferConnection, type Database, eq, schema } from "@daydeck/db";
import { open, seal } from "../crypto/vault";
import type { BufferDeps } from "./deps";
import {
  BufferNotConnectedError,
  BufferReconnectRequiredError,
  type ReconnectReason,
} from "./errors";

const { bufferConnections } = schema;

/** Refresh this long before the access token expires, so a call never starts with a dying token. */
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;

type TokenField = "access" | "refresh";

// Binds each ciphertext to its user and field, so tokens cannot be swapped between rows.
function context(userId: string, field: TokenField): string {
  return `buffer-connection:${userId}:${field}`;
}

function sealToken(deps: BufferDeps, userId: string, field: TokenField, token: string): string {
  return seal(deps.keyring, "buffer-tokens", token, context(userId, field));
}

function openToken(deps: BufferDeps, row: BufferConnection, field: TokenField): string {
  if (row.keyId !== deps.keyring.keyId) {
    throw new Error(`Buffer tokens for this user were sealed with another key (${row.keyId})`);
  }
  const sealed = field === "access" ? row.accessTokenEnc : row.refreshTokenEnc;
  return open(deps.keyring, "buffer-tokens", sealed, context(row.userId, field));
}

function isFresh(row: BufferConnection, now: Date): boolean {
  return row.expiresAt.getTime() - now.getTime() > REFRESH_MARGIN_MS;
}

/**
 * Stores a new grant from the OAuth callback. Returns the previous refresh token, if there was
 * one, so the caller can revoke the old grant at Buffer (re-consent creates a separate grant).
 */
export async function saveGrant(
  deps: BufferDeps,
  input: {
    userId: string;
    organizationId: string;
    tokens: BufferTokenSet;
    requestedScopes: string[];
  },
): Promise<{ previousRefreshToken: string | null }> {
  const { userId, tokens } = input;
  const now = deps.now();

  return deps.db.transaction(async (tx) => {
    // Locking the row makes a refresh that is running right now finish first.
    const [existing] = await tx
      .select()
      .from(bufferConnections)
      .where(eq(bufferConnections.userId, userId))
      .for("update");

    let previousRefreshToken: string | null = null;
    if (existing && existing.status !== "revoked") {
      try {
        previousRefreshToken = openToken(deps, existing, "refresh");
      } catch {
        // Sealed with an old key: there is nothing we can revoke.
      }
    }

    const values = {
      organizationId: input.organizationId,
      accessTokenEnc: sealToken(deps, userId, "access", tokens.accessToken),
      refreshTokenEnc: sealToken(deps, userId, "refresh", tokens.refreshToken),
      keyId: deps.keyring.keyId,
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes ?? input.requestedScopes,
      status: "active" as const,
      reconnectReason: null,
      grantedAt: now,
      refreshedAt: null,
      updatedAt: now,
    };
    await tx
      .insert(bufferConnections)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: bufferConnections.userId, set: values });

    return {
      previousRefreshToken:
        previousRefreshToken && previousRefreshToken !== tokens.refreshToken
          ? previousRefreshToken
          : null,
    };
  });
}

/**
 * Returns an access token that works for at least five more minutes, refreshing it if needed.
 *
 * Pass `rejectedAccessToken` after Buffer answered 401 with that token: the token is then
 * refreshed even if it has not expired yet, unless another caller already replaced it.
 *
 * Throws BufferNotConnectedError, BufferReconnectRequiredError (the grant is gone), or the
 * Buffer error from a failed refresh (network, rate limit), in which case nothing was changed.
 */
export async function getAccessToken(
  deps: BufferDeps,
  userId: string,
  options: { rejectedAccessToken?: string } = {},
): Promise<string> {
  // Fast path without a lock: most calls find a fresh token.
  const [row] = await deps.db
    .select()
    .from(bufferConnections)
    .where(eq(bufferConnections.userId, userId));
  if (!row || row.status === "revoked") throw new BufferNotConnectedError();
  if (row.status === "needs_reconnect") {
    throw new BufferReconnectRequiredError(row.reconnectReason ?? "invalid_grant");
  }
  if (!options.rejectedAccessToken && isFresh(row, deps.now())) {
    return openToken(deps, row, "access");
  }

  const outcome = await deps.db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(bufferConnections)
      .where(eq(bufferConnections.userId, userId))
      .for("update");
    if (!locked || locked.status === "revoked") return { kind: "not-connected" } as const;
    if (locked.status === "needs_reconnect") {
      return { kind: "reconnect", reason: locked.reconnectReason ?? "invalid_grant" } as const;
    }

    // Re-read after taking the lock: another request or job may have refreshed already.
    const current = openToken(deps, locked, "access");
    const stillRejected = current === options.rejectedAccessToken;
    if (!stillRejected && isFresh(locked, deps.now())) {
      return { kind: "token", token: current } as const;
    }

    let tokens: BufferTokenSet;
    try {
      tokens = await refreshAccessToken({
        client: deps.client,
        refreshToken: openToken(deps, locked, "refresh"),
        now: () => deps.now().getTime(),
      });
    } catch (error) {
      // invalid_grant: the refresh token expired, was revoked in Buffer's settings, or was
      // already used (for example when a refresh response was lost). Only a new connect helps.
      if (error instanceof BufferOAuthError && error.isInvalidGrant) {
        await tx
          .update(bufferConnections)
          .set({
            status: "needs_reconnect",
            reconnectReason: "invalid_grant",
            updatedAt: deps.now(),
          })
          .where(eq(bufferConnections.userId, userId));
        return { kind: "reconnect", reason: "invalid_grant" } as const;
      }
      throw error;
    }

    const now = deps.now();
    await tx
      .update(bufferConnections)
      .set({
        accessTokenEnc: sealToken(deps, userId, "access", tokens.accessToken),
        refreshTokenEnc: sealToken(deps, userId, "refresh", tokens.refreshToken),
        keyId: deps.keyring.keyId,
        expiresAt: tokens.expiresAt,
        scopes: tokens.scopes ?? locked.scopes,
        refreshedAt: now,
        updatedAt: now,
      })
      .where(eq(bufferConnections.userId, userId));
    // The transaction commits before the token is returned, so the rotated refresh token is
    // saved before anyone uses the new access token.
    return { kind: "token", token: tokens.accessToken } as const;
  });

  switch (outcome.kind) {
    case "token":
      return outcome.token;
    case "not-connected":
      throw new BufferNotConnectedError();
    case "reconnect":
      throw new BufferReconnectRequiredError(outcome.reason);
  }
}

/** Pauses the connection until the user connects again, and records why for the banner. */
export async function markNeedsReconnect(
  db: Database,
  userId: string,
  reason: ReconnectReason,
  now: Date,
): Promise<void> {
  await db
    .update(bufferConnections)
    .set({ status: "needs_reconnect", reconnectReason: reason, updatedAt: now })
    .where(eq(bufferConnections.userId, userId));
}

/**
 * Revokes the user's Buffer grant at Buffer, for "Delete my data". Best effort: a grant that
 * is already gone, or sealed with an old key, is fine. Returns whether Buffer confirmed it.
 */
export async function revokeStoredGrant(deps: BufferDeps, userId: string): Promise<boolean> {
  const [row] = await deps.db
    .select()
    .from(schema.bufferConnections)
    .where(eq(schema.bufferConnections.userId, userId));
  if (!row || row.status === "revoked") return false;
  try {
    const token = openToken(deps, row, "refresh");
    await revokeToken({ client: deps.client, token, tokenTypeHint: "refresh_token" });
    return true;
  } catch (error) {
    console.warn("Revoking the Buffer grant failed", (error as Error).name);
    return false;
  }
}
