// Test helper: a fresh database with every committed migration applied and the starter prompt
// sets seeded.
//
// By default it is PGlite (Postgres compiled to WebAssembly, in-process), which runs one query
// at a time. Set TEST_DATABASE_URL to a real Postgres (a user that may create databases) to
// run the same tests with real concurrent connections and row locks instead.
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { migrate as migrateNodePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { Client, Pool } from "pg";
import type { Database } from "./client";
import * as schema from "./schema";
import { seedStarterSets } from "./seed/starter-sets";

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;

export interface TestDb {
  db: Database;
  close: () => Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const adminUrl = process.env.TEST_DATABASE_URL;
  return adminUrl ? createPostgresTestDb(adminUrl) : createPgliteTestDb();
}

async function createPgliteTestDb(): Promise<TestDb> {
  const client = new PGlite();
  const db = drizzlePglite({ client, schema, casing: "snake_case" });
  await migratePglite(db, { migrationsFolder });
  await seedStarterSets(db);
  return { db: db as unknown as Database, close: () => client.close() };
}

// A throwaway database per call, dropped again by close().
async function createPostgresTestDb(adminUrl: string): Promise<TestDb> {
  const name = `daydeck_test_${randomBytes(6).toString("hex")}`;
  await runAdmin(adminUrl, `create database ${name}`);

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString(), max: 5 });
  const db = drizzleNodePg({ client: pool, schema, casing: "snake_case" });
  await migrateNodePg(db, { migrationsFolder });
  await seedStarterSets(db);

  return {
    db: db as Database,
    close: async () => {
      await pool.end();
      await runAdmin(adminUrl, `drop database ${name} with (force)`);
    },
  };
}

async function runAdmin(adminUrl: string, statement: string): Promise<void> {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(statement);
  } finally {
    await admin.end();
  }
}
