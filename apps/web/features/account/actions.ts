"use server";

import { cookies } from "next/headers";
import { SESSION_COOKIE, secureCookie } from "@/server/auth/cookies";
import { deleteSession } from "@/server/auth/sessions";
import { getDb } from "@/server/db";

/**
 * Ends this browser's session. The Buffer connection stays, so signing in again is one click.
 * The caller then loads the start page in full (see SignOutButton).
 */
export async function signOut(): Promise<void> {
  const store = await cookies();
  const sessionId = store.get(SESSION_COOKIE)?.value;
  if (sessionId) await deleteSession(getDb(), sessionId);
  store.delete({ name: SESSION_COOKIE, ...secureCookie });
}
