import { getCurrentSession } from "@/server/auth/current-user";
import { liveSnapshot } from "@/server/community/live";
import { getDb } from "@/server/db";
import { limitUser } from "@/server/security/rate-limit";

// The fallback for the live stream (/api/live), and the quick update right after you read a
// place: unread counts, change counters, last checks and mutes of all your challenges.
export async function GET() {
  const session = await getCurrentSession();
  if (!session) return new Response(null, { status: 401 });
  const db = getDb();
  if (await limitUser(db, "live", session.user.id)) {
    return new Response(null, { status: 429, headers: { "Retry-After": "60" } });
  }
  const snapshot = await liveSnapshot(db, session.user.id);
  return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
