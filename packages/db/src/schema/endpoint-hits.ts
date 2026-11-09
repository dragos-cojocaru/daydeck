import { index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

// Counters for the rate limits on Daydeck's own endpoints (per person and per IP address).
// One row per key and fixed window; old windows are deleted by the daily purge.
export const endpointHits = pgTable(
  "endpoint_hits",
  {
    /** For example "save:user:<id>" or "oauth:ip:<hash>". Never a raw IP address. */
    key: text().notNull(),
    windowStart: timestamp({ withTimezone: true }).notNull(),
    count: integer().notNull().default(0),
  },
  // The key leads, for each hit; the window alone is for the daily purge of old counters.
  (table) => [
    primaryKey({ columns: [table.key, table.windowStart] }),
    index("endpoint_hits_window_idx").on(table.windowStart),
  ],
);
