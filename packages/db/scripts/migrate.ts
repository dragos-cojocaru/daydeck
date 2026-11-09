// Applies committed Drizzle migrations, then creates or updates the starter prompt sets. Runs on
// every Vercel build, before `next build`, against that deployment's own database branch.
import { existsSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { withVerifiedTls } from "../src/connection-url.ts";
import { seedStarterSets } from "../src/seed/starter-sets.ts";

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;

// Local runs read the same env file as the Next.js app.
const appEnv = new URL("../../../apps/web/.env.local", import.meta.url).pathname;
if (!process.env.DATABASE_URL && existsSync(appEnv)) process.loadEnvFile(appEnv);

// `||`, not `??`: a copied .env.example leaves DATABASE_URL_UNPOOLED as an empty string.
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!existsSync(`${migrationsFolder}/meta/_journal.json`)) {
  console.warn("No migrations yet, nothing to apply.");
} else if (!url) {
  throw new Error("DATABASE_URL is not set, so migrations cannot run.");
} else {
  const pool = new Pool({ connectionString: withVerifiedTls(url), max: 1 });
  const db = drizzle({ client: pool });
  await migrate(db, { migrationsFolder });
  await seedStarterSets(db);
  await pool.end();
  console.warn("Migrations applied; starter prompt sets are up to date.");
}
