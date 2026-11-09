// Cookie names and settings shared by the OAuth routes, Server Actions and the proxy.
// The "__Host-" prefix makes the browser refuse the cookie unless it is Secure, has Path=/
// and no Domain, so no subdomain can set or read it.

export const SESSION_COOKIE = "__Host-daydeck-session";
export const OAUTH_STATE_COOKIE = "__Host-daydeck-oauth";

/** How long a person has to finish Buffer's consent screen. */
export const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

export const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export const secureCookie = {
  httpOnly: true,
  secure: true,
  // Lax still sends the cookie on the top-level redirect back from Buffer's consent screen.
  sameSite: "lax",
  path: "/",
} as const;
