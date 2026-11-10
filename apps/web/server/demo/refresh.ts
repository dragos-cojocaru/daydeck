import "server-only";
import { type Database, eq, schema } from "@daydeck/db";
import { type Queryable, type TickResult, tickDemo } from "@daydeck/db/demo";
import { localDateOf } from "@/lib/day-engine";

// Keeps the demo challenge lively until DEMO_UNTIL: its sample members post, chat, share and
// give feedback (packages/db/src/demo.ts). Run every 30 minutes by the "demo-refresh" job.

export type RefreshResult =
  | { status: "off" | "ended" | "missing" }
  | ({ status: "ticked" } & TickResult);

export type DemoSettings = {
  /** DEMO_INVITE_CODE: which challenge is the demo. Without it, nothing runs. */
  inviteCode?: string | undefined;
  /** DEMO_UNTIL: the last day (YYYY-MM-DD, UTC) the demo stays lively. */
  until?: string | undefined;
};

export async function refreshDemo(
  db: Database,
  now: Date,
  { inviteCode, until }: DemoSettings,
): Promise<RefreshResult> {
  if (!inviteCode) return { status: "off" };
  if (until && localDateOf(now, "UTC") > until) return { status: "ended" };
  const [row] = await db
    .select({ id: schema.challenges.id })
    .from(schema.challenges)
    .where(eq(schema.challenges.inviteCode, inviteCode));
  if (!row) return { status: "missing" };
  // The same connection pool the app uses, for the plain SQL the demo is written in.
  const client = (db as unknown as { $client: Queryable }).$client;
  return { status: "ticked", ...(await tickDemo(client, { now, challengeId: row.id })) };
}
