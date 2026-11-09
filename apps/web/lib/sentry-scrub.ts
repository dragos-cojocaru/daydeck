import type { ErrorEvent } from "@sentry/nextjs";

type DataCollection = NonNullable<
  Parameters<typeof import("@sentry/nextjs").init>[0]["dataCollection"]
>;

// What Sentry may collect on its own. Bodies, headers and query strings are off: they can hold
// OAuth codes, client secrets, tokens and post text. scrubEvent() below is a second safety layer.
export const dataCollection: DataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
};

// Keys whose values must never reach Sentry: OAuth tokens, secrets, session cookies.
const SENSITIVE_KEY = /authorization|cookie|token|secret|password|code_verifier|session/i;
const REDACTED = "[redacted]";

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1));
  const result: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY.test(key) ? REDACTED : scrub(inner, depth + 1);
  }
  return result;
}

/** Sentry beforeSend hook: removes tokens and auth headers from every event. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    event.request = scrub(event.request) as ErrorEvent["request"];
  }
  if (event.extra) event.extra = scrub(event.extra) as ErrorEvent["extra"];
  if (event.contexts) event.contexts = scrub(event.contexts) as ErrorEvent["contexts"];
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
      ...crumb,
      data: scrub(crumb.data) as typeof crumb.data,
    }));
  }
  return event;
}
