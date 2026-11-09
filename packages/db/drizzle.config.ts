import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Local runs read the same env file as the Next.js app.
const appEnv = new URL("../../apps/web/.env.local", import.meta.url).pathname;
if (!process.env.DATABASE_URL && existsSync(appEnv)) process.loadEnvFile(appEnv);

// Migrations are generated into ./drizzle and committed.
// Every deployment applies them before `next build` (see scripts/migrate.ts).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: {
    // `||`, not `??`: a copied .env.example leaves DATABASE_URL_UNPOOLED as an empty string.
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "",
  },
  strict: true,
  verbose: true,
});
