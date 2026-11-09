import { getCurrentSession } from "@/server/auth/current-user";
import { notificationFeed, notificationSettings } from "@/server/community/live";
import { getDb } from "@/server/db";
import { limitUser } from "@/server/security/rate-limit";

// The notification panel's rows: what is new in each challenge's Community, newest first,
// without the places you turned off, and every challenge's settings for the settings view.
export async function GET() {
  const session = await getCurrentSession();
  if (!session) return new Response(null, { status: 401 });
  const db = getDb();
  if (await limitUser(db, "notifications", session.user.id)) {
    return new Response(null, { status: 429, headers: { "Retry-After": "60" } });
  }
  const [rows, settings] = await Promise.all([
    notificationFeed(db, session.user.id),
    notificationSettings(db, session.user.id),
  ]);
  return Response.json({ rows, settings }, { headers: { "Cache-Control": "no-store" } });
}
