import "server-only";
import { type BufferConnection, eq, schema, type User } from "@daydeck/db";
import type { Route } from "next";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { getDb } from "../db";
import { env } from "../env";
import { SESSION_COOKIE } from "./cookies";
import { type ValidSession, validateSession } from "./sessions";

/**
 * The signed-in user for this request, or null. Reads the session cookie, so any component
 * that calls it must sit inside a <Suspense> boundary. Cached for the length of one request.
 */
export const getCurrentSession = cache(async (): Promise<ValidSession | null> => {
  const sessionId = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sessionId || !env.DATABASE_URL) return null;
  // Validation compares the expiry with the current time and may extend the session, so it
  // must run for the real request, never in a prefetch prerender.
  await connection();
  return validateSession(getDb(), sessionId, new Date());
});

/**
 * Like getCurrentSession, but a database failure reads as "signed out". For page chrome such as
 * the header, which must never take a page down. Errors Next.js uses for control flow (for
 * example to stop a prerender at the cookie read) are passed on untouched.
 */
export async function getCurrentSessionOrNull(): Promise<ValidSession | null> {
  try {
    return await getCurrentSession();
  } catch (error) {
    unstable_rethrow(error);
    console.error("Could not read the session", error);
    return null;
  }
}

/** The signed-in user, or a redirect to the connect page that comes back to `returnTo`. */
export async function requireUser(returnTo: string): Promise<User> {
  const session = await getCurrentSession();
  if (!session) redirect(`/connect?next=${encodeURIComponent(returnTo)}` as Route);
  return session.user;
}

export type ConnectionSummary = Pick<
  BufferConnection,
  "status" | "reconnectReason" | "organizationId" | "scopes"
>;

/** The user's Buffer connection, without any token fields. */
export const getConnectionSummary = cache(
  async (userId: string): Promise<ConnectionSummary | null> => {
    const { bufferConnections } = schema;
    const [row] = await getDb()
      .select({
        status: bufferConnections.status,
        reconnectReason: bufferConnections.reconnectReason,
        organizationId: bufferConnections.organizationId,
        scopes: bufferConnections.scopes,
      })
      .from(bufferConnections)
      .where(eq(bufferConnections.userId, userId));
    return row ?? null;
  },
);
