import "server-only";
import { createDb, type Database } from "@daydeck/db";
import { attachDatabasePool } from "@vercel/functions";
import { requireEnv } from "./env";

// Shared across hot reloads in development, so each edit does not open a new pool.
const globalForDb = globalThis as unknown as { daydeckDb?: Database };

/** The shared Drizzle client. Created on first use, so builds work without DATABASE_URL. */
export function getDb(): Database {
  if (!globalForDb.daydeckDb) {
    const { db, pool } = createDb(requireEnv("DATABASE_URL"));
    // On Vercel Fluid compute, closes idle connections before an instance is suspended.
    attachDatabasePool(pool);
    globalForDb.daydeckDb = db;
  }
  return globalForDb.daydeckDb;
}
