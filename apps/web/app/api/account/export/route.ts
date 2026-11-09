import { exportMyData } from "@/server/account/export";
import { getCurrentSession } from "@/server/auth/current-user";
import { getDb } from "@/server/db";
import { limitUser } from "@/server/security/rate-limit";

const PRIVATE = { "Cache-Control": "no-store" };

// "Download a copy" on the Your data page: everything Daydeck keeps about the signed-in person,
// as a JSON file. Their own rows only; never tokens or other people's messages.
export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return Response.json(
      { message: "Your session ended. Connect Buffer again to download your data." },
      { status: 401, headers: PRIVATE },
    );
  }
  const db = getDb();
  const limited = await limitUser(db, "exportData", session.user.id);
  if (limited) {
    return Response.json(
      { message: limited },
      { status: 429, headers: { ...PRIVATE, "Retry-After": "3600" } },
    );
  }
  const now = new Date();
  const data = await exportMyData(db, session.user.id, now);
  if (!data)
    return Response.json({ message: "No account found." }, { status: 404, headers: PRIVATE });
  const name = `daydeck-data-${now.toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      ...PRIVATE,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
