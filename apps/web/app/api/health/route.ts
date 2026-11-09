import { sql } from "@daydeck/db";
import { connection } from "next/server";
import { getDb } from "@/server/db";
import { env } from "@/server/env";

// Liveness check for uptime monitors: reports whether the database answers.
export async function GET() {
  // Always run at request time; with Cache Components a GET handler is otherwise prerendered.
  await connection();

  if (!env.DATABASE_URL) {
    return Response.json({ ok: false, database: "not configured" }, { status: 503 });
  }

  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true, database: "up" });
  } catch (error) {
    console.error("Health check: database query failed", error);
    return Response.json({ ok: false, database: "down" }, { status: 503 });
  }
}
