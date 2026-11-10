// The demo challenge from the command line. The work is in src/demo.ts, which the app's
// "demo-refresh" job also runs every 30 minutes, so the demo stays current on its own.
//
//   pnpm --filter @daydeck/db demo:seed     creates it if needed and brings it up to now
//   pnpm --filter @daydeck/db demo:remove   closes it and removes the sample members
//
// It uses DATABASE_URL, or apps/web/.env.local when that is not set, and prints which database
// it is about to change. DEMO_INVITE_CODE picks an existing demo; DEMO_HOST_BUFFER_ACCOUNT_ID
// hosts a new one from a real account (it must have signed in once).
import { existsSync } from "node:fs";
import pg from "pg";
import { withVerifiedTls } from "../src/connection-url.ts";
import { DEMO_TITLE, ensureDemo, findDemo, removeDemo, tickDemo } from "../src/demo.ts";

const appEnv = new URL("../../../apps/web/.env.local", import.meta.url).pathname;
if (!process.env.DATABASE_URL && existsSync(appEnv)) process.loadEnvFile(appEnv);
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set.");

const command = process.argv[2] ?? "seed";
if (command !== "seed" && command !== "remove") throw new Error('Use "seed" or "remove".');

const pool = new pg.Pool({ connectionString: withVerifiedTls(url), max: 1 });
const client = await pool.connect();
const now = new Date();
console.warn(`Database: ${new URL(url).host}`);

try {
  await client.query("begin");
  const inviteCode = process.env.DEMO_INVITE_CODE || undefined;
  if (command === "remove") {
    const found = await findDemo(client, { inviteCode });
    const { removed } = await removeDemo(client, { now, challengeId: found?.id ?? null });
    await client.query("commit");
    console.warn(`Demo closed. Removed ${removed} sample members.`);
  } else {
    const demo = await ensureDemo(client, {
      now,
      inviteCode,
      hostBufferAccountId: process.env.DEMO_HOST_BUFFER_ACCOUNT_ID || undefined,
    });
    const { changes } = await tickDemo(client, { now, challengeId: demo.id });
    await client.query("commit");
    console.warn(
      `${demo.created ? "Demo created" : "Demo up to date"}: "${DEMO_TITLE}" (${changes} changes)`,
    );
    console.warn(`Invite link path: /c/${demo.inviteCode}`);
    console.warn(`Set DEMO_INVITE_CODE=${demo.inviteCode}`);
  }
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}
