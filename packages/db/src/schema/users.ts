import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// One row per connected Buffer account. Email is not stored at connect: it is only kept
// if the person turns on email alerts (Phase 5).
export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  bufferAccountId: text().notNull().unique(),
  name: text(),
  email: text(),
  avatarUrl: text(),
  /** IANA time zone name, such as "Europe/Bucharest". Defaults to the Buffer account's. */
  timezone: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type User = typeof users.$inferSelect;
