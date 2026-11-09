import type { MatcherProvider } from "./types";

// Provider errors are rewrapped so that their messages never carry post text. The original
// SDK error is left out on purpose, because its body can echo the request.

/** HTTP statuses where trying the same request again later can succeed. */
const RETRYABLE_STATUSES = new Set([408, 409, 429]);

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status) || status >= 500;
}

export class MatcherError extends Error {
  override readonly name = "MatcherError";
  readonly provider: MatcherProvider;
  /** True when the same request can succeed later, for example after a rate limit. */
  readonly retryable: boolean;
  /** The provider's HTTP status, when the error came from an HTTP response. */
  readonly status: number | undefined;
  /** The provider's request ID, to quote when asking the provider for support. */
  readonly requestId: string | undefined;

  constructor(
    message: string,
    details: {
      provider: MatcherProvider;
      retryable: boolean;
      status?: number | undefined;
      requestId?: string | undefined;
    },
  ) {
    super(message);
    this.provider = details.provider;
    this.retryable = details.retryable;
    this.status = details.status;
    this.requestId = details.requestId;
  }
}
