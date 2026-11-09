// Typed errors for every way a Buffer call can fail. Callers branch on the class, never on
// message text. None of them carries a token.

/** Base class, so callers can catch every Buffer failure at once. */
export class BufferError extends Error {
  override name = "BufferError";
}

/** The OAuth server answered with an error, such as invalid_grant. */
export class BufferOAuthError extends BufferError {
  override name = "BufferOAuthError";
  constructor(
    /** The OAuth error code, for example "invalid_grant" or "invalid_client". */
    readonly code: string,
    readonly description: string | undefined,
    readonly status: number,
  ) {
    super(`Buffer OAuth error ${code}${description ? `: ${description}` : ""} (HTTP ${status})`);
  }

  /** The grant is gone: the code or refresh token is expired, used or revoked. */
  get isInvalidGrant(): boolean {
    return this.code === "invalid_grant";
  }
}

/** Buffer rejected the access token (HTTP 401 or GraphQL code UNAUTHORIZED). */
export class BufferUnauthorizedError extends BufferError {
  override name = "BufferUnauthorizedError";
}

/** The token is valid but lacks a scope the operation needs. The person must connect again. */
export class BufferInsufficientScopeError extends BufferError {
  override name = "BufferInsufficientScopeError";
}

/** The app client used up a rate-limit window. Wait `retryAfterSeconds` before calling again. */
export class BufferRateLimitError extends BufferError {
  override name = "BufferRateLimitError";
  constructor(
    readonly retryAfterSeconds: number,
    /** Which window ran out, for example "15m", when Buffer says so. */
    readonly window: string | undefined,
  ) {
    super(
      `Buffer rate limit reached${window ? ` (${window})` : ""}; retry in ${retryAfterSeconds}s`,
    );
  }
}

/** Any other failure: a GraphQL error, a server error or a broken response. */
export class BufferApiError extends BufferError {
  override name = "BufferApiError";
  constructor(
    message: string,
    /** GraphQL extensions.code when present, for example "NOT_FOUND". */
    readonly code: string | undefined,
    readonly status: number,
  ) {
    super(message);
  }

  /** Server errors and timeouts are worth retrying; client errors are not. */
  get isRetryable(): boolean {
    return this.status >= 500 || this.status === 0 || this.code === "UNEXPECTED";
  }
}

/**
 * A mutation answered with one of its error types (Buffer's MutationError interface), for
 * example LimitReachedError or InvalidInputError. The message is Buffer's own and is safe to show.
 */
export class BufferMutationError extends BufferError {
  override name = "BufferMutationError";
  constructor(
    /** The GraphQL type name, for example "LimitReachedError". */
    readonly typename: string,
    message: string,
  ) {
    super(message);
  }
}
