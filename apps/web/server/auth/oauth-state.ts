// The short-lived OAuth state cookie: the state value, the PKCE verifier and where to go after
// connecting. It is encrypted and authenticated (AES-256-GCM), so the browser can neither
// read the verifier nor change any field.
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { type Keyring, open, seal } from "../crypto/vault";
import { OAUTH_STATE_MAX_AGE_SECONDS } from "./cookies";

const payloadSchema = z.object({
  state: z.string().min(1),
  verifier: z.string().min(1),
  next: z.string().nullable(),
  issuedAt: z.number().int(),
});

export type OAuthStatePayload = z.infer<typeof payloadSchema>;

const CONTEXT = "oauth-state-cookie";

export function sealOAuthState(keyring: Keyring, payload: OAuthStatePayload): string {
  return seal(keyring, "oauth-state", JSON.stringify(payload), CONTEXT);
}

/** Opens the cookie. Returns null if it was changed, sealed with another key, or is too old. */
export function openOAuthState(
  keyring: Keyring,
  cookie: string,
  now: number,
): OAuthStatePayload | null {
  try {
    const parsed = payloadSchema.safeParse(
      JSON.parse(open(keyring, "oauth-state", cookie, CONTEXT)),
    );
    if (!parsed.success) return null;
    const age = now - parsed.data.issuedAt;
    if (age < 0 || age > OAUTH_STATE_MAX_AGE_SECONDS * 1000) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/** Compares the state from Buffer's redirect with ours, in constant time. */
export function stateMatches(expected: string, received: string | null): boolean {
  if (!received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}
