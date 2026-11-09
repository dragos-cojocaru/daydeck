import { type NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_MAX_AGE_SECONDS,
  secureCookie,
} from "@/server/auth/cookies";

// An optimistic check only: it sends people without a session cookie to the connect page
// before any rendering. Pages still validate the session against the database.
export function proxy(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;

  if (!sessionId) {
    // Visitors read the guide on its public page, with the site header instead of the sidebar.
    if (request.nextUrl.pathname === "/guide") {
      return NextResponse.redirect(new URL("/how-it-works", request.url));
    }
    const connect = new URL("/connect", request.url);
    connect.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(connect);
  }

  // Slide the cookie's expiry with use, matching the database session's 30 days.
  const response = NextResponse.next();
  if (request.method === "GET") {
    response.cookies.set(SESSION_COOKIE, sessionId, {
      ...secureCookie,
      maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    });
  }
  return response;
}

export const config = {
  // Signed-in areas only. Later phases add their routes here.
  matcher: ["/settings/:path*", "/challenges/:path*", "/challenges", "/guide"],
};
