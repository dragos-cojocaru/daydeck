import { boolean, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/** One day of a channel's posting schedule, as Buffer returns it. Times are "HH:MM". */
export interface PostingScheduleDay {
  day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  paused: boolean;
  times: string[];
}

// A cache of the user's Buffer channels, for the channel picker, channel health and
// "Plan my week". Synced at connect, daily, and when the user asks.
export const channels = pgTable(
  "channels",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bufferChannelId: text().notNull(),
    organizationId: text().notNull(),
    /** The social network, for example "linkedin" or "bluesky". */
    service: text().notNull(),
    name: text().notNull(),
    displayName: text(),
    avatarUrl: text(),
    timezone: text().notNull(),
    isDisconnected: boolean().notNull().default(false),
    isQueuePaused: boolean().notNull().default(false),
    isLocked: boolean().notNull().default(false),
    postingSchedule: jsonb().$type<PostingScheduleDay[]>().notNull().default([]),
    /** The user picked this channel to count for their challenges. Prefills the join flow. */
    selected: boolean().notNull().default(false),
    syncedAt: timestamp({ withTimezone: true }).notNull(),
  },
  // The unique index starts with user_id, so it also serves "all channels of a user".
  (table) => [unique().on(table.userId, table.bufferChannelId)],
);

export type Channel = typeof channels.$inferSelect;
