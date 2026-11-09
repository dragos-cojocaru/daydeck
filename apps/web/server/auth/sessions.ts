// Database sessions. The browser keeps a random 32-byte session ID in an httpOnly cookie;
// the database keeps only its SHA-256 hash. Sessions last 30 days and slide forward with use.
import { createHash, randomBytes } from "node:crypto";
import { type Database, eq, schema, type User } from "@daydeck/db";

const { sessions, users } = schema;

export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

// Extend a session only when less than half its lifetime is left, to avoid a write per request.
const RENEW_BELOW_MS = SESSION_LIFETIME_MS / 2;

export function generateSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionId(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex");
}

export async function createSession(
  db: Database,
  userId: string,
  now: Date,
): Promise<{ sessionId: string; expiresAt: Date }> {
  const sessionId = generateSessionId();
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
  await db.insert(sessions).values({ idHash: hashSessionId(sessionId), userId, expiresAt });
  return { sessionId, expiresAt };
}

export interface ValidSession {
  user: User;
  expiresAt: Date;
}

/** Returns the session's user, or null when the session is unknown or expired. */
export async function validateSession(
  db: Database,
  sessionId: string,
  now: Date,
): Promise<ValidSession | null> {
  const idHash = hashSessionId(sessionId);
  const [row] = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.idHash, idHash));
  if (!row) return null;

  if (row.expiresAt.getTime() <= now.getTime()) {
    await db.delete(sessions).where(eq(sessions.idHash, idHash));
    return null;
  }

  if (row.expiresAt.getTime() - now.getTime() < RENEW_BELOW_MS) {
    const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.idHash, idHash));
    return { user: row.user, expiresAt };
  }
  return { user: row.user, expiresAt: row.expiresAt };
}

export async function deleteSession(db: Database, sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.idHash, hashSessionId(sessionId)));
}
