import { buildAuthorizationUrl, createPkcePair, createState } from "@daydeck/buffer";
import { connection, type NextRequest, NextResponse } from "next/server";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE_SECONDS,
  secureCookie,
} from "@/server/auth/cookies";
import { safeNextPath } from "@/server/auth/next-path";
import { sealOAuthState } from "@/server/auth/oauth-state";
import { getOAuthClient, getRequestedScopes } from "@/server/buffer/config";
import { getKeyring } from "@/server/crypto/keyring";
import { getDb } from "@/server/db";
import { MissingEnvError } from "@/server/env";
import { hit, ipKey, RULES } from "@/server/security/rate-limit";

// Step 1 of connecting Buffer: remember a fresh state and PKCE verifier in an encrypted cookie,
// then send the browser to Buffer's consent screen.
export async function GET(request: NextRequest) {
  await connection();
  const limited = await hit(getDb(), await ipKey("oauthStart"), RULES.oauthStart, new Date());
  if (!limited.ok)
    return NextResponse.redirect(new URL("/connect?error=too_many", request.url), 303);
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));

  try {
    const client = getOAuthClient();
    const state = createState();
    const { verifier, challenge } = createPkcePair();
    const authorizationUrl = buildAuthorizationUrl({
      client,
      state,
      codeChallenge: challenge,
      scopes: getRequestedScopes(),
    });

    const response = NextResponse.redirect(authorizationUrl, 303);
    response.cookies.set(
      OAUTH_STATE_COOKIE,
      sealOAuthState(getKeyring(), { state, verifier, next, issuedAt: Date.now() }),
      { ...secureCookie, maxAge: OAUTH_STATE_MAX_AGE_SECONDS },
    );
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) {
    if (!(error instanceof MissingEnvError)) throw error;
    console.error("Buffer connect is not configured", error.variable);
    return NextResponse.redirect(new URL("/connect?error=not_configured", request.url), 303);
  }
}
