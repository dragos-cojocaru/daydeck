import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

// A signed-in browser. The cookie holds a random 32-byte ID; this table holds only its
// SHA-256 hash, so a database leak does not leak working sessions.
export const sessions = pgTable(
  "sessions",
  {
    idHash: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  // By user for sign-out and deletes; by expiry for the daily purge.
  (table) => [index().on(table.userId), index("sessions_expires_idx").on(table.expiresAt)],
);

export type Session = typeof sessions.$inferSelect;
