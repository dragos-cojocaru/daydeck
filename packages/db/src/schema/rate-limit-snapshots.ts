import { integer, pgTable, timestamp } from "drizzle-orm/pg-core";

// The latest numbers from Buffer's RateLimit headers, one row per window. The limits belong to
// the app client, so every participant shares them. Windows are 900 (15 minutes),
// 86,400 (24 hours) and 2,592,000 (30 days) seconds.
export const rateLimitSnapshots = pgTable("rate_limit_snapshots", {
  windowSeconds: integer().primaryKey(),
  quota: integer().notNull(),
  remaining: integer().notNull(),
  resetAt: timestamp({ withTimezone: true }).notNull(),
  capturedAt: timestamp({ withTimezone: true }).notNull(),
});

export type RateLimitSnapshot = typeof rateLimitSnapshots.$inferSelect;
