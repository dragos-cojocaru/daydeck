import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { withVerifiedTls } from "./connection-url";
import * as schema from "./schema";

/**
 * The Drizzle database type the app codes against. Production uses node-postgres; tests use
 * PGlite (Postgres compiled to WebAssembly, running in-process). Both fit this type.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

/** A transaction handle, as passed to `db.transaction(async (tx) => ...)`. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

// node-postgres over TCP with a connection pool. It works with Neon, a local Postgres and CI,
// and supports interactive transactions with row locks (SELECT ... FOR UPDATE), which the
// token refresh needs. On Vercel, the web app hands the pool to attachDatabasePool().
export function createDb(databaseUrl: string) {
  const pool = new Pool({
    connectionString: withVerifiedTls(databaseUrl),
    max: 5,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
  });
  const db = drizzle({ client: pool, schema, casing: "snake_case" });
  return { db: db as Database, pool };
}
