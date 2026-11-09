import {
  BufferOAuthError,
  BufferRateLimitError,
  exchangeAuthorizationCode,
  fetchAccount,
  REQUIRED_SCOPES,
  revokeToken,
} from "@daydeck/buffer";
import { revalidateTag } from "next/cache";
import { after, connection, type NextRequest, NextResponse } from "next/server";
import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  SESSION_COOKIE_MAX_AGE_SECONDS,
  secureCookie,
} from "@/server/auth/cookies";
import { openOAuthState, stateMatches } from "@/server/auth/oauth-state";
import { createSession, deleteSession } from "@/server/auth/sessions";
import { syncChannels } from "@/server/buffer/channels";
import { getBufferDeps, getEndpoints, getRequestedScopes } from "@/server/buffer/config";
import { recordRateLimits } from "@/server/buffer/rate-limits";
import { saveGrant } from "@/server/buffer/tokens";
import { userTag } from "@/server/challenges/cached";
import { getKeyring } from "@/server/crypto/keyring";
import { getDb } from "@/server/db";
import { MissingEnvError } from "@/server/env";
import { hit, ipKey, RULES } from "@/server/security/rate-limit";
import { upsertUserFromAccount } from "@/server/users";

/** Reasons the connect page can explain. Never contains anything from Buffer verbatim. */
type ConnectError =
  | "denied"
  | "expired"
  | "mismatch"
  | "missing_scope"
  | "no_organization"
  | "busy"
  | "buffer_error"
  | "not_configured"
  | "unexpected"
  | "too_many";

// Step 2 of connecting Buffer: check the state, trade the code for tokens, create or update the
// user, store the encrypted grant, start a session and load the user's channels.
export async function GET(request: NextRequest) {
  await connection();
  const params = request.nextUrl.searchParams;

  const fail = (reason: ConnectError) => {
    const response = NextResponse.redirect(new URL(`/connect?error=${reason}`, request.url), 303);
    response.cookies.delete({ name: OAUTH_STATE_COOKIE, ...secureCookie });
    return response;
  };

  // One address cannot hammer the token exchange.
  const limited = await hit(getDb(), await ipKey("oauthCallback"), RULES.oauthCallback, new Date());
  if (!limited.ok) return fail("too_many");

  try {
    const keyring = getKeyring();
    const cookie = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
    const saved = cookie ? openOAuthState(keyring, cookie, Date.now()) : null;
    // No cookie: the 10 minutes ran out, or the browser blocked cookies.
    if (!saved) return fail("expired");
    if (!stateMatches(saved.state, params.get("state"))) return fail("mismatch");

    const oauthError = params.get("error");
    if (oauthError) return fail(oauthError === "access_denied" ? "denied" : "buffer_error");

    const deps = getBufferDeps();
    // RFC 9207: Buffer names itself as the issuer, which rules out mix-up attacks.
    const issuer = params.get("iss");
    if (issuer !== null && issuer !== deps.client.endpoints?.authUrl) return fail("mismatch");

    const code = params.get("code");
    if (!code) return fail("buffer_error");

    const tokens = await exchangeAuthorizationCode({
      client: deps.client,
      code,
      codeVerifier: saved.verifier,
    });
    const granted = tokens.scopes ?? getRequestedScopes();
    if (REQUIRED_SCOPES.some((scope) => !granted.includes(scope))) {
      // The app cannot work with this grant, so it is not stored; end it at Buffer too.
      after(() =>
        revokeToken({
          client: deps.client,
          token: tokens.refreshToken,
          tokenTypeHint: "refresh_token",
        }).catch((error: unknown) => console.warn("Could not revoke an unusable grant", error)),
      );
      return fail("missing_scope");
    }

    const account = await fetchAccount({
      accessToken: tokens.accessToken,
      endpoints: getEndpoints(),
      onRateLimit: (windows) => recordRateLimits(deps.db, windows, new Date()),
    });
    // The first organization is the person's own. Choosing another one comes later.
    const organization = account.organizations[0];
    if (!organization) return fail("no_organization");

    const user = await upsertUserFromAccount(deps.db, account);
    // Cached pages that show this person (invite pages) must show the new name and avatar.
    revalidateTag(userTag(user.id), { expire: 0 });
    const { previousRefreshToken } = await saveGrant(deps, {
      userId: user.id,
      organizationId: organization.id,
      tokens,
      requestedScopes: getRequestedScopes(),
    });
    if (previousRefreshToken) {
      // Connecting again creates a separate grant at Buffer; end the old one.
      after(() =>
        revokeToken({
          client: deps.client,
          token: previousRefreshToken,
          tokenTypeHint: "refresh_token",
        }).catch((error: unknown) => console.warn("Could not revoke the old Buffer grant", error)),
      );
    }

    // A fresh session ID on every sign-in; the old one, if any, stops working.
    const oldSessionId = request.cookies.get(SESSION_COOKIE)?.value;
    if (oldSessionId) await deleteSession(deps.db, oldSessionId);
    const session = await createSession(deps.db, user.id, new Date());

    try {
      await syncChannels(deps, user.id);
    } catch (error) {
      // Not fatal: the channel page shows a retry button.
      console.warn("Channel sync after connect failed", error);
    }

    const destination = saved.next ?? "/settings/channels?connected=1";
    const response = NextResponse.redirect(new URL(destination, request.url), 303);
    response.cookies.set(SESSION_COOKIE, session.sessionId, {
      ...secureCookie,
      maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    });
    response.cookies.delete({ name: OAUTH_STATE_COOKIE, ...secureCookie });
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof MissingEnvError) {
      console.error("Buffer connect is not configured", error.variable);
      return fail("not_configured");
    }
    if (error instanceof BufferOAuthError) {
      console.warn("Buffer token exchange failed", error.code, error.status);
      return fail(error.isInvalidGrant ? "expired" : "buffer_error");
    }
    if (error instanceof BufferRateLimitError) return fail("busy");
    console.error("Buffer connect failed", error);
    return fail("unexpected");
  }
}
