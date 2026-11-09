// The one function every Buffer GraphQL call goes through. It adds the bearer token, reports
// rate-limit headers, and turns every failure into a typed error from ./errors.
import { z } from "zod";
import { type BufferEndpoints, DEFAULT_ENDPOINTS } from "./endpoints";
import {
  BufferApiError,
  BufferInsufficientScopeError,
  BufferRateLimitError,
  BufferUnauthorizedError,
} from "./errors";
import type { TypedDocumentString } from "./gql/graphql";
import { parseRateLimitHeaders, parseRetryAfter, type RateLimitWindow } from "./rate-limit";

export interface RequestOptions {
  accessToken: string;
  endpoints?: BufferEndpoints;
  fetch?: typeof fetch;
  signal?: AbortSignal;
  /** Receives the rate-limit windows from every response, including 429s. */
  onRateLimit?: (windows: RateLimitWindow[]) => void | Promise<void>;
}

const REQUEST_TIMEOUT_MS = 15_000;

// When a 429 carries no Retry-After and no usable window, wait this long.
const FALLBACK_RETRY_SECONDS = 60;

const envelopeSchema = z.object({
  data: z.unknown().optional(),
  errors: z
    .array(
      z.object({
        message: z.string().default(""),
        extensions: z
          .object({ code: z.string().optional(), window: z.string().optional() })
          .loose()
          .optional(),
      }),
    )
    .optional(),
});

type Envelope = z.infer<typeof envelopeSchema>;

export async function request<TResult, TVariables>(
  document: TypedDocumentString<TResult, TVariables>,
  variables: TVariables,
  options: RequestOptions,
): Promise<TResult> {
  const endpoints = options.endpoints ?? DEFAULT_ENDPOINTS;
  const doFetch = options.fetch ?? fetch;
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await doFetch(endpoints.apiUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.accessToken}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ query: document.toString(), variables }),
      signal,
      cache: "no-store",
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.name : "network error";
    throw new BufferApiError(`Could not reach the Buffer API: ${reason}`, undefined, 0);
  }

  const windows = parseRateLimitHeaders(response.headers);
  if (windows.length > 0 && options.onRateLimit) {
    try {
      await options.onRateLimit(windows);
    } catch (error) {
      // Saving the snapshot must never fail the call itself.
      console.warn("Could not record Buffer rate-limit headers", error);
    }
  }

  const envelope = await readEnvelope(response);

  if (response.status === 429) {
    throw rateLimitError(response, envelope, windows);
  }
  if (response.status === 401) {
    throw new BufferUnauthorizedError("Buffer rejected the access token (HTTP 401)");
  }

  const firstError = envelope?.errors?.[0];
  if (firstError) {
    throw classifyGraphQLError(firstError, response, envelope, windows);
  }
  if (!response.ok) {
    throw new BufferApiError(
      `Buffer API answered HTTP ${response.status}`,
      undefined,
      response.status,
    );
  }
  if (envelope?.data === undefined || envelope.data === null) {
    throw new BufferApiError("Buffer API returned no data", undefined, response.status);
  }
  return envelope.data as TResult;
}

async function readEnvelope(response: Response): Promise<Envelope | null> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = envelopeSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

type GraphQLError = NonNullable<Envelope["errors"]>[number];

function classifyGraphQLError(
  error: GraphQLError,
  response: Response,
  envelope: Envelope | null,
  windows: RateLimitWindow[],
): Error {
  const code = error.extensions?.code;
  switch (code) {
    case "UNAUTHORIZED":
    case "UNAUTHENTICATED":
      return new BufferUnauthorizedError(error.message || "Buffer rejected the access token");
    case "INSUFFICIENT_SCOPE":
      return new BufferInsufficientScopeError(error.message || "A required scope is missing");
    case "FORBIDDEN":
      // Buffer documents FORBIDDEN as "valid key, but no permission". A missing OAuth scope
      // can surface this way, so a message that names a scope is treated as one.
      if (/scope/i.test(error.message)) return new BufferInsufficientScopeError(error.message);
      return new BufferApiError(error.message, code, response.status);
    case "RATE_LIMIT_EXCEEDED":
      return rateLimitError(response, envelope, windows);
    default:
      return new BufferApiError(error.message || "Buffer API error", code, response.status);
  }
}

function rateLimitError(
  response: Response,
  envelope: Envelope | null,
  windows: RateLimitWindow[],
): BufferRateLimitError {
  const exhausted = windows.filter((w) => w.remaining <= 0).map((w) => w.resetSeconds);
  const retryAfter =
    parseRetryAfter(response.headers.get("retry-after")) ??
    (exhausted.length > 0 ? Math.max(...exhausted) : FALLBACK_RETRY_SECONDS);
  const window = envelope?.errors?.find((e) => e.extensions?.window)?.extensions?.window;
  return new BufferRateLimitError(retryAfter, window);
}

/** Validates the part of a response the app relies on, with a typed error when it drifts. */
export function parseResponse<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new BufferApiError(
      `Buffer returned an unexpected shape for ${what}`,
      "INVALID_RESPONSE",
      200,
    );
  }
  return parsed.data;
}
